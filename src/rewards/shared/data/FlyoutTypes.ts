import type { Profile, UserWarning } from '../../types/RewardsState'
import type { RawPromotion } from '../Promotion'

type FlyoutProfileAttributes = Profile['attributes'] & {
    rbs?: string | number
    rbs_upd?: string
    SerpBotScore_upd?: string
    AdsBotScore_upd?: string
}

interface FlyoutProfile extends Omit<Profile, 'attributes'> {
    attributes: FlyoutProfileAttributes
}

interface FlyoutCounters {
    PCSearch?: RawPromotion[]
    MobileSearch?: RawPromotion[]
    ActivityAndQuiz?: RawPromotion[]
    DailyPoint?: RawPromotion[]
    pcSearch?: RawPromotion[]
    mobileSearch?: RawPromotion[]
    activityAndQuiz?: RawPromotion[]
    dailyPoint?: RawPromotion[]
}

interface FlyoutUserStatus {
    availablePoints?: number
    lifetimePoints?: number
    lifetimeGivingPoints?: number
    lifetimePointsRedeemed?: number
    isRewardsUser?: boolean
    counters?: FlyoutCounters
    userWarnings?: UserWarning[]
    [key: string]: unknown
}

export interface FlyoutResult {
    userStatus?: FlyoutUserStatus
    dailySetPromotions?: Record<string, RawPromotion[]>
    morePromotions?: RawPromotion[]
    morePromotionsWithoutPromotionalItems?: RawPromotion[]
    highValueActionPromotions?: RawPromotion[]
    edgeHighValueActionPromotions?: RawPromotion[]
    browseStreakPromotions?: RawPromotion[]
    exploreOnBingPromotions?: RawPromotion[]
    exploreOnOutlookPromotions?: RawPromotion[]
    onboardingChecklistPromotions?: RawPromotion[]
    dailySurpriseL2Promotions?: RawPromotion[]
    impressionPromotions?: RawPromotion[]
    acquisitionPromotion?: RawPromotion | null
    bingOnboardingPromotion?: RawPromotion | null
    bingTrialStreakPromotion?: RawPromotion | null
    dailySurprisePromotion?: RawPromotion | null
    edgeAcquisitionPromotion?: RawPromotion | null
    exploreOnBingAnyCardCompletionPromotion?: RawPromotion | null
    onboardingChecklistBonusPromotion?: RawPromotion | null
    onboardingPromotion?: RawPromotion | null
    oneTimeStreakPromotion?: RawPromotion | null
    partnerGreetingPromotion?: RawPromotion | null
    searchStreakPromotion?: RawPromotion | null
    streakPromotion?: RawPromotion | null
    streakBonusPromotions?: RawPromotion[]
    searchAndEarnPromotion?: RawPromotion | null
    dailyCheckInPromotion?: RawPromotion | null
    streakProtectionPromo?: RawPromotion | null
    pointClaimCardPromotion?: RawPromotion | null
    pointClaimBannerPromotion?: RawPromotion | null
    highValueSweepstakesPromotions?: RawPromotion[]
    autoRedeemPromotion?: RawPromotion | null
    flyoutCatalogItem?: RawPromotion | null
    goalCardPromotion?: RawPromotion | null
    levelBenefitsPromotion?: RawPromotion | null
    levelInfoPromotion?: RawPromotion | null
    machineTranslationPromo?: RawPromotion | null
    isAutoRedeemEligible?: boolean
    layout?: { layoutName?: string; [key: string]: unknown } | null
    suggestedSearches?: { suggestedItems?: unknown[]; [key: string]: unknown } | null
    traceId?: string
    userAutoRedeemItem?: unknown
    userAutoRedeemType?: unknown
    userGoal?: unknown
    userOrders?: unknown[]
    userWarnings?: UserWarning[]
    punchCards?: unknown[]
    [key: string]: unknown
}

interface FlyoutUserInfo {
    isRewardsUser?: boolean
    balance?: number
    lifetimeGivingPoints?: number
    errorCode?: number
    errorMessage?: string | null
    profile?: FlyoutProfile
    rewardsCountry?: string
    catalogGoal?: unknown
    catalogItems?: unknown[]
    orders?: unknown[]
    autoRedeemItem?: unknown
    autoRedeemProfile?: unknown
    rebateProfile?: unknown
    userWarnings?: UserWarning[]
    promotions?: Array<{
        name?: string
        priority?: number
        attributes?: Record<string, unknown>
    }>
    [key: string]: unknown
}

export interface RewardsFlyoutData {
    isError?: boolean
    errorMessage?: string | null
    userInfo?: FlyoutUserInfo
    flyoutResult?: FlyoutResult
    userWarnings?: UserWarning[]
    [key: string]: unknown
}
