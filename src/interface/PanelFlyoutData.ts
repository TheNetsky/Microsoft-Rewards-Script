export interface PanelFlyoutData {
    channel: string
    partnerId: string
    userId: string
    flyoutResult: FlyoutResult
}

export interface FlyoutResult {
    morePromotions: PanelPromotion[]
    dailySetPromotions: { [date: string]: PanelPromotion[] }
    userStatus: PanelUserStatus
}

export interface PanelPromotion {
    offerId: string
    hash: string
    activityType: number
    title: string
    points: number
    isCompleted: boolean
    destinationUrl?: string
    destination?: string
}

export interface PanelUserStatus {
    availablePoints: number
    lifetimePoints: number
    userId: string
}
