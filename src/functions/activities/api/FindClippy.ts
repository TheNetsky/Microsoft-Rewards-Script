import type { AxiosRequestConfig } from 'axios'
import type { FindClippyPromotion } from '../../../interface/DashboardData'
import { Workers } from '../../Workers'
import { randomUUID } from 'crypto'

export class FindClippy extends Workers {
    private cookieHeader: string = ''

    private fingerprintHeader: { [x: string]: string } = {}

    private gainedPoints: number = 0

    private oldBalance: number = this.bot.userData.currentPoints

    public async doFindClippy(promotion: FindClippyPromotion) {
        const offerId = promotion.offerId
        const activityType = promotion.activityType

        try {
            // Skip requestToken check for V4
            // if (!this.bot.requestToken && this.bot.rewardsVersion === 'legacy') {
            //     this.bot.logger.warn(
            //         this.bot.isMobile,
            //         'FIND-CLIPPY',
            //         'Skipping: Request token not available, this activity requires it!'
            //     )
            //     return
            // }

            this.cookieHeader = this.bot.browser.func.buildCookieHeader(
                this.bot.isMobile ? this.bot.cookies.mobile : this.bot.cookies.desktop,
                ['bing.com', 'live.com', 'microsoftonline.com']
            )

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

            // V4: Use mobile API with Bearer token
            const jsonData = {
                amount: 1,
                id: randomUUID(),
                type: 101,
                attributes: {
                    offerid: offerId
                },
                country: this.bot.userData.geoLocale
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'FIND-CLIPPY',
                `Prepared Find Clippy JSON data | offerId=${offerId} | hash=${promotion.hash} | amount=1 | type=${activityType}`
            )

            const request: AxiosRequestConfig = {
                url: 'https://prod.rewardsplatform.microsoft.com/dapi/me/activities',
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.bot.accessToken}`,
                    'User-Agent':
                        'Bing/32.5.431027001 (com.microsoft.bing; build:431027001; iOS 17.6.1) Alamofire/5.10.2',
                    'Content-Type': 'application/json',
                    'X-Rewards-Country': this.bot.userData.geoLocale,
                    'X-Rewards-Language': 'en',
                    'X-Rewards-ismobile': 'true'
                },
                data: JSON.stringify(jsonData)
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'FIND-CLIPPY',
                `Sending Find Clippy request | offerId=${offerId} | url=${request.url}`
            )

            const response = await this.bot.axios.request(request)

            this.bot.logger.debug(
                this.bot.isMobile,
                'FIND-CLIPPY',
                `Received Find Clippy response | offerId=${offerId} | status=${response.status}`
            )

            const newBalance = await this.bot.browser.func.getCurrentPoints()
            this.gainedPoints = newBalance - this.oldBalance

            this.bot.logger.debug(
                this.bot.isMobile,
                'FIND-CLIPPY',
                `Balance delta after Find Clippy | offerId=${offerId} | oldBalance=${this.oldBalance} | newBalance=${newBalance} | gainedPoints=${this.gainedPoints}`
            )

            if (this.gainedPoints > 0) {
                this.bot.userData.currentPoints = newBalance
                this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + this.gainedPoints

                this.bot.logger.info(
                    this.bot.isMobile,
                    'FIND-CLIPPY',
                    `Found Clippy | offerId=${offerId} | status=${response.status} | gainedPoints=${this.gainedPoints} | newBalance=${newBalance}`,
                    'green'
                )
            } else {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'FIND-CLIPPY',
                    `Found Clippy but no points were gained | offerId=${offerId} | status=${response.status} | oldBalance=${this.oldBalance} | newBalance=${newBalance}`
                )
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
}
