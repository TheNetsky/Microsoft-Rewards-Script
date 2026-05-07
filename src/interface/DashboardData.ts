export interface DashboardData {
    userStatus: UserStatus
    userWarnings: unknown[]
    promotionalItem: PromotionalItem
    promotionalItems: PurplePromotionalItem[]
    dailySetPromotions: { [key: string]: PromotionalItem[] }
    streakPromotion: StreakPromotion
    streakBonusPromotions: StreakBonusPromotion[]
    punchCards: PunchCard[]
    dashboardFlights: DashboardFlights
    morePromotions: MorePromotion[]
    morePromotionsWithoutPromotionalItems: MorePromotion[]
    suggestedRewards: AutoRedeemItem[]
    coachMarks: CoachMarks
    welcomeTour: WelcomeTour
    userInterests: UserInterests
    isVisualParityTest: boolean
    mbingFlight: null
    componentImpressionPromotions: ComponentImpressionPromotion[]
    machineTranslationPromo: BingUfMachineTranslationPromo
    bingUfMachineTranslationPromo: BingUfMachineTranslationPromo
    streakProtectionPromo: StreakProtectionPromo
    autoRedeemItem: AutoRedeemItem
    isAutoRedeemEligible: boolean
    autoRedeemSubscriptions: unknown[]
    userProfile: UserProfile
    coupons: unknown[]
    couponBannerPromotion: null
    popUpPromotions: BingUfMachineTranslationPromo
    pointClaimBannerPromotion: null
    highValueSweepstakesPromotions: HighValueSweepstakesPromotion[]
    revIpCountryName: null
    shareAndWinPromotion: null
    referAndEarnPromotion: ReferAndEarnPromotion
    giveWithBingNoticePromotion: null
    levelUpHeroBannerPromotion: null
    monthlyBonusHeroBannerPromotion: null
    starBonusWeeklyBannerPromotion: null
    userGeneratedContentPromotion: null
    created: Date
    findClippyPromotion: FindClippyPromotion
}

export enum ExclusiveLockedFeature {
    Locked = 'locked',
    Notsupported = 'notsupported',
    Unlocked = 'unlocked'
}

export enum GiveEligible {
    False = 'False',
    True = 'True'
}

export enum State {
    Complete = 'Complete',
    Default = 'Default'
}

export enum Type {
    Empty = '',
    Quiz = 'quiz',
    Urlreward = 'urlreward'
}

export enum Style {
    ColorBlack = 'color:black',
    Empty = ''
}

export enum LegalLinkText {
    ContinueToMicrosoftEdge = 'Continue to Microsoft Edge',
    Empty = ''
}

export enum Title {
    Empty = '',
    SetAGoal = 'Set a goal'
}

export interface CloseLink {
    text: null | string
    url: null | string
}

export interface SupportedLevels {
    level1?: string
    level2: string
    level2XBoxGold: string
}

export interface Benefit {
    key: string
    text: string
    url: null | string
    helpText: null | string
    supportedLevels: SupportedLevels
}

export interface BasePromotion<
    TAttributes = Record<string, any>,
    TTitleStyle = string,
    TDescriptionStyle = string,
    TLegalLinkText = string,
    TExclusiveLockedFeatureCategory = ExclusiveLockedFeature,
    TPromotionType = string
> {
    name: string
    priority: number
    attributes: TAttributes
    offerId: string
    complete: boolean
    counter: number
    activityProgress: number
    activityProgressMax: number
    pointProgressMax: number
    pointProgress: number
    promotionType: TPromotionType
    promotionSubtype: string
    title: string
    extBannerTitle: string
    titleStyle: TTitleStyle
    theme: string
    description: string
    extBannerDescription: string
    descriptionStyle: TDescriptionStyle
    showcaseTitle: string
    showcaseDescription: string
    imageUrl: string
    dynamicImage: string
    smallImageUrl: string
    backgroundImageUrl: string
    showcaseBackgroundImageUrl: string
    showcaseBackgroundLargeImageUrl: string
    promotionBackgroundLeft: string
    promotionBackgroundRight: string
    iconUrl: string
    animatedIconUrl: string
    animatedLargeBackgroundImageUrl: string
    destinationUrl: string
    linkText: string
    hash: string
    activityType: string
    isRecurring: boolean
    isHidden: boolean
    isTestOnly: boolean
    isGiveEligible: boolean
    level: string
    levelUpActionsProgress: number
    levelUpActivityDefaultSearchEngineDays: number
    levelUpActivityDefaultSearchEngineCompletedAmount: number
    levelUpActivityDailySetStreakDays: number
    levelUpActivityDailySetCompletedAmount: number
    levelUpActivityDailyStreaksCompletedAmount: number
    levelUpActivityXboxGamePassCompleted: boolean
    bingSearchDailyPoints: number
    bingStarMonthlyBonusProgress: number
    bingStarMonthlyBonusMaximum: number
    bingStarBonusWeeklyProgress: number
    bingStarBonusWeeklyState: string
    defaultSearchEngineMonthlyBonusProgress: number
    defaultSearchEngineMonthlyBonusMaximum: number
    defaultSearchEngineMonthlyBonusState: string
    monthlyLevelBonusMaximum: number
    monthlyDistributionChartSrc: string
    monthlyLevelBonusProgress: number
    monthlyLevelBonusState: string
    slidesCount: number
    legalText: string
    legalLinkText: TLegalLinkText
    deviceType: string
    exclusiveLockedFeatureCategory: TExclusiveLockedFeatureCategory
    exclusiveLockedFeatureStatus: ExclusiveLockedFeature
    exclusiveLockedFeatureDestinationUrl: string
    lockedImage: string
    pointsPerSearch: number
    pointsPerSearchNewLevels: number
    lastMonthLevel: string
    sectionalOrdering: number
    isAnimatedRewardEnabled: boolean
    hvaLevelUpActivityDailySetCompletedAmount_V2: string
    hvaLevelUpActivityDailySetCompletedMax_V2: string
    hvaLevelUpActivityDailySetDays_V2: string
    hvaLevelUpActivityDailySetDaysMax_V2: string
    hvaLevelUpActivityDailySetProgress_V2: boolean
    hvaLevelUpActivityDailySetDisplay_V2: boolean
    hvaLevelUpActivityDailyStreaksBingCompletedAmount_V2: string
    hvaLevelUpActivityDailyStreaksBingCompletedMax_V2: string
    hvaLevelUpActivityDailyStreaksBingProgress_V2: boolean
    hvaLevelUpActivityDailyStreaksBingDisplay_V2: boolean
    hvaLevelUpActivityDailyStreaksMobileCompletedAmount_V2: string
    hvaLevelUpActivityDailyStreaksMobileCompletedMax_V2: string
    hvaLevelUpActivityDailyStreaksMobileProgress_V2: boolean
    hvaLevelUpActivityDailyStreaksMobileDisplay_V2: boolean
    hvaLevelUpDefaultSearchEngineCompletedAmount_V2: string
    hvaLevelUpActivityDefaultSearchEngineCompletedMax_V2: string
    hvaLevelUpActivityDefaultSearchEngineDays_V2: string
    hvaLevelUpActivityDefaultSearchEngineDaysMax_V2: string
    hvaLevelUpActivityDefaultSearchEngineProgress_V2: boolean
    hvaLevelUpActivityDefaultSearchEngineDisplay_V2: boolean
    hvaLevelUpActivityXboxGamePassCompletedAmount_V2: string
    hvaLevelUpActivityXboxGamePassCompletedMax_V2: string
    hvaLevelUpActivityXboxGamePassProgress_V2: boolean
    hvaLevelUpActivityXboxGamePassDisplay_V2: boolean
    programRestructureWave2HvaFlight: string
    programRestructureHvaSevenDayLink: string
}

export type AnyPromotion = BasePromotion

export interface AutoRedeemItem {
    name: null | string
    price: number
    provider: null | string
    disabled: boolean
    category: string
    title: string
    variableGoalSpecificTitle: string
    smallImageUrl: string
    mediumImageUrl: string
    largeImageUrl: string
    largeShowcaseImageUrl: string
    description: Description
    showcase: boolean
    showcaseInAllCategory: boolean
    originalPrice: number
    discountedPrice: number
    couponDiscount: number
    popular: boolean
    isTestOnly: boolean
    groupId: string
    inGroup: boolean
    isDefaultItemInGroup: boolean
    groupTitle: string
    groupImageUrl: string
    groupShowcaseImageUrl: string
    isEligibleForOneClickRedemption: boolean
    instantWinGameId: string
    instantWinPlayAgainSku: string
    isLowInStock: boolean
    isOutOfStock: boolean
    getCodeMessage: string
    disableEmail: boolean
    stockMessage: string
    comingSoonFlag: boolean
    onSaleFlag: boolean
    onSaleText: string
    isGenericDonation: boolean
    shouldDisableButton: boolean
    highValueSweepstakesCatalogItemId: string
    isHighValueSweepstakesRedeemCatalogSKU: boolean
    isVariableRedemptionItem: boolean
    variableRedemptionItemCurrencySymbol: null
    variableRedemptionItemMin: number
    variableRedemptionItemMax: number
    variableItemConfigPointsToCurrencyConversionRatio: number
    isRecommendedAffordableItem: boolean
    recommendedAffordableOrder: number
    isAutoRedeem: boolean
    isAutoDonate: boolean
    isAutoDonateAllPointsItem: boolean
    isOneTimeDonateAllPointsItem: boolean
    isAutoDonateAllGivePointsItem: boolean
    isAutoDonateSetPointsItem: boolean
    products: null
    isDiscontinuedAutoRedeem: boolean
    discontinuedAutoRedeemDate: null
    isSubscriptionToggleDisabled: boolean
}

export interface Description {
    itemGroupText: string
    smallText: string
    largeText: string
    legalText: string
    showcaseTitle: string
    showcaseDescription: string
    pageTitleTag: string
    metaDescription: string
}

export interface BingUfMachineTranslationPromo {}

export interface CoachMarks {
    streaks: WelcomeTour
}

export interface WelcomeTour {
    promotion: DashboardImpression | null
    slides: Slide[]
}

export type DashboardImpression = BasePromotion<{ [key: string]: string } | null> & {
    benefits?: Benefit[]
    levelRequirements?: null
    supportedLevelKeys?: string[]
    supportedLevelTitles?: string[]
    supportedLevelTitlesMobile?: string[]
    activeLevel?: string
    showShopAndEarnBenefits?: boolean
    showXboxBenefits?: boolean
    isLevelRedesignEnabled?: boolean
    hvaDailySetDays?: string
    hvaDseDays?: string
    hvaGamepassCompleted?: string
    hvaPuzzlePiecesCompletedAmount?: string
}

export interface Slide {
    slideType: null
    slideShowTourId: string
    id: number
    title: string
    subtitle: null
    subtitle1: null
    description: string
    description1: null
    imageTitle: null
    image2Title: null
    image3Title: null
    image4Title: null
    imageDescription: null
    image2Description: null
    image3Description: null
    image4Description: null
    imageUrl: null
    darkImageUrl: null
    image2Url: null
    image3Url: null
    image4Url: null
    layout: null
    actionButtonText: null
    actionButtonUrl: null
    foregroundImageUrl: null
    backLink: null
    nextLink: CloseLink
    closeLink: CloseLink
    footnote: null
    termsText: null
    termsUrl: null
    privacyText: null
    privacyUrl: null
    taggedItem: string
    slideVisited: boolean
    aboutPageLinkText: null
    aboutPageLink: null
    redeemLink: null
    rewardsLink: null
    labelText: null
}

export interface ComponentImpressionPromotionAttributes {
    red_dot_form_code?: string
    hidden: GiveEligible
    type: string
    offerid: string
    give_eligible: GiveEligible
    destination: string
    progress?: string
    max?: string
    complete?: GiveEligible
    activity_progress?: string
}

export type ComponentImpressionPromotion = BasePromotion<ComponentImpressionPromotionAttributes>

export interface DailySetPromotionAttributes {
    animated_icon?: string
    bg_image: string
    complete: GiveEligible
    daily_set_date?: string
    description: string
    destination: string
    icon: string
    image: string
    link_text: string
    max: string
    modern_image?: string
    offerid: string
    progress: string
    sc_bg_image: string
    sc_bg_large_image: string
    small_image: string
    state: State
    title: string
    type: Type
    give_eligible: GiveEligible
    ariaLabel?: string
    promotional?: GiveEligible
    parentPunchcards?: string
    is_unlocked?: GiveEligible
    translation_prompt?: string
}

// Daily set "tile" promotion
export type PromotionalItem = BasePromotion<
    DailySetPromotionAttributes,
    string,
    string,
    string,
    ExclusiveLockedFeature,
    Type
>

export interface DashboardFlights {
    dashboardbannernav: string
    togglegiveuser: string
    spotifyRedirect: string
    give_eligible: GiveEligible
    destination: string
}

export interface FindClippyPromotionAttributes {
    enabled: GiveEligible
    points: string
    activity_type: string
    hidden: GiveEligible
    give_eligible: GiveEligible
    progress: string
    max: string
    complete: GiveEligible
    offerid: string
    destination: string
}

export type FindClippyPromotion = BasePromotion<FindClippyPromotionAttributes>

export type HighValueSweepstakesPromotion = BasePromotion<{ [key: string]: string }>

export interface MorePromotionAttributes {
    animated_icon: string
    bg_image: string
    complete: GiveEligible
    description: string
    description_style?: Style
    destination: string
    icon: string
    image: string
    link_text: string
    max: string
    offerid: string
    progress: string
    promotional?: GiveEligible
    sc_bg_image: string
    sc_bg_large_image: string
    small_image: string
    state: State
    title: string
    title_style?: Style
    type?: Type
    give_eligible: GiveEligible
    cardHeader?: string
    enable_hva_card?: string
    hvA_BG_static?: string
    hvA_BG_type?: string
    hvA_primary_asset?: string
    hvA_text_color?: string
    isHvaV2Compatible?: GiveEligible
    link_text_style?: Style
    isExploreOnBingTask?: GiveEligible
    isInProgress?: GiveEligible
    modern_image?: string
    is_unlocked?: GiveEligible
    locked_category_criteria?: string
    translationprompt?: string
    legal_link_text?: LegalLinkText
    legal_text?: string
    description_comment?: string
    query_comment?: string
    title_comment?: string
    layout?: string
    sc_description?: string
    sc_title?: Title
    schemaName?: string
    daily_set_date?: string
}

export type MorePromotion = BasePromotion<MorePromotionAttributes, Style, Style, LegalLinkText, string, Type>

export interface PurpleAttributes {
    animated_icon: string
    ariaLabel?: string
    bg_image: string
    complete: GiveEligible
    description: string
    destination: string
    icon: string
    image: string
    link_text: string
    max: string
    offerid: string
    progress: string
    promotional: GiveEligible
    sc_bg_image: string
    sc_bg_large_image: string
    small_image: string
    state: State
    title: string
    type: Type
    give_eligible: GiveEligible
    description_style?: Style
    title_style?: Style
    cardHeader?: string
    enable_hva_card?: string
    hvA_BG_static?: string
    hvA_BG_type?: string
    hvA_primary_asset?: string
    hvA_text_color?: string
    isHvaV2Compatible?: GiveEligible
    link_text_style?: Style
}

export type PurplePromotionalItem = BasePromotion<PurpleAttributes, Style, Style, string, ExclusiveLockedFeature, Type>

export interface ParentPromotionAttributes {
    bg_image: string
    'classification.DescriptionText': string
    'classification.PunchcardChildrenCount': string
    'classification.PunchcardEndDate': Date
    'classification.Template': string
    'classification.TitleText': string
    complete: GiveEligible
    description: string
    destination: string
    icon: string
    image: string
    legal_text?: string
    link_text: string
    max: string
    offerid: string
    progress: string
    sc_bg_image: string
    sc_bg_large_image: string
    small_image: string
    state: State
    title: string
    type: string
    give_eligible: GiveEligible
    modern_image?: string
    translation_prompt?: string
}

export type ParentPromotion = BasePromotion<ParentPromotionAttributes>

export interface PunchCard {
    name: string
    parentPromotion: ParentPromotion
    childPromotions: PromotionalItem[]
}

export interface ReferAndEarnPromotionAttributes {
    bannerImpressionOffer: string
    claimedPointsFrom1stLayer: string
    claimedPointsFrom2ndLayer: string
    dailyDirectDepositPoints: string
    eduBannerEnabled: GiveEligible
    eventEndDate: Date
    eventStartDate: Date
    firstLayerDailySearchCount: string
    firstLayerDailySearchUser: string
    firstLayerRefereeCount: string
    hidden: GiveEligible
    isBigBlueBtn: GiveEligible
    isNewString: GiveEligible
    isOneLayer: GiveEligible
    isRafStatusBanner: GiveEligible
    isTwoLayer: GiveEligible
    offerid: string
    pendingPointsFrom1stLayer: string
    pendingPointsFrom2ndLayer: string
    rafBannerTreatment: string
    secondLayerDailySearchCount: string
    secondLayerDailySearchUser: string
    secondLayerRefereeCount: string
    showRedDot: GiveEligible
    showTopBanner: GiveEligible
    showUnusualActivityBanner: GiveEligible
    totalClaimedPoints: string
    totalDeclinedPoints: string
    totalPendingPoints: string
    type: string
    give_eligible: GiveEligible
    destination: string
}

export type ReferAndEarnPromotion = BasePromotion<ReferAndEarnPromotionAttributes>

export interface StreakBonusPromotionAttributes {
    activity_max: string
    activity_progress: string
    animated_icon: string
    bonus_earned?: string
    break_description?: string
    description: string
    description_localizedkey: string
    hidden: GiveEligible
    image: string
    title: string
    type: string
    give_eligible: GiveEligible
    destination: string
}

export type StreakBonusPromotion = BasePromotion<StreakBonusPromotionAttributes>

export interface StreakPromotionAttributes {
    hidden: GiveEligible
    type: string
    title: string
    image: string
    activity_progress: string
    last_updated: Date
    break_image: string
    lifetime_max: string
    bonus_points: string
    give_eligible: GiveEligible
    destination: string
}

export type StreakPromotion = BasePromotion<StreakPromotionAttributes> & {
    lastUpdatedDate: Date
    breakImageUrl: string
    lifetimeMaxValue: number
    bonusPointsEarned: number
}

export interface StreakProtectionPromo {
    type: string
    offerid: string
    isStreakProtectionOnEligible: GiveEligible
    streakProtectionStatus: GiveEligible
    remainingDays: string
    isFirstTime: GiveEligible
    streakCount: string
    isTodayStreakComplete: GiveEligible
    autoTurnOn: GiveEligible
    give_eligible: GiveEligible
    destination: string
}

export interface UserInterestsAttributes {
    hidden: GiveEligible
    give_eligible: GiveEligible
    destination: string
}

export type UserInterests = BasePromotion<UserInterestsAttributes>

export interface UserProfile {
    ruid: string
    attributes: UserProfileAttributes
}

export interface UserProfileAttributes {
    ismsaautojoined: GiveEligible
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
    iscashbackeligible: GiveEligible
    serpbotscore: string
    serpbotscore_upd: Date
}

export interface UserStatus {
    levelInfo: LevelInfo
    availablePoints: number
    lifetimePoints: number
    lifetimePointsRedeemed: number
    migratedGiveBalance: number
    ePuid: string
    redeemGoal: AutoRedeemItem
    counters: Counters
    lastOrder: LastOrder
    dashboardImpression: DashboardImpression
    highvalueSweepstakesHVAImpression: DashboardImpression
    highvalueSweepstakesWinnerImpression: DashboardImpression
    referrerProgressInfo: ReferrerProgressInfo
    isAutoDonateFlightEnabled: boolean
    isGiveModeOn: boolean
    giveBalance: number
    firstTimeGiveModeOptIn: null
    giveOrganizationName: null
    lifetimeGivingPoints: number
    isRewardsUser: boolean
    isMuidTrialUser: boolean
    isUserEligibleForOneClickRedemption: boolean
    primaryEarningCountryName: null
}

export interface Counters {
    pcSearch: DashboardImpression[]
    mobileSearch: DashboardImpression[]
    activityAndQuiz: ActivityAndQuiz[]
    dailyPoint: DashboardImpression[]
}

export interface ActivityAndQuizAttributes {
    type: string
    title: string
    link_text: string
    description: string
    foreground_color: string
    image: string
    recurring: string
    destination: string
    'classification.ShowProgress': GiveEligible
    hidden: GiveEligible
    give_eligible: GiveEligible
}

export type ActivityAndQuiz = BasePromotion<ActivityAndQuizAttributes>

export interface LastOrder {
    id: null
    price: number
    status: null
    sku: null
    timestamp: Date
    catalogItem: null
}

export interface LevelInfo {
    isNewLevelsFeatureAvailable: boolean
    lastMonthLevel: string
    activeLevel: string
    activeLevelName: string
    progress: number
    progressMax: number
    levels: Level[]
    benefitsPromotion: DashboardImpression
    levelUpActivitiesProgress: number
    levelUpActivitiesMax: number
    levelUpActivityDefaultSearchEngineDays: number
    levelUpActivityDefaultSearchEngineCompletedAmount: number
    levelUpActivityDailySetStreakDays: number
    levelUpActivityDailySetCompletedAmount: number
    levelUpActivityDailyStreaksCompletedAmount: number
    levelUpActivityXboxGamePassCompleted: boolean
    bingStarMonthlyBonusProgress: number
    bingStarMonthlyBonusMaximum: number
    bingStarBonusWeeklyProgress: number
    bingStarBonusWeeklyState: string
    defaultSearchEngineMonthlyBonusProgress: number
    defaultSearchEngineMonthlyBonusMaximum: number
    defaultSearchEngineMonthlyBonusState: string
    monthlyLevelBonusProgress: number
    monthlyLevelBonusMaximum: number
    monthlyLevelBonusState: string
    monthlyDistributionChartSrc: string
    bingSearchDailyPoints: number
    pointsPerSearch: number
    hvaLevelUpActivityDailySetCompletedAmount_V2: string
    hvaLevelUpActivityDailySetCompletedMax_V2: string
    hvaLevelUpActivityDailySetDays_V2: string
    hvaLevelUpActivityDailySetDaysMax_V2: string
    hvaLevelUpActivityDailySetProgress_V2: boolean
    hvaLevelUpActivityDailySetDisplay_V2: boolean
    hvaLevelUpActivityDailyStreaksBingCompletedAmount_V2: string
    hvaLevelUpActivityDailyStreaksBingCompletedMax_V2: string
    hvaLevelUpActivityDailyStreaksBingProgress_V2: boolean
    hvaLevelUpActivityDailyStreaksBingDisplay_V2: boolean
    hvaLevelUpActivityDailyStreaksMobileCompletedAmount_V2: string
    hvaLevelUpActivityDailyStreaksMobileCompletedMax_V2: string
    hvaLevelUpActivityDailyStreaksMobileProgress_V2: boolean
    hvaLevelUpActivityDailyStreaksMobileDisplay_V2: boolean
    hvaLevelUpDefaultSearchEngineCompletedAmount_V2: string
    hvaLevelUpActivityDefaultSearchEngineCompletedMax_V2: string
    hvaLevelUpActivityDefaultSearchEngineDays_V2: string
    hvaLevelUpActivityDefaultSearchEngineDaysMax_V2: string
    hvaLevelUpActivityDefaultSearchEngineProgress_V2: boolean
    hvaLevelUpActivityDefaultSearchEngineDisplay_V2: boolean
    hvaLevelUpActivityXboxGamePassCompletedAmount_V2: string
    hvaLevelUpActivityXboxGamePassCompletedMax_V2: string
    hvaLevelUpActivityXboxGamePassProgress_V2: boolean
    hvaLevelUpActivityXboxGamePassDisplay_V2: boolean
    programRestructureWave2HvaFlight: string
    programRestructureHvaSevenDayLink: string
}

export interface Level {
    key: string
    active: boolean
    name: string
    tasks: CloseLink[]
    privileges: CloseLink[]
}

export interface ReferrerProgressInfo {
    pointsEarned: number
    pointsMax: number
    isComplete: boolean
    promotions: unknown[]
}
