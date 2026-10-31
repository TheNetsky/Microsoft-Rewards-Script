import { activityResult, type ActivityResult } from '../../shared/ActivityResult'
import type { BasePromotion, RewardsDashboard, RewardsState } from '../../types/RewardsState'
import { BaseActivity } from '../../shared/activities/BaseActivity'
import { detectSearchMultiplierPerk } from '../../shared/SearchMultiplierPerk'
import { BrowserUrlReward } from './BrowserUrlReward'

export class BrowserRewardsActions extends BaseActivity {
    async activateSearchPerk(data: RewardsState): Promise<ActivityResult> {
        const perk = detectSearchMultiplierPerk(data.dashboard)
        if (!perk) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'ACTIVATE-SEARCH-PERK-BROWSER',
                'No search multiplier is available'
            )
            return activityResult('skipped', 'perk-unavailable')
        }

        const promotion = this.findPromotion(data.dashboard, perk.offerId)
        if (!promotion) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'ACTIVATE-SEARCH-PERK-BROWSER',
                `Search multiplier data has no rendered promotion metadata | offerId=${perk.offerId}`
            )
            return activityResult('unconfirmed', 'promotion-unavailable')
        }

        return new BrowserUrlReward(this.bot).run(promotion, 'other', { allowZeroPoint: true })
    }

    private findPromotion(dashboard: RewardsDashboard, offerId: string): BasePromotion | undefined {
        const promotions: BasePromotion[] = [
            ...(dashboard.promotionalItems ?? []),
            ...(dashboard.promotionalItem ? [dashboard.promotionalItem] : []),
            ...Object.values(dashboard.dailySetPromotions ?? {}).flat(),
            ...(dashboard.morePromotions ?? []),
            ...(dashboard.morePromotionsWithoutPromotionalItems ?? [])
        ]
        return promotions.find(promotion => promotion.offerId === offerId)
    }
}
