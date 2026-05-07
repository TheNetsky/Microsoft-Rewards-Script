import type { AxiosRequestConfig } from 'axios'
import { Workers } from '../../Workers'
import { PromotionalItem } from '../../../interface/DashboardData'

export class DoubleSearchPoints extends Workers {
    private cookieHeader: string = ''

    private fingerprintHeader: { [x: string]: string } = {}

    public async doDoubleSearchPoints(promotion: PromotionalItem) {
        const offerId = promotion.offerId
        const activityType = promotion.activityType

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

            this.bot.logger.info(
                this.bot.isMobile,
                'DOUBLE-SEARCH-POINTS',
                `Starting Double Search Points | offerId=${offerId}`
            )

            this.bot.logger.debug(
                this.bot.isMobile,
                'DOUBLE-SEARCH-POINTS',
                `Prepared headers | cookieLength=${this.cookieHeader.length} | fingerprintHeaderKeys=${Object.keys(this.fingerprintHeader).length}`
            )

            let success = false

            // Try primary method with RequestVerificationToken first
            if (this.bot.requestToken) {
                this.bot.logger.debug(this.bot.isMobile, 'DOUBLE-SEARCH-POINTS', 'Trying primary method with RequestVerificationToken')

                const formData = new URLSearchParams({
                    id: offerId,
                    hash: promotion.hash,
                    timeZone: '60',
                    activityAmount: '1',
                    dbs: '0',
                    form: '',
                    type: activityType,
                    __RequestVerificationToken: this.bot.requestToken
                })

                const request: AxiosRequestConfig = {
                    url: 'https://rewards.bing.com/api/reportactivity?X-Requested-With=XMLHttpRequest',
                    method: 'POST',
                    headers: {
                        ...(this.bot.fingerprint?.headers ?? {}),
                        Cookie: this.cookieHeader,
                        Referer: 'https://rewards.bing.com/',
                        Origin: 'https://rewards.bing.com'
                    },
                    data: formData
                }

                try {
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'DOUBLE-SEARCH-POINTS',
                        `Sending primary Double Search Points request | offerId=${offerId} | url=${request.url}`
                    )

                    const response = await this.bot.axios.request(request)
                    success = true

                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'DOUBLE-SEARCH-POINTS',
                        `Received primary Double Search Points response | offerId=${offerId} | status=${response.status}`
                    )

                } catch (primaryError) {
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'DOUBLE-SEARCH-POINTS',
                        `Primary method failed, trying dashboard fallback | offerId=${offerId} | error=${primaryError instanceof Error ? primaryError.message : String(primaryError)}`
                    )
                }
            }

            // If primary method failed or no token, try dashboard method
            if (!success) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'DOUBLE-SEARCH-POINTS',
                    `Using dashboard fallback method | offerId=${offerId}`
                )

                await this.tryDashboardMethod(promotion)
                success = true // Assume success for now
            }

            if (success) {
                // Check if activation was successful
                try {
                    const data = await this.bot.browser.func.getDashboardData()
                    const promotionalItem = data.promotionalItems.find(item =>
                        item.name.toLowerCase().includes('ww_banner_optin_2x')
                    )

                    // If OK, should no longer be present in promotionalItems
                    if (promotionalItem) {
                        this.bot.logger.warn(
                            this.bot.isMobile,
                            'DOUBLE-SEARCH-POINTS',
                            `Unable to find or activate Double Search Points | offerId=${offerId}`
                        )
                    } else {
                        this.bot.logger.info(
                            this.bot.isMobile,
                            'DOUBLE-SEARCH-POINTS',
                            `✅ Activated Double Search Points | offerId=${offerId}`,
                            'green'
                        )
                    }
                } catch (checkError) {
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'DOUBLE-SEARCH-POINTS',
                        `Could not verify activation status | offerId=${offerId} | error=${checkError instanceof Error ? checkError.message : String(checkError)}`
                    )
                }
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'DOUBLE-SEARCH-POINTS',
                `Waiting after Double Search Points | offerId=${offerId}`
            )

            await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 10000))
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'DOUBLE-SEARCH-POINTS',
                `Error in doDoubleSearchPoints | offerId=${offerId} | message=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async tryDashboardMethod(promotion: PromotionalItem) {
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
                'DOUBLE-SEARCH-POINTS',
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
                'DOUBLE-SEARCH-POINTS',
                `Sending dashboard Double Search Points request | offerId=${offerId} | url=${request.url}`
            )

            const response = await this.bot.axios.request(request)

            this.bot.logger.info(
                this.bot.isMobile,
                'DOUBLE-SEARCH-POINTS',
                `Dashboard method completed | offerId=${offerId} | status=${response.status}`
            )

        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'DOUBLE-SEARCH-POINTS',
                `Dashboard method failed | offerId=${promotion.offerId} | error=${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }
}
