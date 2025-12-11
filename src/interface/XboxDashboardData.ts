export interface XboxDashboardData {
    response: Response
    correlationId: string
    code: number
}

export interface Response {
    profile: null
    balance: number
    counters: { [key: string]: string }
    promotions: Promotion[]
    catalog: null
    goal_item: null
    activities: null
    cashback: null
    orders: null
    rebateProfile: null
    rebatePayouts: null
    giveProfile: null
    autoRedeemProfile: null
    autoRedeemItem: null
    thirdPartyProfile: null
    notifications: null
    waitlist: null
    autoOpenFlyout: null
    coupons: null
    recommendedAffordableCatalog: null
    generativeAICreditsBalance: null
    requestCountryCatalog: null
    donationCatalog: null
}

export interface Promotion {
    name: string
    priority: number
    attributes: { [key: string]: string }
    tags: Tag[]
}

export enum Tag {
    ExcludeHidden = 'exclude_hidden',
    NonGlobalConfig = 'non_global_config'
}
