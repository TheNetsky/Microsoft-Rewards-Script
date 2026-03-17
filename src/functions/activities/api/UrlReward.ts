import type { AxiosRequestConfig } from 'axios'
import type { BasePromotion } from '../../../interface/DashboardData'
import type { PanelFlyoutData } from '../../../interface/PanelFlyoutData'
import { Workers } from '../../Workers'

export class UrlReward extends Workers {
    private cookieHeader: string = ''

    private fingerprintHeader: { [x: string]: string } = {}

    private gainedPoints: number = 0

    private oldBalance: number = this.bot.userData.currentPoints

    public async doUrlReward(promotion: BasePromotion) {
        if (!this.bot.requestToken && this.bot.rewardsVersion === 'legacy') {
            this.bot.logger.warn(
                this.bot.isMobile,
                'URL-REWARD',
                'Skipping: Request token not available, this activity requires it!'
            )
            return
        }

        const offerId = promotion.offerId

        this.bot.logger.info(
            this.bot.isMobile,
            'URL-REWARD',
            `Starting UrlReward | offerId=${offerId} | geo=${this.bot.userData.geoLocale} | oldBalance=${this.oldBalance}`
        )

        try {
            this.cookieHeader = this.bot.browser.func.buildCookieHeader(
                this.bot.isMobile ? this.bot.cookies.mobile : this.bot.cookies.desktop,
                ['bing.com', 'live.com', 'microsoftonline.com']
            )

            const fingerprintHeaders = { ...this.bot.fingerprint.headers }
            delete fingerprintHeaders['Cookie']
            delete fingerprintHeaders['cookie']
            this.fingerprintHeader = fingerprintHeaders

            this.bot.logger.debug(
                this.bot.isMobile,
                'URL-REWARD',
                `Prepared UrlReward headers | offerId=${offerId} | cookieLength=${this.cookieHeader.length} | fingerprintHeaderKeys=${Object.keys(this.fingerprintHeader).length}`
            )

            // V4: Find promotion in panelData
            const panelData: PanelFlyoutData = this.bot.panelData
            const todayKey = this.bot.utils.getFormattedDate()
            const userInfo = (panelData as any)?.userInfo

            const panelPromotion =
                userInfo?.morePromotions?.find((p: any) => p.offerId === offerId) ||
                panelData?.flyoutResult?.dailySetPromotions?.[todayKey]?.find((p: any) => p.offerId === offerId)

            if (!panelPromotion) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'URL-REWARD',
                    `Promotion not found in panel data | offerId=${offerId}`
                )
                // Fallback to original activity if panel data not available
            }

            // V4 API uses different endpoint and JSON payload
            const jsonData = {
                ActivityCount: 1,
                ActivityType: panelPromotion?.activityType ?? 0,
                ActivitySubType: '',
                OfferId: offerId,
                AuthKey: panelPromotion?.hash ?? promotion.hash,
                Channel: panelData?.channel ?? 'BingRewards',
                PartnerId: panelData?.partnerId ?? 'BingRewards',
                UserId: panelData?.userId ?? ''
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'URL-REWARD',
                `Prepared UrlReward JSON data | offerId=${offerId} | hash=${panelPromotion?.hash ?? promotion.hash}`
            )

            const request: AxiosRequestConfig = {
                url: 'https://www.bing.com/msrewards/api/v1/reportactivity',
                method: 'POST',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {}),
                    'Content-Type': 'application/json',
                    Origin: 'https://www.bing.com'
                },
                data: JSON.stringify(jsonData)
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'URL-REWARD',
                `Sending UrlReward request | offerId=${offerId} | url=${request.url}`
            )

            const response = await this.bot.axios.request(request)

            this.bot.logger.debug(
                this.bot.isMobile,
                'URL-REWARD',
                `Received UrlReward response | offerId=${offerId} | status=${response.status}`
            )

            const newBalance = await this.bot.browser.func.getCurrentPoints()
            this.gainedPoints = newBalance - this.oldBalance

            this.bot.logger.debug(
                this.bot.isMobile,
                'URL-REWARD',
                `Balance delta after UrlReward | offerId=${offerId} | oldBalance=${this.oldBalance} | newBalance=${newBalance} | gainedPoints=${this.gainedPoints}`
            )

            if (this.gainedPoints > 0) {
                this.bot.userData.currentPoints = newBalance
                this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + this.gainedPoints

                this.bot.logger.info(
                    this.bot.isMobile,
                    'URL-REWARD',
                    `Completed UrlReward | offerId=${offerId} | status=${response.status} | gainedPoints=${this.gainedPoints} | newBalance=${newBalance}`,
                    'green'
                )
            } else {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'URL-REWARD',
                    `Failed UrlReward with no points | offerId=${offerId} | status=${response.status} | oldBalance=${this.oldBalance} | newBalance=${newBalance}`
                )
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
}
