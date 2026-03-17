import type { AxiosRequestConfig } from 'axios'
import { Workers } from '../../Workers'
import { PromotionalItem } from '../../../interface/DashboardData'
import { randomUUID } from 'crypto'

export class DoubleSearchPoints extends Workers {
    private cookieHeader: string = ''

    private fingerprintHeader: { [x: string]: string } = {}

    public async doDoubleSearchPoints(promotion: PromotionalItem) {
        const offerId = promotion.offerId
        const activityType = promotion.activityType

        try {
            // Skip requestToken check for V4
            // if (!this.bot.requestToken && this.bot.rewardsVersion === 'legacy') {
            //     this.bot.logger.warn(
            //         this.bot.isMobile,
            //         'DOUBLE-SEARCH-POINTS',
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
                'DOUBLE-SEARCH-POINTS',
                `Starting Double Search Points | offerId=${offerId}`
            )

            this.bot.logger.debug(
                this.bot.isMobile,
                'DOUBLE-SEARCH-POINTS',
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
                'DOUBLE-SEARCH-POINTS',
                `Prepared Double Search Points JSON data | offerId=${offerId} | hash=${promotion.hash} | amount=1 | type=${activityType}`
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
                'DOUBLE-SEARCH-POINTS',
                `Sending Double Search Points request | offerId=${offerId} | url=${request.url}`
            )

            const response = await this.bot.axios.request(request)

            this.bot.logger.debug(
                this.bot.isMobile,
                'DOUBLE-SEARCH-POINTS',
                `Received Double Search Points response | offerId=${offerId} | status=${response.status}`
            )

            const data = await this.bot.browser.func.getDashboardData()
            const promotionalItem = data.promotionalItems.find(item =>
                item.name.toLowerCase().includes('ww_banner_optin_2x')
            )

            // If OK, should no longer be present in promotionalItems
            if (promotionalItem) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'DOUBLE-SEARCH-POINTS',
                    `Unable to find or activate Double Search Points | offerId=${offerId} | status=${response.status}`
                )
            } else {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'DOUBLE-SEARCH-POINTS',
                    `Activated Double Search Points | offerId=${offerId} | status=${response.status}`,
                    'green'
                )
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
}
