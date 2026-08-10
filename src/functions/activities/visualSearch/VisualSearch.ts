import { BaseActivity } from '../BaseActivity'

import type { ParsedOffer, StreakState } from '../../../browser/ReactFunc'
import type { DashboardData } from '../../../interface/DashboardData'
import { VisualSearchBrowser } from './VisualSearchBrowser'

const VISUAL_SEARCH_ACTIVATION_OFFER = 'visualsearch_streak_activation_v2'

// 11 is confirmed for the July banner and carried over to the v2 offer, verify before trusting it there
const VERIFIED_ACTIVITY_TYPES = new Map<string, number>([
    ['ww_visualsearch_summerjuly26_activation_banner', 11],
    ['visualsearch_streak_activation_v2', 11]
])

const MAX_ATTEMPTS = 4
const MAX_ACQUISITION_FAILURES_PER_ATTEMPT = 3
const REGISTRATION_CHECKS = 3

type ActivationResult = 'activated' | 'already-active' | 'absent' | 'failed'

interface ActivationMetadata {
    activityType: number
    activityTypeSource: 'react' | 'dashboard' | 'verified-fallback'
    isPromotional: boolean
}

export class VisualSearch extends BaseActivity {
    private readonly browserFlow = new VisualSearchBrowser(this.bot)

    public async doVisualSearch(data: DashboardData): Promise<number> {
        if (this.bot.isMobile) {
            this.bot.logger.debug(this.bot.isMobile, 'VISUAL-SEARCH', 'Skipping on mobile - desktop-only activity')
            return 0
        }

        const streak = this.findStreak()
        this.logStreakState(streak)

        if (streak?.isCurrentDayCompleted) {
            this.bot.logger.info(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Already completed today | visualSearchStreak=${streak.completedDays}/${streak.totalDays}`,
                'green'
            )
            return 0
        }

        const activation = await this.activate(data)

        const available = !!streak || activation === 'activated' || activation === 'already-active'
        if (!available) {
            this.bot.logger.info(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                'Visual search not available for this account, skipping'
            )
            return 0
        }

        return await this.performDailySearch()
    }

    private findStreak(streaks?: StreakState[]): StreakState | undefined {
        const source = streaks ?? this.bot.reactSnapshot?.streaks ?? []
        return source.find(s => /visual.?search/i.test(s.partner))
    }

    private logStreakState(streak: StreakState | undefined): void {
        if (!streak) {
            this.bot.logger.info(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                'No visual-search streak in the snapshot - falling back to the activation offer'
            )
            return
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'VISUAL-SEARCH',
            `Streak state | partner="${streak.partner}" | enabled=${streak.isEnabled} | dayCompleted=${streak.isCurrentDayCompleted} | days=${streak.completedDays}/${streak.totalDays} | currentDay=${streak.currentDay} | activities=${streak.activitiesCompleted}/${streak.activitiesTotal}`
        )

        if (!streak.isEnabled) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                'Streak is present but not enabled - searches will not register until it is switched on'
            )
        }
    }

    private async activate(data: DashboardData): Promise<ActivationResult> {
        const offer = this.findActivationOffer()
        if (!offer) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                'No visual-search activation offer present on the dashboard'
            )
            return 'absent'
        }

        if (!offer.reportable) {
            this.bot.logger.info(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Visual search already active (or not activatable) | offerId=${offer.offerId}`,
                'green'
            )
            return 'already-active'
        }

        if (!offer.hash) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Activation offer present but missing a hash | offerId=${offer.offerId}`
            )
            return 'failed'
        }

        const actionId = this.bot.nextActions.reportActivity
        if (!actionId) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                'Skipping activation: "reportActivity" action id not discovered in bundle'
            )
            return 'failed'
        }

        const dashboard = await this.resolveDashboard(data)
        const metadata = this.resolveActivationMetadata(offer, dashboard)
        if (!metadata) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Skipping activation: no valid activity type found | offerId=${offer.offerId}`
            )
            return 'failed'
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'VISUAL-SEARCH',
            `Activating visual search | offerId=${offer.offerId} | activityType=${metadata.activityType} | activityTypeSource=${metadata.activityTypeSource} | promotional=${metadata.isPromotional} | geo=${this.bot.userData.geoLocale}`
        )

        try {
            const { status, acknowledged } = await this.bot.browser.func.reportServerAction(actionId, [
                offer.hash,
                metadata.activityType,
                {
                    offerid: offer.offerId,
                    isPromotional: metadata.isPromotional ? 'true' : '$undefined',
                    timezoneOffset: this.bot.userData.timezoneOffset
                }
            ])

            if (acknowledged) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `Activated visual search | offerId=${offer.offerId}`,
                    'green'
                )
                await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 10000))
                return 'activated'
            }

            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Activation not acknowledged | offerId=${offer.offerId} | status=${status}`
            )
            return 'failed'
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Activation error | offerId=${offer.offerId} | ${error instanceof Error ? error.message : String(error)}`
            )
            return 'failed'
        }
    }

    private async resolveDashboard(fallback: DashboardData): Promise<DashboardData> {
        try {
            return await this.bot.browser.func.getDashboardData(this.bot.cookies.desktop)
        } catch {
            this.bot.logger.debug(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                'Desktop dashboard fetch failed - falling back to the dashboard from the mobile pass'
            )
            return fallback
        }
    }

    private resolveActivationMetadata(offer: ParsedOffer, data: DashboardData): ActivationMetadata | null {
        const dashboardPromotion = this.findDashboardPromotion(data.dashboard, offer.offerId)

        if (offer.activityType !== null) {
            return {
                activityType: offer.activityType,
                activityTypeSource: 'react',
                isPromotional: offer.isPromotional || this.dashboardPromotionIsPromotional(dashboardPromotion)
            }
        }

        const dashboardActivityType = this.dashboardPromotionActivityType(dashboardPromotion)
        if (dashboardActivityType !== null) {
            return {
                activityType: dashboardActivityType,
                activityTypeSource: 'dashboard',
                isPromotional: offer.isPromotional || this.dashboardPromotionIsPromotional(dashboardPromotion)
            }
        }

        const verifiedFallback = VERIFIED_ACTIVITY_TYPES.get(offer.offerId.toLowerCase())
        if (verifiedFallback !== undefined) {
            return {
                activityType: verifiedFallback,
                activityTypeSource: 'verified-fallback',
                isPromotional: offer.isPromotional || this.dashboardPromotionIsPromotional(dashboardPromotion)
            }
        }

        return null
    }

    private findDashboardPromotion(root: unknown, offerId: string): Record<string, unknown> | null {
        const target = offerId.toLowerCase()
        const pending: unknown[] = [root]
        const visited = new Set<object>()

        while (pending.length) {
            const value = pending.pop()
            if (!value || typeof value !== 'object' || visited.has(value)) continue
            visited.add(value)

            if (Array.isArray(value)) {
                for (const entry of value) pending.push(entry)
                continue
            }

            const record = value as Record<string, unknown>
            const attributes = this.asRecord(record.attributes)
            const candidateId = record.offerId ?? record.offerid ?? attributes?.offerid
            if (typeof candidateId === 'string' && candidateId.toLowerCase() === target) return record

            for (const entry of Object.values(record)) pending.push(entry)
        }

        return null
    }

    private dashboardPromotionActivityType(promotion: Record<string, unknown> | null): number | null {
        if (!promotion) return null
        const attributes = this.asRecord(promotion.attributes)
        return this.parseActivityType(
            promotion.activityType ?? promotion.activity_type ?? attributes?.activityType ?? attributes?.activity_type
        )
    }

    private dashboardPromotionIsPromotional(promotion: Record<string, unknown> | null): boolean {
        if (!promotion) return false
        const attributes = this.asRecord(promotion.attributes)
        const value = promotion.isPromotional ?? promotion.promotional ?? attributes?.promotional
        return value === true || (typeof value === 'string' && value.toLowerCase() === 'true')
    }

    private parseActivityType(value: unknown): number | null {
        const parsed = Number(value)
        return Number.isInteger(parsed) && parsed > 0 ? parsed : null
    }

    private asRecord(value: unknown): Record<string, unknown> | null {
        return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
    }

    private findActivationOffer(): ParsedOffer | null {
        const offers = this.bot.reactSnapshot?.offers ?? []

        const exact = offers.find(o => o.offerId === VISUAL_SEARCH_ACTIVATION_OFFER)
        if (exact) return exact

        return (
            offers.find(o => {
                const id = o.offerId.toLowerCase()
                return id.includes('visualsearch') && id.includes('activation')
            }) ?? null
        )
    }

    private async performDailySearch(): Promise<number> {
        const seenBcids = new Set<string>()
        const candidateSeeds = await this.browserFlow.getSeedUrls()

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            const visual = await this.acquireFreshVisualSearch(seenBcids, candidateSeeds, attempt)
            if (!visual) {
                await this.bot.utils.wait(this.bot.utils.randomDelay(3000, 6000))
                continue
            }

            const res = await this.browserFlow.report(visual)

            if (res.balance != null) this.bot.userData.currentPoints = res.balance

            const gained = res.gained ?? 0
            if (gained >= 5) {
                this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + gained
                this.bot.logger.info(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `Daily visual search done | pointsGained=${gained} | currentBalance=${res.balance} | query="${visual.query}"`,
                    'green'
                )
                return gained
            }

            if (await this.waitForDayRegistration()) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `Daily visual search registered | pointsGained=0 (streak pays out on milestones) | query="${visual.query}"`,
                    'green'
                )
                return 0
            }

            if (res.acknowledged) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `Visual search was reported but not credited (attempt ${attempt}/${MAX_ATTEMPTS}) | query="${visual.query}"`
                )
            } else {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `No reportActivity acknowledgement (attempt ${attempt}/${MAX_ATTEMPTS}) | query="${visual.query}"`
                )
            }

            await this.bot.utils.wait(this.bot.utils.randomDelay(3000, 6000))
        }

        this.bot.logger.warn(
            this.bot.isMobile,
            'VISUAL-SEARCH',
            `Daily visual search did not credit after ${MAX_ATTEMPTS} attempts`
        )
        return 0
    }

    // bcid is derived from the image bytes, so a repeated seed produces a blob bing already credited
    private async acquireFreshVisualSearch(
        seen: Set<string>,
        candidateSeeds: string[],
        attempt: number
    ): Promise<{ bcid: string; query: string; serpUrl: string } | null> {
        let acquisitionFailures = 0

        while (candidateSeeds.length) {
            const seed = candidateSeeds.shift()
            if (!seed) continue

            const visual = await this.browserFlow.acquire(seed)
            if (!visual) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `Could not obtain a visual search from one candidate (attempt ${attempt}/${MAX_ATTEMPTS})`
                )
                acquisitionFailures++
                if (acquisitionFailures >= MAX_ACQUISITION_FAILURES_PER_ATTEMPT) return null
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

        this.bot.logger.warn(
            this.bot.isMobile,
            'VISUAL-SEARCH',
            `No unused visual-search seed remains (attempt ${attempt}/${MAX_ATTEMPTS})`
        )
        return null
    }

    private async waitForDayRegistration(): Promise<boolean> {
        for (let check = 1; check <= REGISTRATION_CHECKS; check++) {
            if (check > 1) {
                await this.bot.utils.wait(this.bot.utils.randomDelay(2000, 4000))
            }
            if (await this.dayRegistered()) return true
        }

        return false
    }

    private async dayRegistered(): Promise<boolean> {
        const snapshot = await this.bot.browser.func.refreshEarnSnapshot()
        if (!snapshot) return false

        const streak = this.findStreak(snapshot.streaks)
        if (!streak) return false
        if (streak.isCurrentDayCompleted) return true

        this.bot.logger.debug(
            this.bot.isMobile,
            'VISUAL-SEARCH',
            `Streak still open after reporting | days=${streak.completedDays}/${streak.totalDays} | activities=${streak.activitiesCompleted}/${streak.activitiesTotal}`
        )
        return false
    }
}
