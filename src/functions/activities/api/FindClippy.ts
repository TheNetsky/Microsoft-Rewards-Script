import type { AxiosRequestConfig } from 'axios'
import type { FindClippyPromotion } from '../../../interface/DashboardData'
import { Workers } from '../../Workers'

export class FindClippy extends Workers {
    private cookieHeader: string = ''

    private fingerprintHeader: { [x: string]: string } = {}

    private gainedPoints: number = 0

    private oldBalance: number = this.bot.userData.currentPoints

    public async doFindClippy(promotion: FindClippyPromotion) {
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
                'FIND-CLIPPY',
                `Starting Find Clippy | offerId=${offerId} | activityType=${activityType} | oldBalance=${this.oldBalance}`
            )

            this.bot.logger.debug(
                this.bot.isMobile,
                'FIND-CLIPPY',
                `Prepared headers | cookieLength=${this.cookieHeader.length} | fingerprintHeaderKeys=${Object.keys(this.fingerprintHeader).length}`
            )

            let success = false

            // Try primary method with RequestVerificationToken first
            if (this.bot.requestToken) {
                this.bot.logger.debug(this.bot.isMobile, 'FIND-CLIPPY', 'Trying primary method with RequestVerificationToken')

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
                        'FIND-CLIPPY',
                        `Sending primary Find Clippy request | offerId=${offerId} | url=${request.url}`
                    )

                    const response = await this.bot.axios.request(request)
                    success = true

                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'FIND-CLIPPY',
                        `Received primary Find Clippy response | offerId=${offerId} | status=${response.status}`
                    )

                } catch (primaryError) {
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'FIND-CLIPPY',
                        `Primary method failed, trying dashboard fallback | offerId=${offerId} | error=${primaryError instanceof Error ? primaryError.message : String(primaryError)}`
                    )
                }
            }

            // If primary method failed or no token, try dashboard method
            if (!success) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'FIND-CLIPPY',
                    `Using dashboard fallback method | offerId=${offerId}`
                )

                await this.tryDashboardMethod(promotion)
                success = true // Assume success for now
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
                            'FIND-CLIPPY',
                            `✅ Found Clippy | offerId=${offerId} | gainedPoints=${this.gainedPoints} | newBalance=${newBalance}`,
                            'green'
                        )
                    } else {
                        this.bot.logger.warn(
                            this.bot.isMobile,
                            'FIND-CLIPPY',
                            `Found Clippy but no points were gained | offerId=${offerId} | oldBalance=${this.oldBalance} | newBalance=${newBalance}`
                        )
                    }
                } catch (balanceError) {
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'FIND-CLIPPY',
                        `Could not verify points after Find Clippy | offerId=${offerId} | error=${balanceError instanceof Error ? balanceError.message : String(balanceError)}`
                    )
                }
            }

            this.bot.logger.debug(this.bot.isMobile, 'FIND-CLIPPY', `Waiting after Find Clippy | offerId=${offerId}`)

            await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 10000))
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'FIND-CLIPPY',
                `Error in doFindClippy | offerId=${offerId} | message=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async tryDashboardMethod(promotion: FindClippyPromotion) {
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
                'FIND-CLIPPY',
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
                'FIND-CLIPPY',
                `Sending dashboard Find Clippy request | offerId=${offerId} | url=${request.url}`
            )

            const response = await this.bot.axios.request(request)

            this.bot.logger.info(
                this.bot.isMobile,
                'FIND-CLIPPY',
                `Dashboard method completed | offerId=${offerId} | status=${response.status}`
            )

        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'FIND-CLIPPY',
                `Dashboard method failed | offerId=${promotion.offerId} | error=${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }
}
