import type { BasePromotion, RewardsDashboard } from '../../types/RewardsState'
import { isSkippedOffer } from '../PromotionEligibility'

const BING_TRACKING_PARAMS = new Set(['form', 'ocid', 'publ', 'crea', 'pc', 'channel', 'mkt', 'cc', 'setlang'])

export function findActiveSearchBonus(dashboard: RewardsDashboard): BasePromotion | undefined {
    return searchBonusPools(dashboard).find(promotion => {
        if (!promotion || promotion.complete || isSkippedOffer(promotion.offerId, promotion.destinationUrl))
            return false
        if (!(promotion.pointProgressMax > promotion.pointProgress)) return false
        if ((promotion.promotionType ?? '').toLowerCase() !== 'urlreward') return false
        return isBareBingSearchDestination(promotion.destinationUrl)
    })
}

export function findSearchBonusById(dashboard: RewardsDashboard, offerId: string): BasePromotion | undefined {
    const pools = [...Object.values(dashboard.dailySetPromotions ?? {}).flat(), ...searchBonusPools(dashboard)]
    return pools.find(promotion => promotion.offerId === offerId)
}

function searchBonusPools(dashboard: RewardsDashboard): BasePromotion[] {
    return [
        ...(dashboard.morePromotions ?? []),
        ...(dashboard.morePromotionsWithoutPromotionalItems ?? []),
        ...(dashboard.promotionalItems ?? [])
    ]
}

function isBareBingSearchDestination(raw?: string): boolean {
    if (!raw) return false

    try {
        const url = new URL(raw)
        const isBingHost = /(^|\.)bing\.com$/i.test(url.hostname)
        const isRootPath = url.pathname === '' || url.pathname === '/'
        if (!isBingHost || !isRootPath) return false

        for (const key of url.searchParams.keys()) {
            if (!BING_TRACKING_PARAMS.has(key.toLowerCase())) return false
        }
        return true
    } catch {
        return false
    }
}
