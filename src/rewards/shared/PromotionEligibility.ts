import type { BasePromotion } from '../types/RewardsState'

const SKIPPED_OFFER_IDS: ReadonlySet<string> = new Set(
    ['WW_Rewards_offerlist_500_points_202503', 'Gamification_Sapphire_DailyCheckIn'].map(id => id.toLowerCase())
)

export function isPromotionComplete(promotion: BasePromotion | undefined): boolean {
    return Boolean(
        promotion &&
        (promotion.complete ||
            (promotion.pointProgressMax > 0 && promotion.pointProgress >= promotion.pointProgressMax))
    )
}

export function isSkippedOffer(offerId: string | null | undefined, destination?: string): boolean {
    if (offerId && SKIPPED_OFFER_IDS.has(offerId.trim().toLowerCase())) return true
    if (!destination) return false
    try {
        const url = new URL(destination, 'https://rewards.bing.com')
        return [...url.searchParams].some(
            ([key, value]) => key.toLowerCase() === 'offerid' && SKIPPED_OFFER_IDS.has(value.trim().toLowerCase())
        )
    } catch {
        return false
    }
}

export function isEligiblePromotion(promotion: BasePromotion, skipNonPointTasks: boolean): boolean {
    if (isSkippedOffer(promotion.offerId, promotion.destinationUrl)) return false
    if (promotion.complete || promotion.isHidden || promotion.exclusiveLockedFeatureStatus === 'locked') return false
    if (!promotion.promotionType) return false
    if (promotion.pointProgressMax > 0 && promotion.pointProgress >= promotion.pointProgressMax) return false
    if (skipNonPointTasks && promotion.pointProgressMax <= 0) return false
    if (promotion.priority < 0 && promotion.exclusiveLockedFeatureStatus !== 'unlocked') return false
    const attributes = promotion.attributes as Record<string, unknown> | null | undefined
    return String(attributes?.promotional ?? '').toLowerCase() !== 'true'
}

export function isSearchOnBingPromotion(promotion: BasePromotion): boolean {
    const attributes =
        promotion.attributes && typeof promotion.attributes === 'object'
            ? (promotion.attributes as Record<string, unknown>)
            : {}
    const markers = [promotion.name, promotion.offerId, promotion.promotionSubtype, attributes.offerid, attributes.type]
        .filter(value => typeof value === 'string')
        .join(' ')
    let isSearchOnBing =
        /explore[\s_-]*on[\s_-]*bing/i.test(markers) ||
        String(attributes.isExploreOnBingTask ?? '').toLowerCase() === 'true'
    if (!isSearchOnBing) {
        try {
            isSearchOnBing = new URL(promotion.destinationUrl).searchParams.get('rwAutoFlyout')?.toLowerCase() === 'exb'
        } catch {
            // Ignore
        }
    }
    return isSearchOnBing
}
