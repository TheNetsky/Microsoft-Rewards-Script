import type { RawPromotion } from '../Promotion'

export interface ApiDashboardResponse {
    dashboard?: {
        userStatus?: Record<string, unknown>
        userProfile?: Record<string, unknown>
        userWarnings?: unknown[]
        dailySetPromotions?: Record<string, RawPromotion[]>
        morePromotions?: RawPromotion[]
        morePromotionsWithoutPromotionalItems?: RawPromotion[]
        promotionalItem?: RawPromotion | null
        promotionalItems?: RawPromotion[]
        [key: string]: unknown
    }
    profile?: Record<string, unknown>
    status?: unknown
    catalog?: unknown
    badges?: unknown
    [key: string]: unknown
}
