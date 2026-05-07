export interface AppDashboardData {
    response: Response
    correlationId: string
    code: number
}

export interface Response {
    profile: Profile
    balance: number
    counters: null
    promotions: Promotion[]
    catalog: null
    goal_item: GoalItem
    activities: null
    cashback: null
    orders: unknown[]
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

export interface GoalItem {
    name: string
    provider: string
    price: number
    attributes: GoalItemAttributes
    config: Config
}

export interface GoalItemAttributes {
    category: string
    CategoryDescription: string
    'desc.group_text': string
    'desc.legal_text': string
    'desc.sc_description': string
    'desc.sc_title': string
    display_order: string
    ExtraLargeImage: string
    group: string
    group_image: string
    group_sc_image: string
    group_title: string
    hidden: string
    large_image: string
    large_sc_image: string
    medium_image: string
    MobileImage: string
    original_price: string
    points_destination: string
    points_source: string
    Remarks: string
    ShortText: string
    showcase: string
    small_image: string
    title: string
    cimsid: string
    user_defined_goal: string
}

export interface Config {
    isHidden: string
}

export interface Profile {
    ruid: string
    attributes: ProfileAttributes
    offline_attributes: OfflineAttributes
}

export interface ProfileAttributes {
    ismsaautojoined: string
    created: Date
    creative: string
    publisher: string
    program: string
    country: string
    target: string
    epuid: string
    level: string
    level_upd: Date
    iris_segmentation: string
    iris_segmentation_upd: Date
    waitlistattributes: string
    waitlistattributes_upd: Date
}

export interface OfflineAttributes {}

export interface Promotion {
    name: string
    priority: number
    attributes: { [key: string]: string }
    tags: string[]
}
