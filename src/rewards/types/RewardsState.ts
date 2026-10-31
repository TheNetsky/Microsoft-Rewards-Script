import type { BasePromotion, PunchCard } from '../shared/Promotion'

export type { BasePromotion, PunchCard } from '../shared/Promotion'

export interface RewardsState {
    dashboard: RewardsDashboard
    account: AccountInfo
    profile: Profile
    sourceInfo: RewardsSourceInfo
    raw: { source: 'rewards-api' | 'bing-flyout' | 'rewards-earn'; payload: unknown }
}

export interface AccountInfo {
    level: number | null
    pointsProgress: number | null
    pointsRemaining: number | null
    lifetimeEarn: number | null
    availablePoints: number | null
}

export interface LevelInfo {
    activeLevel: string | null
    activeLevelName: string | null
    progress: number | null
    progressMax: number | null
}

export interface RewardsDashboard {
    userStatus: UserStatus
    userProfile: Profile
    userWarnings: UserWarning[]
    dailySetPromotions: Record<string, BasePromotion[]>
    morePromotions: BasePromotion[]
    morePromotionsWithoutPromotionalItems: BasePromotion[]
    promotionalItem: BasePromotion | null
    promotionalItems: BasePromotion[]
    punchCards: PunchCard[]
    streakPromotion: BasePromotion | null
    streakBonusPromotions: BasePromotion[]
    streakProtectionPromo: { streakProtectionStatus?: unknown; remainingDays?: unknown } | null
    pointClaimBannerPromotion: BasePromotion | null
    highValueSweepstakesPromotions: BasePromotion[]
    componentImpressionPromotions: BasePromotion[]
    autoRedeemItem: unknown
    isAutoRedeemEligible: boolean
}

export interface UserStatus {
    level: number | null
    levelInfo: LevelInfo | null
    availablePoints: number
    lifetimePoints: number
    lifetimePointsRedeemed: number
    lifetimeGivingPoints: number
    isRewardsUser: boolean
    counters: Counters
}

export interface Counters {
    pcSearch?: BasePromotion[]
    mobileSearch?: BasePromotion[]
    activityAndQuiz?: BasePromotion[]
    dailyPoint?: BasePromotion[]
}
export interface Profile {
    ruid?: string
    attributes: Record<string, unknown> & { country?: string }
}
export interface UserWarning {
    name: string
}
export interface RewardsSourceInfo {
    source: 'rewards-api' | 'bing-flyout' | 'rewards-earn'
    activities: RewardsSourceActivity[]
    missingSections: string[]
    metadata?: FlyoutMetadata
}
export interface FlyoutMetadata {
    parsedSections: string[]
    promotionSections: string[]
    rewardsCountry: string | null
    layoutName: string | null
    traceId: string | null
    catalogItemCount: number
    orderCount: number
    suggestedSearchCount: number
    hasGoal: boolean
    hasAutoRedeem: boolean
}
export interface RewardsSourceActivity {
    offerId: string
    title: string
    sources: string[]
    kind: 'urlReward' | 'searchOnBing' | 'statusCard' | 'unsupported'
    actionable: boolean
    reason?: string
}
