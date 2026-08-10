import { BaseActivity } from '../BaseActivity'
import type { DashboardData } from '../../../interface/DashboardData'
import { PromotionActivityRunner } from './PromotionActivityRunner'

export class DailySet extends BaseActivity {
    public async run(data: DashboardData): Promise<void> {
        const today = this.bot.utils.getFormattedDate()
        const pending =
            data.dashboard.dailySetPromotions[today]?.filter(item => !item.complete && item.pointProgressMax > 0) ?? []

        if (!pending.length) {
            this.bot.logger.info(this.bot.isMobile, 'DAILY-SET', 'All "Daily Set" items have already been completed')
            return
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'DAILY-SET',
            `Started solving "Daily Set" items | remaining=${pending.length}`
        )
        await new PromotionActivityRunner(this.bot).run(pending)
        this.bot.logger.info(this.bot.isMobile, 'DAILY-SET', 'Finished processing "Daily Set" items')
    }
}
