import type { Cookie } from 'patchright'

import { URLs } from '../../../constants/urls'
import type { ParsedOffer, StreakState } from '../../../browser/ReactFunc'
import type { AppDashboardData, Promotion } from '../../../interface/AppDashBoardData'
import type { DashboardData } from '../../../interface/DashboardData'
import { BaseActivity } from '../BaseActivity'
import { EdgeBrowsingProgress, type EdgeBrowsingProgressSnapshot } from './EdgeBrowsingProgress'

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

interface EdgeActivityResponse {
    code?: number
    response?: {
        activity?: {
            type?: number | string
            q?: number
            a?: { offerid?: string }
        }
        isDuplicate?: boolean
    }
}

interface ReportResult {
    status: number
    duplicate: boolean
    cookieNames: string[]
}

type ActivationResult = 'activated' | 'already-active' | 'absent' | 'failed'

interface ActivationMetadata {
    activityType: number
    activityTypeSource: 'react' | 'streak' | 'dashboard' | 'verified-fallback'
    isPromotional: boolean
}

interface ActivationTarget extends ParsedOffer {
    activationSource: 'streak' | 'offer'
}

export class EdgeBrowsing extends BaseActivity {
    public async run(data: DashboardData, signal?: AbortSignal): Promise<void> {
        const accessToken = this.bot.accessToken
        if (!accessToken) {
            this.bot.logger.warn(this.bot.isMobile, LOG_TAG, 'Skipping: mobile app access token is unavailable')
            return
        }

        try {
            let profile = await this.getEdgeProfile(accessToken)
            if (signal?.aborted) return

            if (!this.findPromotion(profile)) {
                const activation = await this.activate(data, signal)
                if (signal?.aborted) return

                if (activation === 'absent') {
                    this.bot.logger.info(
                        this.bot.isMobile,
                        LOG_TAG,
                        'Browsing Streak on Edge is not available for this account'
                    )
                    return
                }

                if (activation === 'failed') return

                profile = await this.getEdgeProfile(accessToken)
                if (signal?.aborted) return
            }

            const settings = this.resolveSettings(profile)
            if (!settings) return

            const complete = settings.promotion.attributes['complete']?.toLowerCase() === 'true'
            if (complete) {
                this.bot.logger.info(this.bot.isMobile, LOG_TAG, 'Browsing Streak on Edge is already complete')
                return
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
                    return
                }

                let result: ReportResult | null = null
                try {
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

                if (signal?.aborted) return
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
                else this.bot.logger.info(this.bot.isMobile, LOG_TAG, message, 'green')

                serverComplete = await this.refreshServerCompletion(accessToken, reportNumber, reportCount)
                if (serverComplete) {
                    this.logServerComplete(reportNumber, reportCount, acceptedReports, duplicateReports, failedReports)
                    break
                }
            }

            if (!serverComplete && !signal?.aborted) {
                serverComplete = await this.refreshServerCompletion(accessToken, reportsProcessed, reportCount)
            }

            const finished = progress.snapshot(reportsProcessed)
            const summary =
                `Finished background Edge browsing activity | reports=${reportsProcessed}` +
                ` | reportsCompleted=${reportsProcessed}/${reportCount}` +
                ` | reportsRemaining=${serverComplete ? 0 : finished.reportsRemaining}` +
                ` | scheduledMinutesCovered=${finished.scheduledMinutesCovered}/${TARGET_DURATION_MINUTES}` +
                ` | serverComplete=${serverComplete}` +
                ` | accepted=${acceptedReports} | duplicates=${duplicateReports} | failed=${failedReports}` +
                ` | elapsedMinutes=${finished.elapsedMinutes} | estimatedRemainingMinutes=${
                    serverComplete ? 0 : finished.estimatedRemainingMinutes
                }`

            if (!serverComplete || duplicateReports > 0 || failedReports > 0) {
                this.bot.logger.warn(this.bot.isMobile, LOG_TAG, summary)
            } else {
                this.bot.logger.info(this.bot.isMobile, LOG_TAG, summary, 'green')
            }
        } catch (error) {
            if (signal?.aborted) {
                this.bot.logger.debug(this.bot.isMobile, LOG_TAG, 'Background activity cancelled')
                return
            }

            this.bot.logger.error(
                this.bot.isMobile,
                LOG_TAG,
                `Background Edge browsing activity failed | message=${
                    error instanceof Error ? error.message : String(error)
                }`
            )
        }
    }

    private async getEdgeProfile(accessToken: string): Promise<AppDashboardData> {
        const headers = { ...(this.bot.fingerprint?.headers ?? {}) }
        delete headers['Cookie']
        delete headers['cookie']

        const response = await this.bot.http.request<AppDashboardData>({
            url: URLs.platform.edgeProfile,
            method: 'GET',
            headers: {
                ...headers,
                Authorization: `Bearer ${accessToken}`,
                Accept: '*/*',
                'Accept-Language': this.bot.accountLocale.acceptLanguage,
                'X-Rewards-AppId': 'EdgeDesktop',
                'X-Rewards-PartnerId': 'EdgeHub',
                'X-Rewards-Country': this.bot.userData.geoLocale,
                'X-Rewards-Language': this.bot.accountLocale.locale,
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-Mode': 'no-cors',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Storage-Access': 'active'
            }
        })

        if (response.data.code !== 0) {
            throw new Error(`Edge profile returned code ${response.data.code ?? 'unknown'}`)
        }

        return response.data
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

    private async activate(data: DashboardData, signal?: AbortSignal): Promise<ActivationResult> {
        const offer = this.findActivationTarget()
        if (!offer) {
            this.bot.logger.debug(
                this.bot.isMobile,
                LOG_TAG,
                'No Edge browsing activation metadata present in the streak model or generic offers across the current, desktop, or cached mobile Rewards snapshots'
            )
            return 'absent'
        }

        if (offer.isCompleted) {
            this.bot.logger.info(
                this.bot.isMobile,
                LOG_TAG,
                `Edge browsing activation offer already completed | offerId=${offer.offerId}`,
                'green'
            )
            return 'already-active'
        }

        if (!offer.hash) {
            this.bot.logger.warn(
                this.bot.isMobile,
                LOG_TAG,
                `Activation offer present but missing a hash | offerId=${offer.offerId}`
            )
            return 'failed'
        }

        if (!offer.reportable && !offer.isLocked) {
            this.bot.logger.warn(
                this.bot.isMobile,
                LOG_TAG,
                `Activation offer is not actionable | offerId=${offer.offerId}`
            )
            return 'failed'
        }

        const actionId = this.bot.nextActions.reportActivity
        if (!actionId) {
            this.bot.logger.warn(
                this.bot.isMobile,
                LOG_TAG,
                'Skipping activation: "reportActivity" action id not discovered in bundle'
            )
            return 'failed'
        }

        const dashboard = await this.resolveDashboard(data)
        const metadata = this.resolveActivationMetadata(offer, dashboard)
        if (!metadata) {
            this.bot.logger.warn(
                this.bot.isMobile,
                LOG_TAG,
                `Skipping activation: no valid activity type found | offerId=${offer.offerId}`
            )
            return 'failed'
        }

        this.bot.logger.info(
            this.bot.isMobile,
            LOG_TAG,
            `Activating Browsing Streak on Edge | offerId=${offer.offerId} | activationSource=${offer.activationSource} | activityType=${metadata.activityType} | activityTypeSource=${metadata.activityTypeSource} | promotional=${metadata.isPromotional} | geo=${this.bot.userData.geoLocale}`
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

            if (!(await this.wait(this.bot.utils.randomDelay(3000, 6000), signal))) return 'failed'
            const confirmed = await this.confirmActivation(offer.offerId)

            if (acknowledged || confirmed) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    LOG_TAG,
                    `Activated Browsing Streak on Edge | offerId=${offer.offerId} | acknowledged=${acknowledged} | confirmed=${confirmed}`,
                    'green'
                )
                return 'activated'
            }

            this.bot.logger.warn(
                this.bot.isMobile,
                LOG_TAG,
                `Activation not acknowledged | offerId=${offer.offerId} | status=${status}`
            )
            return 'failed'
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                LOG_TAG,
                `Activation error | offerId=${offer.offerId} | ${error instanceof Error ? error.message : String(error)}`
            )
            return 'failed'
        }
    }

    private async confirmActivation(offerId: string): Promise<boolean> {
        try {
            const snapshot = await this.bot.browser.func.refreshEarnSnapshot()
            if (!snapshot) return false

            this.bot.reactSnapshot = snapshot

            const streak = this.findStreak(snapshot.streaks)
            const activationOffer = snapshot.offers.find(o => o.offerId === offerId)
            return streak?.isEnabled === true || activationOffer?.isCompleted === true
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                LOG_TAG,
                `Could not verify activation state | offerId=${offerId} | ${error instanceof Error ? error.message : String(error)}`
            )
            return false
        }
    }

    private async resolveDashboard(fallback: DashboardData): Promise<DashboardData> {
        try {
            return await this.bot.browser.func.getDashboardData(this.bot.cookies.desktop)
        } catch {
            this.bot.logger.debug(
                this.bot.isMobile,
                LOG_TAG,
                'Desktop dashboard fetch failed - falling back to the dashboard from the mobile pass'
            )
            return fallback
        }
    }

    private resolveActivationMetadata(offer: ActivationTarget, data: DashboardData): ActivationMetadata | null {
        const dashboardPromotion = this.findDashboardPromotion(data.dashboard, offer.offerId)

        if (offer.activityType !== null) {
            return {
                activityType: offer.activityType,
                activityTypeSource: offer.activationSource === 'streak' ? 'streak' : 'react',
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

    private findActivationTarget(): ActivationTarget | null {
        const snapshots = [
            { source: 'current', snapshot: this.bot.reactSnapshot },
            { source: 'desktop', snapshot: this.bot.reactSnapshots.desktop },
            { source: 'mobile', snapshot: this.bot.reactSnapshots.mobile }
        ] as const

        const seen = new Set<unknown>()

        // New Rewards format: activation metadata is carried directly by the streak model.
        for (const { source, snapshot } of snapshots) {
            if (!snapshot || seen.has(snapshot)) continue
            seen.add(snapshot)

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

            return {
                offerId: streak.activationOfferId,
                hash: streak.activationHash,
                title: 'Browsing Streak on Edge',
                description: '',
                points: 0,
                promotionSubtype: null,
                destination: streak.destinationUrl ?? '',
                isCompleted: streak.isEnabled,
                isPromotional: false,
                isLocked: false,
                unlockCriteria: null,
                date: null,
                activityType: streak.activationActivityType,
                reportable: true,
                activationSource: 'streak'
            }
        }

        // Legacy/current alternate format: activation appears as a regular Rewards offer.
        seen.clear()
        for (const { source, snapshot } of snapshots) {
            if (!snapshot || seen.has(snapshot)) continue
            seen.add(snapshot)

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
        try {
            const profile = await this.getEdgeProfile(accessToken)
            const promotion = this.findPromotion(profile)
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
        this.bot.logger.info(
            this.bot.isMobile,
            LOG_TAG,
            `Microsoft reports Edge browsing activity complete | report=${reportNumber}/${reportCount}` +
                ` | accepted=${acceptedReports} | duplicates=${duplicateReports} | failed=${failedReports}`,
            'green'
        )
    }

    private resolveSettings(profile: AppDashboardData): EdgeBrowsingSettings | null {
        const promotion = this.findPromotion(profile)
        if (!promotion) {
            this.bot.logger.info(
                this.bot.isMobile,
                LOG_TAG,
                'Browsing Streak on Edge is not available for this account'
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

    private async submitReport(accessToken: string, settings: EdgeBrowsingSettings): Promise<ReportResult> {
        const { header: cookieHeader, names: cookieNames } = this.getPlatformCookieHeader()
        const headers = { ...(this.bot.fingerprint?.headers ?? {}) }
        delete headers['Cookie']
        delete headers['cookie']

        const response = await this.bot.http.request<EdgeActivityResponse>({
            url: URLs.platform.activities,
            method: 'POST',
            headers: {
                ...headers,
                Authorization: `Bearer ${accessToken}`,
                Accept: '*/*',
                'Accept-Language': this.bot.accountLocale.acceptLanguage,
                'Content-Type': 'application/json',
                'X-Rewards-AppId': 'EdgeDesktop',
                'X-Rewards-PartnerId': 'EdgeHub',
                'X-Rewards-Country': this.bot.userData.geoLocale,
                'X-Rewards-Language': this.bot.accountLocale.locale,
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-Mode': 'no-cors',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Storage-Access': 'active',
                ...(cookieHeader ? { Cookie: cookieHeader } : {})
            },
            data: {
                amount: 1,
                attributes: { offerid: settings.offerId },
                request_user_info: true,
                type: settings.activityType
            }
        })

        if (response.data.code !== 0) {
            throw new Error(`Edge activity returned code ${response.data.code ?? 'unknown'}`)
        }

        const activity = response.data.response?.activity
        this.bot.logger.debug(
            this.bot.isMobile,
            LOG_TAG,
            `Edge activity response | offerId=${activity?.a?.offerid ?? 'unknown'}` +
                ` | type=${activity?.type ?? 'unknown'} | quantity=${activity?.q ?? 'unknown'}`
        )

        return {
            status: response.status,
            duplicate: response.data.response?.isDuplicate === true,
            cookieNames
        }
    }

    private getPlatformCookieHeader(): { header: string; names: string[] } {
        const target = new URL(URLs.platform.activities)
        const allowedNames = new Set(['MUID', 'MC1'])
        const now = Date.now() / 1000
        const cookiesByName = new Map<string, Cookie>()

        const validCookies = this.bot.cookies.mobile
            .filter(cookie => {
                if (!allowedNames.has(cookie.name)) return false
                if (cookie.expires !== -1 && cookie.expires <= now) return false
                if (cookie.secure && target.protocol !== 'https:') return false

                const domain = cookie.domain.replace(/^\./, '').toLowerCase()
                if (target.hostname !== domain && !target.hostname.endsWith(`.${domain}`)) return false

                const cookiePath = cookie.path || '/'
                if (!target.pathname.startsWith(cookiePath)) return false
                if (
                    target.pathname.length > cookiePath.length &&
                    !cookiePath.endsWith('/') &&
                    target.pathname.charAt(cookiePath.length) !== '/'
                )
                    return false

                return true
            })
            .sort((a, b) => (b.path?.length ?? 0) - (a.path?.length ?? 0) || b.domain.length - a.domain.length)

        for (const cookie of validCookies) {
            if (!cookiesByName.has(cookie.name)) cookiesByName.set(cookie.name, cookie)
        }

        const cookies = [...cookiesByName.values()]
        return {
            header: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
            names: cookies.map(cookie => cookie.name)
        }
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
