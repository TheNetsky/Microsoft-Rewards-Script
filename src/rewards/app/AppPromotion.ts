import type { Promotion } from './types/AppDashboardData'
import { pointValue } from '../shared/PointAccounting'

export function appOfferId(promotion: Promotion): string {
    return promotion.attributes.offerid?.trim() || promotion.name.trim()
}

export function findAppPromotion(promotions: Promotion[], target: Promotion): Promotion | undefined {
    const offerId = appOfferId(target).toLowerCase()
    return offerId ? promotions.find(promotion => appOfferId(promotion).toLowerCase() === offerId) : undefined
}

export function appPromotionType(promotion: Promotion): string {
    const type = promotion.attributes.type?.trim().toLowerCase()
    const offerId = appOfferId(promotion).toLowerCase()
    if (type === 'checkin' || offerId === 'gamification_sapphire_dailycheckin') return 'checkin'
    if (type === 'msnreadearn' || offerId === 'enus_readarticle3_30points') return 'msnreadearn'
    return type ?? ''
}

export function isAppPromotionComplete(promotion: Promotion): boolean {
    if (promotion.attributes.complete?.trim().toLowerCase() === 'true') return true
    const progress = pointValue(promotion.attributes.pointprogress)
    const max = pointValue(promotion.attributes.pointmax)
    return progress !== null && max !== null && max > 0 && progress >= max
}
