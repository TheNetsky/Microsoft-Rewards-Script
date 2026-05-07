import type { Page } from 'patchright'
import type { BasePromotion } from '../../../interface/DashboardData'
import { Workers } from '../../Workers'

export class ExploreOnBingActivation extends Workers {
    private getActiveRewardsPageForActivation(): Page {
        const page = this.bot.isMobile ? this.bot.mainMobilePage : this.bot.mainDesktopPage
        if (!page || page.isClosed()) {
            throw new Error('No active rewards page available for activation browser-context request')
        }
        return page
    }

    private async postWithBrowserContext(
        url: string,
        headers: Record<string, string>,
        body: string
    ): Promise<{ status: number }> {
        const page = this.getActiveRewardsPageForActivation()

        const response = await page.context().request.post(url, {
            failOnStatusCode: false,
            headers,
            data: body
        })

        return {
            status: response.status()
        }
    }

    private isCompleted(promotion: BasePromotion): boolean {
        return Boolean(promotion.complete) || this.isCompletedByAttributesOrProgress(promotion)
    }

    private async findDashboardPromotion(offerId: string): Promise<BasePromotion | undefined> {
        try {
            const dashboard = await this.bot.browser.func.getDashboardData()
            const allDaily = Object.values(dashboard.dailySetPromotions ?? {}).flat()
            const allMore = [
                ...(dashboard.morePromotions ?? []),
                ...(dashboard.morePromotionsWithoutPromotionalItems ?? []),
                ...(dashboard.promotionalItems ?? [])
            ]
            const allPunch = (dashboard.punchCards ?? []).flatMap(pc => [pc.parentPromotion, ...(pc.childPromotions ?? [])])
            const all = [...allDaily, ...allMore, ...allPunch] as unknown as BasePromotion[]
            const key = offerId.toLowerCase()

            return all.find(x => {
                const top = String(x.offerId ?? '').toLowerCase()
                const attrs = this.getAttributes(x.attributes)
                const attrOffer = String(attrs.offerid ?? attrs.offerId ?? '').toLowerCase()
                return top === key || attrOffer === key
            })
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'EXPLOREONBING-ACTIVATION',
                `Dashboard context lookup failed | offerId=${offerId} | error=${error instanceof Error ? error.message : String(error)}`
            )
            return undefined
        }
    }

    public async activate(promotion: BasePromotion): Promise<boolean> {
        const offerId = String(promotion.offerId ?? '').trim()
        if (!offerId) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'EXPLOREONBING-ACTIVATION',
                'Skipping activation due to missing offerId'
            )
            return false
        }

        if (this.isCompleted(promotion)) {
            this.bot.logger.info(
                this.bot.isMobile,
                'EXPLOREONBING-ACTIVATION',
                `Skipping activation, already completed from current payload | offerId=${offerId}`
            )
            return true
        }

        const dashboardPromotion = await this.findDashboardPromotion(offerId)
        if (dashboardPromotion && this.isCompleted(dashboardPromotion)) {
            this.bot.logger.info(
                this.bot.isMobile,
                'EXPLOREONBING-ACTIVATION',
                `Skipping activation, already completed in dashboard context | offerId=${offerId}`
            )
            return true
        }

        if (!this.bot.requestToken) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'EXPLOREONBING-ACTIVATION',
                `Skipping activation due to missing request token | offerId=${offerId}`
            )
            return false
        }

        const hash = String(promotion.hash ?? dashboardPromotion?.hash ?? '').trim()
        if (!hash) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'EXPLOREONBING-ACTIVATION',
                `Skipping activation due to missing promotion hash | offerId=${offerId}`
            )
            return false
        }

        try {
            const formData = new URLSearchParams({
                id: offerId,
                hash,
                timeZone: '60',
                activityAmount: '1',
                dbs: '0',
                form: '',
                type: '',
                __RequestVerificationToken: this.bot.requestToken
            })

            const response = await this.postWithBrowserContext(
                'https://rewards.bing.com/api/reportactivity?X-Requested-With=XMLHttpRequest',
                {
                    ...(this.bot.fingerprint?.headers ?? {}),
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest',
                    Referer: 'https://rewards.bing.com/',
                    Origin: 'https://rewards.bing.com'
                },
                formData.toString()
            )

            this.bot.logger.info(
                this.bot.isMobile,
                'EXPLOREONBING-ACTIVATION',
                `Activated exploreonbing task via UrlReward API | offerId=${offerId} | status=${response.status}`
            )
            return true
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'EXPLOREONBING-ACTIVATION',
                `Activation request failed | offerId=${offerId} | error=${error instanceof Error ? error.message : String(error)}`
            )
            return false
        }
    }
}
