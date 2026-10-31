import { pointDelta } from '../PointAccounting'
import { activationSnapshots, streakActivationTarget } from '../ActivationMetadata'
import { activityResult, activityFailure, type ActivityResult } from '../ActivityResult'
import { activationOutcome, activationActivity } from '../ActivationOutcome'
import { BaseActivity } from '../activities/BaseActivity'
import type { StreakState } from '../parsers/RewardsPageParser'
import type { RewardsState } from '../../types/RewardsState'
import { SearchProgress } from '../search/SearchProgress'
import { isTerminalHttpError } from '../../../network/HttpError'
import type { ActivationTarget, ActivationResult, VisualSearchCandidate } from '../../types/VisualSearchTypes'

const VISUAL_SEARCH_ACTIVATION_OFFER = 'visualsearch_streak_activation_v2'
const MAX_ATTEMPTS = 4
const MAX_ACQUISITION_FAILURES_PER_ATTEMPT = 3
const REGISTRATION_CHECKS = 3

export class VisualSearch extends BaseActivity {
    private attemptLimit = MAX_ATTEMPTS
    private acquisitionLimit = MAX_ACQUISITION_FAILURES_PER_ATTEMPT
    private readonly driver = this.bot.mode.createVisualSearch()
    private activation?: ActivationResult
    private availabilityKnown = false

    async run(data: RewardsState): Promise<number | null> {
        this.activation = undefined
        this.availabilityKnown = false
        try {
            this.bot.signal.throwIfAborted()
            return await this.execute(data)
        } catch (error) {
            this.record(activityFailure(error))
            throw error
        } finally {
            await this.driver.dispose()
        }
    }

    private async execute(data: RewardsState): Promise<number | null> {
        if (this.bot.isMobile) {
            this.record(activityResult('skipped', 'mobile-not-applicable'))
            this.bot.logger.debug(this.bot.isMobile, 'VISUAL-SEARCH', 'Skipping on mobile - desktop-only activity')
            return 0
        }

        const streak = (await this.readStreak()) ?? this.findStreak()
        this.logStreakState(streak)

        if (streak?.isCurrentDayCompleted) {
            this.record(activityResult('skipped', 'already-complete'))
            this.bot.logger.debug(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Already completed today | visualSearchStreak=${streak.completedDays}/${streak.totalDays}`
            )
            return 0
        }

        const activation = await this.activate(data)
        this.activation = activation

        const available =
            streak?.isEnabled === true ||
            activation.status === 'activated' ||
            activation.status === 'already-active' ||
            (activation.status === 'unconfirmed' && activation.attempted && this.driver.reportsOnAcquire)
        if (!available) {
            this.record(activationActivity(activation))
            return 0
        }

        return await this.performDailySearch()
    }

    private findStreak(streaks?: StreakState[]): StreakState | undefined {
        if (streaks) return streaks.find(s => /visual.?search/i.test(s.partner))

        const snapshots = [this.bot.reactSnapshot, this.bot.reactSnapshots.desktop, this.bot.reactSnapshots.mobile]

        for (const snapshot of snapshots) {
            const streak = snapshot?.streaks.find(s => /visual.?search/i.test(s.partner))
            if (streak) return streak
        }

        return undefined
    }

    private logStreakState(streak: StreakState | undefined): void {
        if (!streak) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                'No visual-search streak in the snapshot - falling back to the activation offer'
            )
            return
        }

        this.bot.logger.debug(
            this.bot.isMobile,
            'VISUAL-SEARCH',
            `Streak state | partner="${streak.partner}" | enabled=${streak.isEnabled} | dayCompleted=${streak.isCurrentDayCompleted} | days=${streak.completedDays}/${streak.totalDays} | currentDay=${streak.currentDay} | activities=${streak.activitiesCompleted}/${streak.activitiesTotal} | dailyPoints=${JSON.stringify(streak.dailyPoints)}`
        )

        if (!streak.isEnabled) {
            this.bot.logger.info(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                'Streak is present but not enabled - searches will not register until it is switched on'
            )
        }
    }

    private async activate(data: RewardsState): Promise<ActivationResult> {
        const streak = this.findStreak()
        if (streak?.isEnabled)
            return activationOutcome('already-active', 'already-active', streak.activationOfferId ?? undefined)

        const target = this.findActivationTarget()
        if (!target && !streak && this.availabilityKnown) return activationOutcome('unavailable', 'offer-not-present')
        const offer = target ?? this.driver.fallbackTarget()
        if (!offer) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                'No visual-search activation metadata present in the streak model or generic offers across the current, desktop, or cached mobile Rewards snapshots'
            )
            return activationOutcome(
                'unconfirmed',
                streak && this.availabilityKnown ? 'activation-metadata-missing' : 'activation-data-unavailable'
            )
        }

        if (offer.isCompleted) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Visual search activation offer already completed | offerId=${offer.offerId}`
            )
            return activationOutcome('already-active', 'already-active', offer.offerId)
        }

        if (offer.isLocked) {
            this.bot.logger.info(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Activation offer is locked | offerId=${offer.offerId}`
            )
            return activationOutcome('unavailable', 'offer-locked', offer.offerId)
        }

        if (offer.date && Date.parse(offer.date) > Date.now())
            return activationOutcome('unavailable', 'offer-not-yet-available', offer.offerId)

        return this.driver.activate(offer, data, offerId => this.confirmActivation(offerId))
    }

    private async confirmActivation(offerId: string): Promise<boolean | null> {
        try {
            const snapshot = await this.bot.rewards.refreshEarnSnapshot()
            if (!snapshot) return null

            this.bot.reactSnapshot = snapshot

            const streak = this.findStreak(snapshot.streaks)
            const activationOffer = snapshot.offers.find(o => o.offerId === offerId)
            if (streak?.isEnabled === true || activationOffer?.isCompleted === true) return true
            return snapshot.account.availablePoints !== null ? false : null
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Could not verify activation state | offerId=${offerId} | ${error instanceof Error ? error.message : String(error)}`
            )
            return null
        }
    }

    private findActivationTarget(): ActivationTarget | null {
        const snapshots = activationSnapshots(this.bot)

        for (const { source, snapshot } of snapshots) {
            const streak = this.findStreak(snapshot.streaks)
            if (!streak?.activationOfferId) continue

            if (source !== 'current') {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `Activation metadata missing from the current snapshot; using cached ${source} streak snapshot | offerId=${streak.activationOfferId}`
                )
            } else {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `Using visual-search activation metadata from streak model | offerId=${streak.activationOfferId}`
                )
            }

            return streakActivationTarget(streak, 'Visual Search Streak')
        }

        for (const { source, snapshot } of snapshots) {
            const exact = snapshot.offers.find(o => o.offerId === VISUAL_SEARCH_ACTIVATION_OFFER)
            const fuzzy = snapshot.offers.find(o => {
                const id = o.offerId.toLowerCase()
                return id.includes('visualsearch') && id.includes('activation')
            })
            const offer = exact ?? fuzzy
            if (!offer) continue

            if (source !== 'current') {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `Activation offer missing from the current snapshot; using cached ${source} offer snapshot | offerId=${offer.offerId}`
                )
            } else {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `Using visual-search activation metadata from generic offer | offerId=${offer.offerId}`
                )
            }

            return { ...offer, activationSource: 'offer' }
        }

        return null
    }

    private async performDailySearch(): Promise<number | null> {
        const seenBcids = new Set<string>()
        const candidateSeeds = await this.driver.getSeedUrls()
        const beforeStreak = this.findStreak()
        const backgroundActive = this.bot.accountState.backgroundRewardsActive
        const beforePoints = await this.readPointsData()
        let searchesReported = 0

        this.bot.logger.info(
            this.bot.isMobile,
            'VISUAL-SEARCH',
            `Starting daily Visual Search | maxAttempts=${this.attemptLimit} | maxAcquisitionFailuresPerAttempt=${this.acquisitionLimit}`
        )

        for (let attempt = 1; attempt <= this.attemptLimit; attempt++) {
            this.bot.signal.throwIfAborted()

            if (attempt > 1 && (await this.readStreak())?.isCurrentDayCompleted) {
                this.record(activityResult('confirmed', 'day-registration-verified', undefined, null))
                this.bot.logger.success(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `Daily visual search registered before retry | attempt=${attempt}/${this.attemptLimit}`
                )
                return null
            }
            this.bot.logger.info(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Visual Search attempt ${attempt}/${this.attemptLimit}`
            )

            if (!candidateSeeds.length) {
                const replenished = await this.driver.getSeedUrls()
                candidateSeeds.push(...replenished)
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `Refreshed visual-search seed pool | attempt=${attempt}/${this.attemptLimit} | candidates=${candidateSeeds.length}`
                )
            }

            const visual = await this.acquireFreshVisualSearch(seenBcids, candidateSeeds, attempt)
            if (!visual) {
                if (attempt < this.attemptLimit) await this.bot.utils.wait(this.bot.utils.randomDelay(3000, 6000))
                continue
            }

            const res = await this.driver.report(visual)
            searchesReported++

            if (res.balance != null) this.bot.userData.currentPoints = res.balance

            const completedStreak = await this.waitForDayRegistration()
            if (completedStreak) {
                const expectedReward = this.streakReward(beforeStreak, completedStreak)
                const tracker = new SearchProgress(this.bot)
                const beforeQuota = beforePoints
                    ? tracker.calculateMissing(beforePoints.dashboard.userStatus.counters, false)
                    : null
                let afterPoints: RewardsState | null = null
                let pointsGained: number | null = null
                let balanceDelta: number | null = null
                let searchPoints: number | null = null
                let creditedStreakPoints: number | null = null
                for (let check = 1; check <= REGISTRATION_CHECKS; check++) {
                    if (check > 1) await this.bot.utils.wait(2000)
                    afterPoints = await this.readPointsData()
                    pointsGained = null
                    balanceDelta = null
                    searchPoints = null
                    creditedStreakPoints = null
                    if (!beforePoints || !afterPoints) continue
                    balanceDelta = pointDelta(
                        beforePoints.dashboard.userStatus.availablePoints,
                        afterPoints.dashboard.userStatus.availablePoints
                    )
                    const afterQuota = tracker.calculateMissing(afterPoints.dashboard.userStatus.counters, false)
                    searchPoints = beforeQuota ? tracker.gained(beforeQuota, afterQuota) : null
                    if (balanceDelta === 0 && searchPoints === 0) {
                        pointsGained = 0
                        creditedStreakPoints = 0
                    } else if (searchPoints !== null && balanceDelta !== null && balanceDelta >= searchPoints) {
                        const remaining = balanceDelta - searchPoints
                        if (
                            remaining === 0 ||
                            (!backgroundActive &&
                                !this.bot.accountState.backgroundRewardsActive &&
                                expectedReward !== null &&
                                remaining === expectedReward)
                        ) {
                            pointsGained = balanceDelta
                            creditedStreakPoints = remaining
                        }
                    }

                    if (
                        pointsGained !== null &&
                        pointsGained > 0 &&
                        expectedReward !== null &&
                        creditedStreakPoints === expectedReward &&
                        searchPoints !== null &&
                        balanceDelta !== null &&
                        balanceDelta >= searchPoints
                    )
                        break
                }
                this.record({
                    ...activityResult('confirmed', 'day-registration-verified', undefined, pointsGained),
                    pointsKnown: pointsGained !== null
                })
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `Daily visual search registered | pointsGained=${pointsGained ?? 'unknown'}` +
                        ` | currentBalance=${afterPoints?.dashboard.userStatus.availablePoints ?? 'unknown'}` +
                        ` | previousBalance=${beforePoints?.dashboard.userStatus.availablePoints ?? 'unknown'}` +
                        ` | balanceDelta=${balanceDelta ?? 'unknown'} | searchPoints=${searchPoints ?? 'unknown'}` +
                        ` | expectedStreakPoints=${expectedReward ?? 'unknown'}` +
                        ` | backgroundRewardsActive=${backgroundActive || this.bot.accountState.backgroundRewardsActive}` +
                        ` | creditedStreakPoints=${creditedStreakPoints ?? 'unknown'} | query="${visual.query}"`
                )
                return pointsGained
            }

            if (res.acknowledged) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `Visual search was reported but not credited (attempt ${attempt}/${this.attemptLimit}) | query="${visual.query}"`
                )
            } else {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `No reportActivity acknowledgement (attempt ${attempt}/${this.attemptLimit}) | query="${visual.query}"`
                )
            }

            if (attempt < this.attemptLimit) await this.bot.utils.wait(this.bot.utils.randomDelay(3000, 6000))
        }

        const noSearchSubmitted = searchesReported === 0 && !this.driver.reportsOnAcquire
        this.record({
            ...activityResult(
                'unconfirmed',
                searchesReported ? 'day-registration-unconfirmed' : 'search-acquisition-failed'
            ),
            pointsKnown: noSearchSubmitted
        })
        this.bot.logger.warn(
            this.bot.isMobile,
            'VISUAL-SEARCH',
            `status=unconfirmed | Daily visual search was not confirmed | searchesReported=${searchesReported}` +
                ` | candidatesRemaining=${candidateSeeds.length}`
        )
        return noSearchSubmitted ? 0 : null
    }

    private async acquireFreshVisualSearch(
        seen: Set<string>,
        candidateSeeds: string[],
        attempt: number
    ): Promise<VisualSearchCandidate | null> {
        let acquisitionFailures = 0

        while (candidateSeeds.length) {
            this.bot.signal.throwIfAborted()
            const seed = candidateSeeds.shift()
            if (!seed) continue

            const visual = await this.driver.acquire(seed)
            this.bot.signal.throwIfAborted()
            if (!visual) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `Could not obtain a visual search from one candidate (attempt ${attempt}/${this.attemptLimit})`
                )
                acquisitionFailures++
                if (acquisitionFailures >= this.acquisitionLimit) return null
                continue
            }

            if (!seen.has(visual.bcid)) {
                seen.add(visual.bcid)
                return visual
            }

            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Skipping already-tried bcid=${visual.bcid.slice(0, 14)} | candidatesRemaining=${candidateSeeds.length}`
            )
            await this.bot.utils.wait(this.bot.utils.randomDelay(1000, 2000))
        }

        this.bot.logger.debug(
            this.bot.isMobile,
            'VISUAL-SEARCH',
            `Visual-search seed pool exhausted for this attempt; it will be refreshed before retrying` +
                ` | attempt=${attempt}/${this.attemptLimit}`
        )
        return null
    }

    private async waitForDayRegistration(): Promise<StreakState | null> {
        for (let check = 1; check <= REGISTRATION_CHECKS; check++) {
            if (check > 1) {
                await this.bot.utils.wait(this.bot.utils.randomDelay(2000, 4000))
            }
            const streak = await this.readStreak()
            if (streak?.isCurrentDayCompleted) return streak
            if (streak)
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `Streak still open after reporting | days=${streak.completedDays}/${streak.totalDays} | activities=${streak.activitiesCompleted}/${streak.activitiesTotal}`
                )
        }

        return null
    }

    private async readStreak(): Promise<StreakState | undefined> {
        try {
            const snapshot = await this.bot.rewards.refreshEarnSnapshot()
            if (!snapshot) return undefined
            this.bot.reactSnapshot = snapshot
            this.availabilityKnown = snapshot.account.availablePoints !== null
            return this.findStreak(snapshot.streaks)
        } catch (error) {
            this.bot.signal.throwIfAborted()
            if (isTerminalHttpError(error)) throw error
            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Streak verification unavailable | ${error instanceof Error ? error.message : String(error)}`
            )
            return undefined
        }
    }

    private async readPointsData(): Promise<RewardsState | null> {
        try {
            const data = await this.bot.rewards.getDashboardData()
            this.bot.userData.currentPoints = data.dashboard.userStatus.availablePoints
            return data
        } catch (error) {
            this.bot.signal.throwIfAborted()
            if (isTerminalHttpError(error)) throw error
            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Point verification unavailable | ${error instanceof Error ? error.message : String(error)}`
            )
            return null
        }
    }

    private streakReward(before: StreakState | undefined, after: StreakState): number | null {
        if (!before || before.isCurrentDayCompleted || !after.isCurrentDayCompleted) return null
        const day = before.completedDays
        if (
            !Number.isInteger(day) ||
            day < 0 ||
            day >= before.totalDays ||
            !Array.isArray(before.dailyPoints) ||
            before.dailyPoints.length !== before.totalDays ||
            before.totalDays !== after.totalDays ||
            ![day, day + 1, ...(day === before.totalDays - 1 ? [0] : [])].includes(after.completedDays)
        )
            return null
        const points = before.dailyPoints[day]
        return typeof points === 'number' && Number.isFinite(points) && points >= 0 ? points : null
    }

    private record(result: ActivityResult): void {
        this.bot.recordActivity('visual-search', {
            ...result,
            offerId: result.offerId ?? this.activation?.offerId,
            activation: this.activation
        })
    }
}
