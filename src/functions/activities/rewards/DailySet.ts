import { BaseActivity } from '../BaseActivity'
import type { BasePromotion, DashboardData } from '../../../interface/DashboardData'
import { PromotionActivityRunner } from './PromotionActivityRunner'

export class DailySet extends BaseActivity {
    public async run(data: DashboardData): Promise<void> {
        const today = this.bot.utils.getFormattedDate()
        let pending: BasePromotion[] =
            data.dashboard.dailySetPromotions[today]?.filter(item => !item.complete && item.pointProgressMax > 0) ?? []

        if (!pending.length && this.bot.reactSnapshot?.offers) {
            const reactDailySet = this.bot.reactSnapshot.offers.filter(
                o => o.offerId.toLowerCase().includes('dailyset') && !o.isCompleted && o.points > 0 && o.reportable
            )
            if (reactDailySet.length) {
                pending = reactDailySet.map(o => ({
                    offerId: o.offerId,
                    title: o.title || o.offerId,
                    complete: o.isCompleted,
                    pointProgressMax: o.points,
                    promotionType: 'urlreward',
                    destinationUrl: o.destination,
                    hash: o.hash,
                    activityType: o.activityType ?? 11
                } as unknown as BasePromotion))
            }
        }

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
