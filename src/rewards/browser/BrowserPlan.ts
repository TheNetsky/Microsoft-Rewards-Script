import type { Config } from '../../config/Config'
import type { RewardsDashboard } from '../types/RewardsState'
import type { SearchPlan } from '../shared/search/SearchManager'
import { findActiveSearchBonus } from '../shared/search/SearchBonus'
import { isEligiblePromotion, isSearchOnBingPromotion } from '../shared/PromotionEligibility'

export type MobileSessionReason = 'mobile-search' | 'bonus-search' | 'app-api-exceptions' | 'remaining-tasks'

export interface BrowserPlan extends SearchPlan {
    doBonusSearches: boolean
    appApiWorkers: string[]
    mobileSessionReasons: MobileSessionReason[]
    needsMobileSession: boolean
}

export function createBrowserPlan(
    config: Pick<Config, 'workers' | 'searchSettings' | 'activities' | 'skipNonPointTasks'>,
    searchPlan: SearchPlan,
    dashboard: RewardsDashboard,
    today?: string
): BrowserPlan {
    const appApiWorkers = [
        config.workers.doDailyCheckIn && 'doDailyCheckIn',
        config.workers.doAppPromotions && 'doAppPromotions',
        config.workers.doReadToEarn && 'doReadToEarn'
    ].filter((worker): worker is string => Boolean(worker))
    const searchBonus = findActiveSearchBonus(dashboard)
    const doBonusSearches =
        config.workers.doBonusSearches && config.searchSettings.maxBonusSearches > 0 && Boolean(searchBonus)
    const pendingTasks = [
        ...(config.workers.doDailySet
            ? today
                ? (dashboard.dailySetPromotions?.[today] ?? [])
                : Object.values(dashboard.dailySetPromotions ?? {}).flat()
            : []),
        ...(config.workers.doMorePromotions
            ? [...(dashboard.morePromotions ?? []), ...(dashboard.morePromotionsWithoutPromotionalItems ?? [])]
            : [])
    ].some(
        promotion =>
            promotion.offerId !== searchBonus?.offerId &&
            isEligiblePromotion(promotion, config.skipNonPointTasks) &&
            (isSearchOnBingPromotion(promotion)
                ? config.activities.searchOnBing
                : config.activities.urlReward && promotion.promotionType.toLowerCase() === 'urlreward')
    )
    const mobileSessionReasons: MobileSessionReason[] = [
        ...(searchPlan.doMobile ? (['mobile-search'] as const) : []),
        ...(doBonusSearches ? (['bonus-search'] as const) : []),
        ...(appApiWorkers.length ? (['app-api-exceptions'] as const) : []),
        ...(pendingTasks ? (['remaining-tasks'] as const) : [])
    ]

    return {
        ...searchPlan,
        doBonusSearches,
        appApiWorkers,
        mobileSessionReasons,
        needsMobileSession: mobileSessionReasons.length > 0
    }
}
