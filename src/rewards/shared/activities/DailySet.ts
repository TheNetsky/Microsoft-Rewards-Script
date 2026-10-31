import { isEligiblePromotion } from '../PromotionEligibility'
import { BaseActivity } from './BaseActivity'
import type { RewardsState } from '../../types/RewardsState'
import { PromotionRunner } from './PromotionRunner'

export class DailySet extends BaseActivity {
    async run(data: RewardsState): Promise<void> {
        const today = this.bot.utils.formatDate(Date.now(), this.bot.userData.timezone)
        const pending =
            data.dashboard.dailySetPromotions[today]?.filter(item =>
                isEligiblePromotion(item, this.bot.config.skipNonPointTasks)
            ) ?? []

        if (!pending.length) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'DAILY-SET',
                'No eligible pending "Daily Set" items in the current data'
            )
            return
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'DAILY-SET',
            `Started solving "Daily Set" items | remaining=${pending.length}`
        )
        await new PromotionRunner(this.bot).run(pending, 'daily-set')
        this.bot.logger.debug(this.bot.isMobile, 'DAILY-SET', 'Finished processing "Daily Set" items')
    }
}
