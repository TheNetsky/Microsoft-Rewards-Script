import type { Cookie } from 'patchright'

import { BROWSER_VERSION_FALLBACKS } from '../../../constants/browserVersions'
import { URLs } from '../../../constants/urls'
import type { AppDashboardData, Promotion } from '../../../interface/AppDashBoardData'
import { BaseActivity } from '../BaseActivity'
import { EdgeBrowsingProgress, type EdgeBrowsingProgressSnapshot } from './EdgeBrowsingProgress'

const LOG_TAG = 'EDGE-BROWSING'
const PROMOTION_NAME = 'edge_browsing_streak_flight'
const TARGET_DURATION_MINUTES = 30
const DEFAULT_REPORT_INTERVAL_MINUTES = 5
const MIN_REPORT_INTERVAL_MINUTES = 1
const MAX_REPORT_INTERVAL_MINUTES = 30

const REPORT_JITTER_MIN_MS = 5_000
const REPORT_JITTER_MAX_MS = 20_000
const RETRY_DELAY_MIN_MS = 10_000
const RETRY_DELAY_MAX_MS = 20_000
const MAX_REPORT_ATTEMPTS = 2

const chromeMajorVersion = BROWSER_VERSION_FALLBACKS.chrome.split('.')[0]
const EDGE_DESKTOP_USER_AGENT =
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ` +
    `(KHTML, like Gecko) Chrome/${chromeMajorVersion}.0.0.0 Safari/537.36 ` +
    `Edg/${BROWSER_VERSION_FALLBACKS.edge.windows}`

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

export class EdgeBrowsing extends BaseActivity {
    public async run(signal?: AbortSignal): Promise<void> {
        const accessToken = this.bot.accessToken
        if (!accessToken) {
            this.bot.logger.warn(this.bot.isMobile, LOG_TAG, 'Skipping: mobile app access token is unavailable')
            return
        }

        try {
            const profile = await this.getEdgeProfile(accessToken)
            if (signal?.aborted) return

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

                const result = await this.submitWithRetry(accessToken, settings, reportNumber, reportCount, signal)
                if (signal?.aborted) return

                if (!result) {
                    failedReports += 1
                    this.logProgress(progress.snapshot(reportNumber), acceptedReports, duplicateReports, failedReports)
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
            }

            const finished = progress.snapshot(reportCount)
            const summary =
                `Finished background Edge browsing activity | reports=${reportCount}` +
                ` | scheduledMinutesCovered=${finished.scheduledMinutesCovered}/${TARGET_DURATION_MINUTES}` +
                ` | accepted=${acceptedReports} | duplicates=${duplicateReports} | failed=${failedReports}` +
                ` | elapsedMinutes=${finished.elapsedMinutes} | estimatedRemainingMinutes=0`

            if (duplicateReports > 0 || failedReports > 0) {
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
        const response = await this.bot.http.request<AppDashboardData>({
            url: URLs.platform.edgeProfile,
            method: 'GET',
            headers: this.buildHeaders(accessToken)
        })

        if (response.data.code !== 0) {
            throw new Error(`Edge profile returned code ${response.data.code ?? 'unknown'}`)
        }

        return response.data
    }

    private resolveSettings(profile: AppDashboardData): EdgeBrowsingSettings | null {
        const promotion = profile.response?.promotions?.find(item => item.name === PROMOTION_NAME)
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

    private async submitWithRetry(
        accessToken: string,
        settings: EdgeBrowsingSettings,
        reportNumber: number,
        reportCount: number,
        signal?: AbortSignal
    ): Promise<ReportResult | null> {
        for (let attempt = 1; attempt <= MAX_REPORT_ATTEMPTS; attempt++) {
            if (signal?.aborted) return null

            try {
                return await this.submitReport(accessToken, settings)
            } catch (error) {
                const status = this.getErrorStatus(error)
                const fatalClientError = status !== null && status >= 400 && status < 500 && status !== 429
                const canRetry = attempt < MAX_REPORT_ATTEMPTS && (status === null || status === 429 || status >= 500)

                if (fatalClientError) {
                    throw new Error(
                        `Edge browsing report rejected | report=${reportNumber}/${reportCount}` +
                            ` | status=${status} | message=${error instanceof Error ? error.message : String(error)}`
                    )
                }

                if (!canRetry) {
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        LOG_TAG,
                        `Edge browsing report failed | report=${reportNumber}/${reportCount}` +
                            ` | attempt=${attempt}/${MAX_REPORT_ATTEMPTS} | status=${status ?? 'unknown'}` +
                            ` | message=${error instanceof Error ? error.message : String(error)}`
                    )
                    return null
                }

                const retryDelayMs = this.bot.utils.randomDelay(RETRY_DELAY_MIN_MS, RETRY_DELAY_MAX_MS)
                this.bot.logger.warn(
                    this.bot.isMobile,
                    LOG_TAG,
                    `Retrying Edge browsing report | report=${reportNumber}/${reportCount}` +
                        ` | attempt=${attempt}/${MAX_REPORT_ATTEMPTS}` +
                        ` | retryInSeconds=${(retryDelayMs / 1000).toFixed(1)}` +
                        ` | message=${error instanceof Error ? error.message : String(error)}`
                )

                if (!(await this.wait(retryDelayMs, signal))) return null
            }
        }

        return null
    }

    private async submitReport(accessToken: string, settings: EdgeBrowsingSettings): Promise<ReportResult> {
        const { header: cookieHeader, names: cookieNames } = this.getPlatformCookieHeader()
        const response = await this.bot.http.request<EdgeActivityResponse>({
            url: URLs.platform.activities,
            method: 'POST',
            headers: {
                ...this.buildHeaders(accessToken),
                'Content-Type': 'application/json',
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

    private buildHeaders(accessToken: string): Record<string, string> {
        return {
            Authorization: `Bearer ${accessToken}`,
            'User-Agent': EDGE_DESKTOP_USER_AGENT,
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

    private getErrorStatus(error: unknown): number | null {
        const requestError = error as { status?: number; response?: { status?: number } }
        return requestError.response?.status ?? requestError.status ?? null
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
