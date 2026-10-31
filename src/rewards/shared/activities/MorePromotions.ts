import { getMorePromotions } from '../Promotion'
import { isEligiblePromotion } from '../PromotionEligibility'
import { BaseActivity } from './BaseActivity'
import type { RewardsState } from '../../types/RewardsState'
import { PromotionRunner } from './PromotionRunner'

export class MorePromotions extends BaseActivity {
    async run(data: RewardsState): Promise<void> {
        const promotions = getMorePromotions(data.dashboard)

        const pending = promotions.filter(promotion =>
            isEligiblePromotion(promotion, this.bot.config.skipNonPointTasks)
        )
        if (!pending.length) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'MORE-PROMOTIONS',
                'No eligible pending "More Promotions" items in the current data'
            )
            return
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'MORE-PROMOTIONS',
            `Started solving "More Promotions" items | remaining=${pending.length}`
        )
        await new PromotionRunner(this.bot).run(pending, 'more-promotions')
        this.bot.logger.debug(this.bot.isMobile, 'MORE-PROMOTIONS', 'Finished processing "More Promotions" items')
    }
}
