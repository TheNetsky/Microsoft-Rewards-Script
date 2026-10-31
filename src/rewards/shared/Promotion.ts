import type { RewardsDashboard } from '../types/RewardsState'

export interface BasePromotion {
    name: string | null
    offerId: string
    title: string
    description: string
    destinationUrl: string
    promotionType: string
    promotionSubtype: string
    attributes: Record<string, unknown>
    complete: boolean
    priority: number
    isHidden: boolean
    pointProgress: number
    pointProgressKnown?: boolean
    pointProgressMax: number
    pointProgressMaxKnown?: boolean
    activityProgress: number
    activityProgressMax: number
    exclusiveLockedFeatureStatus: string
    hash?: string
    activityType?: string | number | null
}

export type RawPromotion = Partial<BasePromotion> & Record<string, unknown>
export interface PunchCard {
    parentPromotion: BasePromotion
    childPromotions: BasePromotion[]
}

export function getWebPromotions(dashboard: RewardsDashboard): BasePromotion[] {
    return [
        ...Object.values(dashboard.dailySetPromotions ?? {}).flat(),
        ...(dashboard.morePromotions ?? []),
        ...(dashboard.morePromotionsWithoutPromotionalItems ?? []),
        ...(dashboard.promotionalItems ?? []),
        ...(dashboard.promotionalItem ? [dashboard.promotionalItem] : [])
    ]
}

export function getMorePromotions(dashboard: RewardsDashboard): BasePromotion[] {
    const promotions = [...(dashboard.morePromotions ?? []), ...(dashboard.morePromotionsWithoutPromotionalItems ?? [])]
    return [
        ...new Map(
            promotions.map((item, index) => {
                const key =
                    item.offerId?.trim() ||
                    item.name?.trim() ||
                    [item.promotionType, item.title, item.destinationUrl].filter(Boolean).join('|') ||
                    `anonymous-${index}`
                return [key, item] as const
            })
        ).values()
    ]
}
