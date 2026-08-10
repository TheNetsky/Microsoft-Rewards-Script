import { BaseActivity } from '../BaseActivity'
import type { AppDashboardData } from '../../../interface/AppDashBoardData'

export class AppPromotions extends BaseActivity {
    public async run(data: AppDashboardData): Promise<void> {
        const pending = data.response.promotions.filter(promotion => {
            const attributes = promotion.attributes
            return (
                attributes['complete']?.toLowerCase() === 'false' &&
                Boolean(attributes['offerid']) &&
                attributes['type'] === 'sapphire'
            )
        })

        if (!pending.length) {
            this.bot.logger.info(
                this.bot.isMobile,
                'APP-PROMOTIONS',
                'All "App Promotions" items have already been completed'
            )
            return
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'APP-PROMOTIONS',
            `Started solving "App Promotions" items | remaining=${pending.length}`
        )
        for (const promotion of pending) {
            await this.bot.activities.doAppReward(promotion)
            await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 15000))
        }
        this.bot.logger.info(this.bot.isMobile, 'APP-PROMOTIONS', 'Finished processing "App Promotions" items')
    }
}
