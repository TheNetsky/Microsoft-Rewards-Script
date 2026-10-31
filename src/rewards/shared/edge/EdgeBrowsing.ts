import { activationSnapshots, resolveActivationMetadata, streakActivationTarget } from '../ActivationMetadata'
import { readStreak } from '../Streaks'
import { creditedPoints, pointDelta } from '../PointAccounting'
import { activityResult, activityFailure, type ActivityResult } from '../ActivityResult'
import type { Page } from 'patchright'
import { BrowserTaskPage } from '../../../browser/BrowserTaskPage'
import { URLs } from '../../../constants/urls'
import { localeRequestHeaders } from '../../../network/RequestHeaders'
import type { BotContext } from '../../../core/BotContext'
import type { PageSnapshot, ParsedOffer, StreakState } from '../parsers/RewardsPageParser'
import type { AppDashboardData, Promotion } from '../../app/types/AppDashboardData'
import type { RewardsState } from '../../types/RewardsState'
import { BaseActivity } from '../activities/BaseActivity'
import { EdgeBrowsingProgress, type EdgeBrowsingProgressSnapshot } from './EdgeBrowsingProgress'
import { EdgePlatformClient, type EdgeReportResult } from './EdgePlatformClient'
import { ServerActions } from '../http/ServerActions'
import {
    activationOutcome,
    activationActivity,
    activationException,
    type ActivationOutcome
} from '../ActivationOutcome'

const LOG_TAG = 'EDGE-BROWSING'
const PROMOTION_NAME = 'edge_browsing_streak_flight'
const EDGE_BROWSING_ACTIVATION_OFFER = 'edge_flight_1_ww_treatment_eligible'

const VERIFIED_ACTIVITY_TYPES = new Map<string, number>([['edge_flight_1_ww_treatment_eligible', 714]])
const TARGET_DURATION_MINUTES = 30
const DEFAULT_REPORT_INTERVAL_MINUTES = 5
const MIN_REPORT_INTERVAL_MINUTES = 1
const MAX_REPORT_INTERVAL_MINUTES = 30

const REPORT_JITTER_MIN_MS = 5_000
const REPORT_JITTER_MAX_MS = 20_000

interface EdgeBrowsingSettings {
    offerId: string
    activityType: string
    reportIntervalMinutes: number
    promotion: Promotion
}

interface ActivationTarget extends ParsedOffer {
    activationSource: 'streak' | 'offer'
}

export class EdgeBrowsing extends BaseActivity {
    private readonly platform: EdgePlatformClient
    private latestPromotion?: Promotion
    private latestBalance: number | null = null
    private activation?: ActivationOutcome

    constructor(bot: BotContext) {
        super(bot)
        this.platform = new EdgePlatformClient(bot)
    }

    async run(data: RewardsState, signal?: AbortSignal, onActivated?: () => void): Promise<ActivityResult> {
        this.activation = undefined
        const result = await this.execute(data, signal, onActivated)
        return { ...result, activation: this.activation }
    }

    private async execute(data: RewardsState, signal?: AbortSignal, onActivated?: () => void): Promise<ActivityResult> {
        if (signal?.aborted) return activityResult('unconfirmed', 'cancelled')
        const accessToken = this.bot.accessTokens.desktop
        if (!accessToken) {
            this.bot.logger.warn(this.bot.isMobile, LOG_TAG, 'Skipping: desktop access token is unavailable')
            return activityResult('unconfirmed', 'desktop-token-unavailable')
        }

        try {
            let profile = await this.platform.getProfile(accessToken)
            if (signal?.aborted) return activityResult('unconfirmed', 'cancelled')

            if (!this.findPromotion(profile)) {
                const activation = await this.activate(data, signal)
                this.activation = activation
                if (signal?.aborted) return activityResult('unconfirmed', 'cancelled')

                if (activation.status !== 'activated' && activation.status !== 'already-active')
                    return activationActivity(activation)

                profile = await this.platform.getProfile(accessToken)
                if (signal?.aborted) return activityResult('unconfirmed', 'cancelled')
            }
            onActivated?.()

            const settings = this.resolveSettings(profile)
            if (!settings) return activityResult('unconfirmed', 'settings-unavailable')

            const complete = settings.promotion.attributes['complete']?.toLowerCase() === 'true'
            if (complete) {
                await readStreak(this.bot, 'edge-browsing', LOG_TAG)
                return activityResult('skipped', 'already-complete')
            }

            const reportCount = Math.ceil(TARGET_DURATION_MINUTES / settings.reportIntervalMinutes)
            const intervalMs = settings.reportIntervalMinutes * 60_000
            const reportDelays = Array.from(
                { length: reportCount },
                () => intervalMs + this.bot.utils.randomDelay(REPORT_JITTER_MIN_MS, REPORT_JITTER_MAX_MS)
            )
            const progress = new EdgeBrowsingProgress(
                TARGET_DURATION_MINUTES,
                settings.reportIntervalMinutes,
                reportDelays
            )
            let acceptedReports = 0
            let duplicateReports = 0
            let failedReports = 0
            let reportsProcessed = 0
            let serverComplete = false

            this.bot.logger.info(
                this.bot.isMobile,
                LOG_TAG,
                `Started background Edge browsing activity | offerId=${settings.offerId} | type=${settings.activityType}` +
                    ` | targetMinutes=${TARGET_DURATION_MINUTES} | reports=${reportCount}` +
                    ` | serverIntervalMinutes=${settings.reportIntervalMinutes}` +
                    ` | jitterSeconds=${REPORT_JITTER_MIN_MS / 1000}-${REPORT_JITTER_MAX_MS / 1000}` +
                    ` | estimatedDurationMinutes=${progress.estimatedDurationMinutes}`
            )

            for (let reportNumber = 1; reportNumber <= reportCount; reportNumber++) {
                const beforeReport = progress.snapshot(reportNumber - 1)

                this.bot.logger.info(
                    this.bot.isMobile,
                    LOG_TAG,
                    this.formatProgress(beforeReport, acceptedReports, duplicateReports, failedReports)
                )

                if (!(await this.wait(progress.delayBeforeReport(reportNumber), signal))) {
                    this.bot.logger.debug(this.bot.isMobile, LOG_TAG, 'Background activity cancelled')
                    return activityResult('unconfirmed', 'cancelled')
                }

                let result: EdgeReportResult | null = null
                try {
                    await this.bot.rewards.getDashboardData()
                    this.bot.signal.throwIfAborted()
                    result = await this.submitReport(accessToken, settings)
                } catch (error) {
                    const requestError = error as { status?: number; response?: { status?: number } }
                    const status = requestError.response?.status ?? requestError.status ?? null
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        LOG_TAG,
                        `Edge browsing report failed | report=${reportNumber}/${reportCount}` +
                            ` | status=${status ?? 'unknown'}` +
                            ` | message=${error instanceof Error ? error.message : String(error)}`
                    )
                }

                if (signal?.aborted) return activityResult('unconfirmed', 'cancelled')
                reportsProcessed = reportNumber

                if (!result) {
                    failedReports += 1
                    this.logProgress(progress.snapshot(reportNumber), acceptedReports, duplicateReports, failedReports)

                    serverComplete = await this.refreshServerCompletion(accessToken, reportNumber, reportCount)
                    if (serverComplete) {
                        this.logServerComplete(
                            reportNumber,
                            reportCount,
                            acceptedReports,
                            duplicateReports,
                            failedReports
                        )
                        break
                    }
                    continue
                }

                if (result.duplicate) duplicateReports += 1
                else acceptedReports += 1

                const afterReport = progress.snapshot(reportNumber)
                const message =
                    `Submitted Edge browsing report | report=${reportNumber}/${reportCount} | status=${result.status}` +
                    ` | duplicate=${result.duplicate}` +
                    ` | cookies=${result.cookieNames.join(',') || 'none'}` +
                    ` | reportsRemaining=${afterReport.reportsRemaining}` +
                    ` | scheduledMinutesCovered=${afterReport.scheduledMinutesCovered}/${TARGET_DURATION_MINUTES}` +
                    ` | accepted=${acceptedReports} | duplicates=${duplicateReports} | failed=${failedReports}` +
                    ` | elapsedMinutes=${afterReport.elapsedMinutes}` +
                    ` | estimatedRemainingMinutes=${afterReport.estimatedRemainingMinutes}`

                if (result.duplicate) this.bot.logger.warn(this.bot.isMobile, LOG_TAG, message)
                else this.bot.logger.success(this.bot.isMobile, LOG_TAG, message)

                serverComplete = await this.refreshServerCompletion(accessToken, reportNumber, reportCount)
                if (serverComplete) {
                    this.logServerComplete(reportNumber, reportCount, acceptedReports, duplicateReports, failedReports)
                    break
                }
            }

            if (!serverComplete && !signal?.aborted) {
                serverComplete = await this.refreshServerCompletion(accessToken, reportsProcessed, reportCount)
            }

            let gained: number | null = null
            for (let check = 0; check < 3; check++) {
                if (check) {
                    if (!(await this.wait(2000, signal))) break
                }
                serverComplete =
                    (await this.refreshServerCompletion(accessToken, reportsProcessed, reportCount)) || serverComplete
                gained = creditedPoints(
                    pointDelta(
                        settings.promotion.attributes.pointprogress,
                        this.latestPromotion?.attributes.pointprogress
                    ),
                    profile.response.balance,
                    this.latestBalance
                )
                if (gained !== null && gained > 0) break
            }
            const finished = progress.snapshot(reportsProcessed)
            const summary =
                `Finished background Edge browsing activity | reports=${reportsProcessed}` +
                ` | reportsCompleted=${reportsProcessed}/${reportCount}` +
                ` | reportsRemaining=${serverComplete ? 0 : finished.reportsRemaining}` +
                ` | scheduledMinutesCovered=${finished.scheduledMinutesCovered}/${TARGET_DURATION_MINUTES}` +
                ` | serverComplete=${serverComplete} | pointsGained=${gained ?? 'unknown'}` +
                ` | accepted=${acceptedReports} | duplicates=${duplicateReports} | failed=${failedReports}` +
                ` | elapsedMinutes=${finished.elapsedMinutes} | estimatedRemainingMinutes=${
                    serverComplete ? 0 : finished.estimatedRemainingMinutes
                }`

            if (!serverComplete || duplicateReports > 0 || failedReports > 0) {
                this.bot.logger.warn(this.bot.isMobile, LOG_TAG, summary)
            } else {
                this.bot.logger.success(this.bot.isMobile, LOG_TAG, summary)
            }
            return activityResult(
                serverComplete ? 'confirmed' : 'unconfirmed',
                serverComplete ? 'server-complete' : 'server-incomplete',
                settings.offerId,
                gained
            )
        } catch (error) {
            if (signal?.aborted) {
                this.bot.logger.debug(this.bot.isMobile, LOG_TAG, 'Background activity cancelled')
                return activityResult('unconfirmed', 'cancelled')
            }

            this.bot.logger.error(
                this.bot.isMobile,
                LOG_TAG,
                `Background Edge browsing activity failed | message=${
                    error instanceof Error ? error.message : String(error)
                }`
            )
            return activityFailure(error)
        }
    }

    private findStreak(streaks?: StreakState[]): StreakState | undefined {
        if (streaks) return streaks.find(streak => this.isEdgeBrowsingPartner(streak.partner))

        const snapshots = [this.bot.reactSnapshot, this.bot.reactSnapshots.desktop, this.bot.reactSnapshots.mobile]

        for (const snapshot of snapshots) {
            const streak = snapshot?.streaks.find(item => this.isEdgeBrowsingPartner(item.partner))
            if (streak) return streak
        }

        return undefined
    }

    private async activate(data: RewardsState, signal?: AbortSignal): Promise<ActivationOutcome> {
        let task: BrowserTaskPage | undefined
        let offer: ActivationTarget | null = null
        let attempted = false
        try {
            let html = ''
            let snapshot: PageSnapshot | null = null
            if (this.bot.config.rewardsMode === 'browser') {
                const source = this.bot.activePage
                if (!source) return activationOutcome('unconfirmed', 'activation-page-unavailable')
                task = await BrowserTaskPage.createRewards(source)
                html = await this.readActivationHtml(task.page)
                snapshot = this.bot.pageParser.snapshotPage(html)
            }
            if (signal?.aborted) return activationOutcome('unconfirmed', 'cancelled')
            offer = this.findActivationTarget(snapshot ?? undefined)
            if (!offer && !task) {
                snapshot = await this.bot.rewards.refreshEarnSnapshot()
                if (snapshot) {
                    this.bot.reactSnapshot = snapshot
                    offer = this.findActivationTarget(snapshot)
                }
            }
            if (!offer) {
                const streak = snapshot ? this.findStreak(snapshot.streaks) : this.findStreak()
                if (streak?.isEnabled) return activationOutcome('already-active', 'already-active')
                if (streak) return activationOutcome('unconfirmed', 'activation-metadata-missing')
                this.bot.logger.debug(
                    this.bot.isMobile,
                    LOG_TAG,
                    'No Edge browsing activation metadata present in the streak model or generic offers across the current, desktop, or cached mobile Rewards snapshots'
                )
                return snapshot?.account.availablePoints != null
                    ? activationOutcome('unavailable', 'offer-not-present')
                    : activationOutcome('unconfirmed', 'activation-data-unavailable')
            }

            if (offer.isCompleted) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    LOG_TAG,
                    `Edge browsing activation offer already completed | offerId=${offer.offerId}`
                )
                return activationOutcome('already-active', 'already-active', offer.offerId)
            }

            if (offer.isLocked) return activationOutcome('unavailable', 'offer-locked', offer.offerId)
            if (offer.date && Date.parse(offer.date) > Date.now())
                return activationOutcome('unavailable', 'offer-not-yet-available', offer.offerId)

            if (!offer.hash) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    LOG_TAG,
                    `Activation offer present but missing a hash | offerId=${offer.offerId}`
                )
                return activationOutcome('unconfirmed', 'activation-metadata-missing', offer.offerId)
            }

            if (!offer.reportable) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    LOG_TAG,
                    `Activation offer is not actionable | offerId=${offer.offerId}`
                )
                return activationOutcome('unconfirmed', 'activation-metadata-missing', offer.offerId)
            }

            const actionId = this.bot.nextActions.reportActivity
            if (!task && !actionId) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    LOG_TAG,
                    'Skipping activation: "reportActivity" action id not discovered in bundle'
                )
                return activationOutcome('unconfirmed', 'activation-metadata-missing', offer.offerId)
            }

            const dashboard = task ? data : await this.resolveDashboard(data)
            const metadata = resolveActivationMetadata(offer, dashboard.dashboard, VERIFIED_ACTIVITY_TYPES)
            if (!metadata) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    LOG_TAG,
                    `Skipping activation: no valid activity type found | offerId=${offer.offerId}`
                )
                return activationOutcome('unconfirmed', 'activation-metadata-missing', offer.offerId)
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                LOG_TAG,
                `Activating Browsing Streak on Edge | offerId=${offer.offerId} | activationSource=${offer.activationSource} | activityType=${metadata.activityType} | activityTypeSource=${metadata.activityTypeSource} | promotional=${metadata.isPromotional} | geo=${this.bot.userData.geoLocale}`
            )
            if (signal?.aborted) return activationOutcome('unconfirmed', 'cancelled', offer.offerId)
            const body = [
                offer.hash,
                metadata.activityType,
                {
                    offerid: offer.offerId,
                    isPromotional: metadata.isPromotional ? 'true' : '$undefined',
                    timezoneOffset: this.bot.userData.timezoneOffset
                }
            ]
            attempted = true
            const { status, acknowledged } = task
                ? await new ServerActions(this.bot).reportEdgeBrowsingActivation(html, body, task.page, signal)
                : await this.bot.rewards.reportServerAction(actionId!, body)

            if (status < 200 || status >= 300)
                return activationOutcome(
                    status >= 400 && status < 500 ? 'failed' : 'unconfirmed',
                    status >= 400 && status < 500 ? 'activation-request-rejected' : 'activation-request-error',
                    offer.offerId,
                    true,
                    { httpStatus: status, acknowledged }
                )
            if (!(await this.wait(this.bot.utils.randomDelay(3000, 6000), signal)))
                return activationOutcome('unconfirmed', 'cancelled', offer.offerId, true)
            const confirmed = await this.confirmActivation(offer.offerId, task?.page)

            if (acknowledged || confirmed) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    LOG_TAG,
                    `Activated Browsing Streak on Edge | offerId=${offer.offerId} | acknowledged=${acknowledged} | confirmed=${confirmed}`
                )
                return activationOutcome(
                    'activated',
                    confirmed ? 'activation-confirmed' : 'activation-acknowledged',
                    offer.offerId,
                    true,
                    { httpStatus: status, acknowledged, verified: confirmed === true }
                )
            }

            this.bot.logger.warn(
                this.bot.isMobile,
                LOG_TAG,
                `Activation not acknowledged | offerId=${offer.offerId} | status=${status}`
            )
            return activationOutcome(
                'unconfirmed',
                confirmed === null ? 'activation-state-unavailable' : 'activation-not-confirmed',
                offer.offerId,
                true,
                { httpStatus: status, acknowledged, verified: false }
            )
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                LOG_TAG,
                `Activation error | offerId=${offer?.offerId ?? 'unknown'} | ${error instanceof Error ? error.message : String(error)}`
            )
            return activationException(error, offer?.offerId, attempted)
        } finally {
            await task?.close()
        }
    }

    private async readActivationHtml(page: Page): Promise<string> {
        const response = await this.bot.requestClient.request<string>(
            {
                url: URLs.rewards.earn,
                method: 'GET',
                headers: {
                    ...localeRequestHeaders(this.bot.accountLocale.acceptLanguage),
                    'Cache-Control': 'no-cache'
                },
                responseType: 'text'
            },
            page
        )
        if (response.status < 200 || response.status >= 300)
            throw new Error(`Edge activation state request failed | status=${response.status}`)
        return response.data
    }

    private async confirmActivation(offerId: string, page?: Page): Promise<boolean | null> {
        try {
            const snapshot = page
                ? this.bot.pageParser.snapshotPage(await this.readActivationHtml(page))
                : await this.bot.rewards.refreshEarnSnapshot()
            if (!snapshot) return null

            if (!page) this.bot.reactSnapshot = snapshot

            const streak = this.findStreak(snapshot.streaks)
            const activationOffer = snapshot.offers.find(o => o.offerId === offerId)
            if (streak?.isEnabled === true || activationOffer?.isCompleted === true) return true
            return snapshot.account.availablePoints !== null ? false : null
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                LOG_TAG,
                `Could not verify activation state | offerId=${offerId} | ${error instanceof Error ? error.message : String(error)}`
            )
            return null
        }
    }

    private async resolveDashboard(fallback: RewardsState): Promise<RewardsState> {
        try {
            return await this.bot.rewards.getDashboardData()
        } catch {
            this.bot.logger.debug(
                this.bot.isMobile,
                LOG_TAG,
                'Desktop dashboard fetch failed - falling back to the earlier dashboard read'
            )
            return fallback
        }
    }

    private findActivationTarget(preferred?: PageSnapshot): ActivationTarget | null {
        const snapshots = activationSnapshots(this.bot, preferred)

        for (const { source, snapshot } of snapshots) {
            const streak = this.findStreak(snapshot.streaks)
            if (!streak?.activationOfferId || !streak.activationHash) continue

            if (source !== 'current') {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    LOG_TAG,
                    `Activation metadata missing from the current snapshot; using cached ${source} streak snapshot | offerId=${streak.activationOfferId}`
                )
            } else {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    LOG_TAG,
                    `Using Edge browsing activation metadata from streak model | offerId=${streak.activationOfferId}`
                )
            }

            return streakActivationTarget(streak, 'Browsing Streak on Edge')
        }

        for (const { source, snapshot } of snapshots) {
            const exact = snapshot.offers.find(o => o.offerId === EDGE_BROWSING_ACTIVATION_OFFER)
            const fuzzy = snapshot.offers.find(o => {
                const id = o.offerId.toLowerCase()
                return id.includes('edge_flight') && (id.includes('eligible') || id.includes('activation'))
            })
            const offer = exact ?? fuzzy
            if (!offer) continue

            if (source !== 'current') {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    LOG_TAG,
                    `Activation offer missing from the current snapshot; using cached ${source} offer snapshot | offerId=${offer.offerId}`
                )
            } else {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    LOG_TAG,
                    `Using Edge browsing activation metadata from generic offer | offerId=${offer.offerId}`
                )
            }

            return { ...offer, activationSource: 'offer' }
        }

        return null
    }

    private isEdgeBrowsingPartner(partner: string): boolean {
        const normalized = partner.replace(/[^a-z]/gi, '').toLowerCase()
        return normalized === 'edge' || normalized.includes('edgebrows')
    }

    private findPromotion(profile: AppDashboardData): Promotion | undefined {
        return profile.response?.promotions?.find(item => item.name === PROMOTION_NAME)
    }

    private async refreshServerCompletion(
        accessToken: string,
        reportNumber: number,
        reportCount: number
    ): Promise<boolean> {
        this.latestPromotion = undefined
        this.latestBalance = null
        try {
            const profile = await this.platform.getProfile(accessToken)
            const promotion = this.findPromotion(profile)
            this.latestPromotion = promotion
            this.latestBalance = profile.response.balance
            if (!promotion) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    LOG_TAG,
                    `Could not verify Edge browsing completion: promotion is absent | report=${reportNumber}/${reportCount}`
                )
                return false
            }

            const complete = promotion.attributes['complete']?.toLowerCase() === 'true'
            this.bot.logger.debug(
                this.bot.isMobile,
                LOG_TAG,
                `Refreshed Edge browsing server state | report=${reportNumber}/${reportCount} | complete=${complete}`
            )
            return complete
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                LOG_TAG,
                `Could not refresh Edge browsing server state | report=${reportNumber}/${reportCount}` +
                    ` | message=${error instanceof Error ? error.message : String(error)}`
            )
            return false
        }
    }

    private logServerComplete(
        reportNumber: number,
        reportCount: number,
        acceptedReports: number,
        duplicateReports: number,
        failedReports: number
    ): void {
        this.bot.logger.success(
            this.bot.isMobile,
            LOG_TAG,
            `Microsoft reports Edge browsing activity complete | report=${reportNumber}/${reportCount}` +
                ` | accepted=${acceptedReports} | duplicates=${duplicateReports} | failed=${failedReports}`
        )
    }

    private resolveSettings(profile: AppDashboardData): EdgeBrowsingSettings | null {
        const promotion = this.findPromotion(profile)
        if (!promotion) {
            this.bot.logger.warn(
                this.bot.isMobile,
                LOG_TAG,
                'Edge browsing promotion is missing from the refreshed profile; activity settings could not be verified'
            )
            return null
        }

        const offerId = promotion.attributes['offerid']?.trim()
        const activityType = promotion.attributes['report_offer_type']?.trim()
        if (!offerId || !activityType) {
            this.bot.logger.warn(
                this.bot.isMobile,
                LOG_TAG,
                `Skipping: promotion metadata is incomplete | offerId=${offerId || 'missing'}` +
                    ` | type=${activityType || 'missing'}`
            )
            return null
        }

        const advertisedInterval = Number(promotion.attributes['report_per_minutes'])
        const validInterval =
            Number.isFinite(advertisedInterval) &&
            advertisedInterval >= MIN_REPORT_INTERVAL_MINUTES &&
            advertisedInterval <= MAX_REPORT_INTERVAL_MINUTES
        const reportIntervalMinutes = validInterval ? advertisedInterval : DEFAULT_REPORT_INTERVAL_MINUTES

        if (!validInterval) {
            this.bot.logger.warn(
                this.bot.isMobile,
                LOG_TAG,
                `Invalid server report interval; using fallback | received=${
                    promotion.attributes['report_per_minutes'] ?? 'missing'
                } | fallbackMinutes=${DEFAULT_REPORT_INTERVAL_MINUTES}`
            )
        }

        return { offerId, activityType, reportIntervalMinutes, promotion }
    }

    private async submitReport(accessToken: string, settings: EdgeBrowsingSettings): Promise<EdgeReportResult> {
        this.bot.accountState.backgroundRewardsActive = true
        const result = await this.platform.submitActivity(accessToken, settings.offerId, settings.activityType)
        const activity = result.activity
        this.bot.logger.debug(
            this.bot.isMobile,
            LOG_TAG,
            `Edge activity response | offerId=${activity?.a?.offerid ?? 'unknown'}` +
                ` | type=${activity?.type ?? 'unknown'} | quantity=${activity?.q ?? 'unknown'}`
        )
        return result
    }

    private logProgress(
        progress: EdgeBrowsingProgressSnapshot,
        acceptedReports: number,
        duplicateReports: number,
        failedReports: number
    ): void {
        this.bot.logger.info(
            this.bot.isMobile,
            LOG_TAG,
            this.formatProgress(progress, acceptedReports, duplicateReports, failedReports)
        )
    }

    private formatProgress(
        progress: EdgeBrowsingProgressSnapshot,
        acceptedReports: number,
        duplicateReports: number,
        failedReports: number
    ): string {
        return (
            `Edge browsing progress | reportsCompleted=${progress.reportsCompleted}/${progress.reportsTotal}` +
            ` | reportsRemaining=${progress.reportsRemaining}` +
            ` | scheduledMinutesCovered=${progress.scheduledMinutesCovered}/${TARGET_DURATION_MINUTES}` +
            `${progress.nextReportInSeconds === null ? '' : ` | nextReportInSeconds=${progress.nextReportInSeconds}`}` +
            ` | accepted=${acceptedReports} | duplicates=${duplicateReports} | failed=${failedReports}` +
            ` | elapsedMinutes=${progress.elapsedMinutes}` +
            ` | estimatedRemainingMinutes=${progress.estimatedRemainingMinutes}`
        )
    }

    private wait(delayMs: number, signal?: AbortSignal): Promise<boolean> {
        if (signal?.aborted) return Promise.resolve(false)
        if (!signal) return this.bot.utils.wait(delayMs).then(() => true)

        return new Promise(resolve => {
            const onAbort = () => {
                clearTimeout(timeout)
                resolve(false)
            }
            const timeout = setTimeout(() => {
                signal.removeEventListener('abort', onAbort)
                resolve(true)
            }, delayMs)

            signal.addEventListener('abort', onAbort, { once: true })
        })
    }
}
