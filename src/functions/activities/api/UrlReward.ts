import type { AxiosRequestConfig } from 'axios'
import type { BasePromotion } from '../../../interface/DashboardData'
import { Workers } from '../../Workers'

export class UrlReward extends Workers {
    private cookieHeader: string = ''

    private fingerprintHeader: { [x: string]: string } = {}

    private gainedPoints: number = 0

    private oldBalance: number = this.bot.userData.currentPoints

    public async doUrlReward(promotion: BasePromotion) {
        const offerId = String(promotion.offerId ?? '').trim()
        if (!offerId) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'URL-REWARD',
                `Skipping UrlReward due to missing offerId | title="${promotion.title ?? ''}"`
            )
            return
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'URL-REWARD',
            `Starting UrlReward | offerId=${offerId} | geo=${this.bot.userData.geoLocale} | oldBalance=${this.oldBalance}`
        )

        try {
            this.cookieHeader = this.bot.browser.func.buildCookieHeader(
                this.bot.isMobile ? this.bot.cookies.mobile : this.bot.cookies.desktop, [
                'bing.com',
                'live.com',
                'microsoftonline.com'
            ])

            const fingerprintHeaders = { ...this.bot.fingerprint.headers }
            delete fingerprintHeaders['Cookie']
            delete fingerprintHeaders['cookie']
            this.fingerprintHeader = fingerprintHeaders

            this.bot.logger.debug(
                this.bot.isMobile,
                'URL-REWARD',
                `Prepared UrlReward headers | offerId=${offerId} | cookieLength=${this.cookieHeader.length} | fingerprintHeaderKeys=${Object.keys(this.fingerprintHeader).length}`
            )

            let success = false

            // Try primary method with RequestVerificationToken first
            if (this.bot.requestToken && promotion.hash) {
                this.bot.logger.debug(this.bot.isMobile, 'URL-REWARD', 'Trying primary method with RequestVerificationToken')

                const formData = new URLSearchParams({
                    id: offerId,
                    hash: promotion.hash,
                    timeZone: '60',
                    activityAmount: '1',
                    dbs: '0',
                    form: '',
                    type: '',
                    __RequestVerificationToken: this.bot.requestToken
                })

                const request: AxiosRequestConfig = {
                    url: 'https://rewards.bing.com/api/reportactivity?X-Requested-With=XMLHttpRequest',
                    method: 'POST',
                    headers: {
                        ...(this.bot.fingerprint?.headers ?? {}),
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'X-Requested-With': 'XMLHttpRequest',
                        Cookie: this.cookieHeader,
                        Referer: 'https://rewards.bing.com/',
                        Origin: 'https://rewards.bing.com'
                    },
                    data: formData
                }

                try {
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'URL-REWARD',
                        `Sending primary UrlReward request | offerId=${offerId} | url=${request.url}`
                    )

                    const response = await this.bot.axios.request(request)
                    success = true

                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'URL-REWARD',
                        `Received primary UrlReward response | offerId=${offerId} | status=${response.status}`
                    )

                } catch (primaryError) {
                    const maybeResponse = primaryError as { response?: { status?: number; data?: unknown } }
                    const status = maybeResponse.response?.status
                    const responseData = maybeResponse.response?.data
                    const bodySnippet =
                        typeof responseData === 'string'
                            ? responseData.slice(0, 300)
                            : responseData && typeof responseData === 'object'
                              ? JSON.stringify(responseData).slice(0, 300)
                              : ''
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'URL-REWARD',
                        `Primary method failed, trying dashboard fallback | offerId=${offerId} | status=${status ?? 'n/a'} | error=${primaryError instanceof Error ? primaryError.message : String(primaryError)}${bodySnippet ? ` | body=${bodySnippet}` : ''}`
                    )
                }
            } else if (!promotion.hash) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'URL-REWARD',
                    `Skipping primary method, missing promotion hash | offerId=${offerId}`
                )
            }

            // If primary method failed or no token, try dashboard method
            if (!success) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'URL-REWARD',
                    `Using dashboard fallback method | offerId=${offerId}`
                )

                await this.tryDashboardMethod(promotion)
                success = true // Assume success for now, error handling in the method
            }

            if (success) {
                // Get updated balance
                try {
                    const newBalance = await this.bot.browser.func.getCurrentPoints()
                    this.gainedPoints = newBalance - this.oldBalance

                    if (this.gainedPoints > 0) {
                        this.bot.userData.currentPoints = newBalance
                        this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + this.gainedPoints

                        this.bot.logger.info(
                            this.bot.isMobile,
                            'URL-REWARD',
                            `✅ Completed UrlReward | offerId=${offerId} | gainedPoints=${this.gainedPoints} | newBalance=${newBalance}`,
                            'green'
                        )
                    } else {
                        this.bot.logger.warn(
                            this.bot.isMobile,
                            'URL-REWARD',
                            `Failed UrlReward with no points gained | offerId=${offerId} | oldBalance=${this.oldBalance} | newBalance=${newBalance}`
                        )
                    }
                } catch (balanceError) {
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'URL-REWARD',
                        `Could not verify points after UrlReward | offerId=${offerId} | error=${balanceError instanceof Error ? balanceError.message : String(balanceError)}`
                    )
                }
            }

            this.bot.logger.debug(this.bot.isMobile, 'URL-REWARD', `Waiting after UrlReward | offerId=${offerId}`)
            await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 10000))

        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'URL-REWARD',
                `Error in doUrlReward | offerId=${promotion.offerId} | message=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async tryDashboardMethod(promotion: BasePromotion) {
        try {
            const offerId = promotion.offerId

            // Try to extract session ID and next-action hash from dashboard page
            const dashboardResponse = await this.bot.axios.request({
                url: 'https://rewards.bing.com/dashboard',
                method: 'GET',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {}),
                    Cookie: this.cookieHeader,
                    Referer: 'https://rewards.bing.com/',
                    Origin: 'https://rewards.bing.com'
                }
            })

            const html = typeof dashboardResponse.data === 'string' ? dashboardResponse.data : JSON.stringify(dashboardResponse.data)

            // Look for session ID (64 hex chars)
            const sessionIdMatch = html.match(/([a-f0-9]{64})/)
            const sessionId = sessionIdMatch ? sessionIdMatch[1] : null

            if (!sessionId) {
                throw new Error('Could not extract session ID from dashboard page')
            }

            // Look for next-action hash
            const nextActionMatch = html.match(/\"([a-f0-9]{40,42})\"/)
            const nextAction = nextActionMatch ? nextActionMatch[1] : null

            this.bot.logger.info(
                this.bot.isMobile,
                'URL-REWARD',
                `Extracted dashboard data | sessionId=${sessionId.substring(0, 20)}... | nextAction=${nextAction ? nextAction.substring(0, 20) + '...' : 'none'}`
            )

            // Prepare dashboard payload
            const payload = [
                sessionId,
                11,
                {
                    offerid: offerId,
                    isPromotional: "$undefined",
                    timezoneOffset: "-480"
                }
            ]

            const headers: Record<string, string> = {
                ...(this.bot.fingerprint?.headers ?? {}),
                'Content-Type': 'text/plain;charset=UTF-8',
                'Accept': 'text/x-component',
                Cookie: this.cookieHeader,
                Referer: 'https://rewards.bing.com/dashboard',
                Origin: 'https://rewards.bing.com'
            }

            if (nextAction) {
                headers['next-action'] = nextAction
            }

            const request: AxiosRequestConfig = {
                url: 'https://rewards.bing.com/dashboard',
                method: 'POST',
                headers,
                data: JSON.stringify(payload)
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'URL-REWARD',
                `Sending dashboard UrlReward request | offerId=${offerId} | url=${request.url}`
            )

            const response = await this.bot.axios.request(request)

            this.bot.logger.info(
                this.bot.isMobile,
                'URL-REWARD',
                `Dashboard method completed | offerId=${offerId} | status=${response.status}`
            )

        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'URL-REWARD',
                `Dashboard method failed | offerId=${promotion.offerId} | error=${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }
}
