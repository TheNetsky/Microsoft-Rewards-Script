export interface DashboardData {
    dashboard: Dashboard
    status: Status
    catalog: Catalog
    badges: Badges
    genericDonationCatalog: Catalog
    profile: Profile
}

export interface Badges {
    badges: RedeemInfoPromotion[]
    badgesImpression: Ion
}

export type RedeemInfoPromotion = BasePromotion<
    { [key: string]: string } | null,
    string,
    string,
    string,
    ExclusiveLockedFeature,
    RedeemInfoPromotionPromotionType
> & {
    subtitle?: string
    isNew?: boolean
    completionDate?: Date
    progressTextFormat?: ProgressTextFormat
    benefits?: Benefit[]
    levelRequirements?: LevelRequirement[]
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
    isCodexAutoJoinUser?: boolean
    lifetimeDonatePoints?: number
    lifetimeDonateValue?: unknown[]
    lifetimeDonateCount?: number
    lifetimeShopPoints?: number
    lifetimeShopValue?: unknown[]
    lifetimeShopCount?: number
    lifetimeSweepstakePoints?: number
    lifetimeSweepstakeCount?: number
    lifetimeInstantWinPoints?: number
    lifetimeInstantWinCount?: number
}

export interface Benefit {
    key: string
    text: string
    url: null | string
    helpText: null | string
    supportedLevels: BenefitSupportedLevels
}

export interface BenefitSupportedLevels {
    newLevel1?: string
    newLevel2: string
    newLevel3: string
}

export enum DeviceType {
    Empty = '',
    Mobile = 'mobile'
}

export enum ExclusiveLockedFeature {
    NewLevel2 = 'newLevel2',
    Notsupported = 'notsupported'
}

export interface LevelRequirement {
    key: string
    text: string
    url: null | string
    supportedLevels: LevelRequirementSupportedLevels
}

export interface LevelRequirementSupportedLevels {
    newLevel2?: string
    newLevel3: string
}

export enum ShowcaseTitle {
    Empty = '',
    GoToDashboard = 'Go to dashboard',
    SearchAndEarn = 'Search and earn',
    StartEarningPoints = 'Start Earning Points'
}

export enum ProgressTextFormat {
    B0B1Days = '<b>{0}</b>/{1} days',
    B0B1Points = '<b>{0}</b>/{1} points'
}

export enum RedeemInfoPromotionPromotionSubtype {
    Dailyoffer = 'dailyoffer',
    Donate = 'donate',
    Earn = 'earn',
    Empty = ''
}

export enum RedeemInfoPromotionPromotionType {
    Badge = 'badge',
    Empty = '',
    Search = 'search',
    Tip = 'tip',
    Welcometour = 'welcometour'
}

export enum ShowcaseDescription {
    EarnPointsWhileLearningAboutHowToEarnPointsWinWin = 'Earn points while learning about how to earn points. Win-win!',
    Empty = ''
}

export enum MorePromotionShowcaseTitle {
    Empty = '',
    SearchAndEarn = 'Search and earn',
    The50Points = '50 points'
}

export type PromotionText = string | null

export interface BasePromotion<
    TAttributes = unknown,
    TTitleStyle = string,
    TDescriptionStyle = string,
    TLegalLinkText = string,
    TExclusiveLockedFeatureCategory = ExclusiveLockedFeature,
    TPromotionType = string
> {
    name: string | null
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
    deviceType: string | DeviceType
    exclusiveLockedFeatureCategory: TExclusiveLockedFeatureCategory
    exclusiveLockedFeatureStatus: ExclusiveLockedFeature | ExclusiveLockedFeatureStatus
    exclusiveLockedFeatureDestinationUrl: string
    lockedImage: string
    pointsPerSearch: number
    pointsPerSearchNewLevels: number
    lastMonthLevel: string
    sectionalOrdering: number
    isAnimatedRewardEnabled: boolean
    hvaLevelUpActivityDailySetCompletedAmount_V2: PromotionText
    hvaLevelUpActivityDailySetCompletedMax_V2: PromotionText
    hvaLevelUpActivityDailySetDays_V2: PromotionText
    hvaLevelUpActivityDailySetDaysMax_V2: PromotionText
    hvaLevelUpActivityDailySetProgress_V2: boolean
    hvaLevelUpActivityDailySetDisplay_V2: boolean
    hvaLevelUpActivityDailyStreaksBingCompletedAmount_V2: PromotionText
    hvaLevelUpActivityDailyStreaksBingCompletedMax_V2: PromotionText
    hvaLevelUpActivityDailyStreaksBingProgress_V2: boolean
    hvaLevelUpActivityDailyStreaksBingDisplay_V2: boolean
    hvaLevelUpActivityDailyStreaksMobileCompletedAmount_V2: PromotionText
    hvaLevelUpActivityDailyStreaksMobileCompletedMax_V2: PromotionText
    hvaLevelUpActivityDailyStreaksMobileProgress_V2: boolean
    hvaLevelUpActivityDailyStreaksMobileDisplay_V2: boolean
    hvaLevelUpDefaultSearchEngineCompletedAmount_V2: PromotionText
    hvaLevelUpActivityDefaultSearchEngineCompletedMax_V2: PromotionText
    hvaLevelUpActivityDefaultSearchEngineDays_V2: PromotionText
    hvaLevelUpActivityDefaultSearchEngineDaysMax_V2: PromotionText
    hvaLevelUpActivityDefaultSearchEngineProgress_V2: boolean
    hvaLevelUpActivityDefaultSearchEngineDisplay_V2: boolean
    hvaLevelUpActivityXboxGamePassCompletedAmount_V2: PromotionText
    hvaLevelUpActivityXboxGamePassCompletedMax_V2: PromotionText
    hvaLevelUpActivityXboxGamePassProgress_V2: boolean
    hvaLevelUpActivityXboxGamePassDisplay_V2: boolean
    programRestructureWave2HvaFlight: PromotionText
    programRestructureHvaSevenDayLink: PromotionText
}

export type AnyPromotion = BasePromotion

export type Ion = BasePromotion<BadgesImpressionAttributes>

export interface BadgesImpressionAttributes {
    hidden: GiveEligible
    progress?: string
    max?: string
    complete?: GiveEligible
    offerid: string
    give_eligible: GiveEligible
    destination: string
    type?: string
    activity_progress?: string
}

export enum GiveEligible {
    False = 'False',
    True = 'True'
}

export interface Catalog {
    catalogItems: AutoRedeemItem[]
    selectedProductCategory: string
    showcaseItems: unknown[] | null
    redeemPageFlights: RedeemPageFlights | null
    showRecommendedAffordableModule: boolean
    userLevel: string
    isUserEligibleForDiscounts: boolean
    availablePoints: number
}

export interface AutoRedeemItem {
    name: null | string
    price: number
    provider: Provider | null
    disabled: boolean
    category: Category
    title: string
    variableGoalSpecificTitle: VariableGoalSpecificTitle
    smallImageUrl: string
    mediumImageUrl: string
    largeImageUrl: string
    largeShowcaseImageUrl: string
    description: DescriptionClass
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
    instantWinGameId: InstantWinGameID
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
    variableRedemptionItemCurrencySymbol: null | string
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
    products: Product[] | null
    isDiscontinuedAutoRedeem: boolean
    discontinuedAutoRedeemDate: null
    isSubscriptionToggleDisabled: boolean
}

export enum Category {
    Donate = 'Donate',
    Empty = '',
    Shop = 'Shop',
    Win = 'Win'
}

export interface DescriptionClass {
    itemGroupText: string
    smallText: string
    largeText: string
    legalText: string
    showcaseTitle: string
    showcaseDescription: string
    pageTitleTag: PageTitleTag
    metaDescription: string
}

export enum PageTitleTag {
    EarnAFreeRobloxDigitalCard800Robux = 'Earn a Free Roblox Digital Card- 800 Robux',
    Empty = ''
}

export enum InstantWinGameID {
    Empty = '',
    MSGosOctCA25 = 'MS_GOS_OCT_CA_25'
}

export interface Product {
    name: string
    confirmationTitle: null
    credits: number
    actualCredits: number
    discountedCredits: number
    couponDiscount: number
    productId: string
    smallImageUrl: string
    mediumImageUrl: string
    largeImageUrl: string
    extraLargeImageUrl: null
    showcaseImageUrl: null
    largeShowcaseImageUrl: string
    itemDescription: DescriptionClass
    disableEmail: boolean
    getCodeMessage: string
    checkoutDescription: null
    sku: string
    supplier: Provider
    category: Category
    rewardStartDate: null
    rewardEndDate: null
    facebookSharingTitle: null
    facebookSharingMessage: null
    twitterSharingMessage: null
    facebookLikeBoxPageUrl: null
    redemptionOffer: RedemptionOffer
    isShowcase: boolean
    isLowInStock: boolean
    isOutOfStock: boolean
    stockMessage: string
    categoryCode: string
    attributes: null
    isVariableRedemptionItem: boolean
    disabled: boolean
    variableRedemptionItemDetails: VariableRedemptionItemDetails | null
    shouldDisableButton: boolean
}

export interface RedemptionOffer {
    progressTextForDashboard: null
    id: null
    title: null
    description: null
    showcaseTitle: null
    showcaseDescription: null
    legalHeader: null
    legalText: null
    backgroundImageUrl: null
    showcaseBackgroundImageUrl: null
    showcaseBackgroundLargeImageUrl: null
    iconUrl: null
    linkUrl: null
    linkText: null
    imageUrl: null
    smallImageUrl: null
    isCompleted: boolean
    creditProgress: null
    creditMax: null
    activityType: null
    priority: number
    attributes: null
}

export enum Provider {
    Benevity = 'benevity',
    CSV = 'csv',
    Eprize = 'eprize',
    ICGInstantWin = 'ICG_InstantWin',
    ProviderTango = 'Tango',
    Tango = 'tango'
}

export interface VariableRedemptionItemDetails {
    variableRedemptionMin: number
    variableRedemptionMax: number
    variableRedemptionPointsToCurrencyConversionRatio: number
    variableRedemptionAmount: number
    variableRedemptionPointsCharged: number
    variableRedemptionCurrencySymbol: null
}

export enum VariableGoalSpecificTitle {
    Empty = '',
    The0CineplexOdeonCanadaEGiftCard = '${0} Cineplex Odeon (Canada) e-Gift Card',
    The0UltimateDiningCard = '${0} Ultimate Dining Card'
}

export interface RedeemPageFlights {
    showRedeemBenevityOrganizations: string
    give_eligible: GiveEligible
    destination: string
}

export interface UserWarning {
    name: string
}

export interface Dashboard {
    userStatus: UserStatus
    userWarnings: UserWarning[]
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
    mbingFlight: MbingFlight
    componentImpressionPromotions: Ion[]
    machineTranslationPromo: undefined
    bingUfMachineTranslationPromo: undefined
    streakProtectionPromo: StreakProtectionPromo
    autoRedeemItem: AutoRedeemItem
    isAutoRedeemEligible: boolean
    autoRedeemSubscriptions: unknown[]
    userProfile: Profile
    coupons: unknown[]
    couponBannerPromotion: null
    popUpPromotions: undefined
    pointClaimBannerPromotion: PointClaimBannerPromotion
    highValueSweepstakesPromotions: HighValueSweepstakesPromotion[]
    megaIntroOfferPromotions: unknown[]
    revIpCountryName: null
    shareAndWinPromotion: null
    referAndEarnPromotion: ReferAndEarnPromotion
    giveWithBingNoticePromotion: null
    levelUpHeroBannerPromotion: LevelUpHeroBannerPromotion
    monthlyBonusHeroBannerPromotion: null
    starBonusWeeklyBannerPromotion: null
    ugcPromotion: null
    created: Date
    findClippyPromotion: FindClippyPromotion
}

export interface PointClaimBannerPromotion {
    name: string
    priority: number
    attributes: Attributes
    offerId: string
    complete: boolean
    counter: number
    activityProgress: number
    activityProgressMax: number
    pointProgressMax: number
    pointProgress: number
    promotionType: string
    promotionSubtype: string
    title: string
    extBannerTitle: string
    titleStyle: string
    theme: string
    description: string
    extBannerDescription: string
    descriptionStyle: string
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
    legalLinkText: string
    deviceType: string
    exclusiveLockedFeatureCategory: string
    exclusiveLockedFeatureStatus: string
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

export interface Attributes {
    claimable_points: string
    claimable_points_breakdown: string
    complete: string
    expiry_date_start: Date
    hidden: string
    max: string
    offerid: string
    progress: string
    rewardable: string
    type: string
    give_eligible: string
    destination: string
}

export interface CoachMarks {
    streaks: Streaks
}

export interface Streaks {
    promotion: DashboardImpression
    slides: Slide[]
}

export type DashboardImpression = BasePromotion<
    { [key: string]: string } | null,
    string,
    string,
    string,
    ExclusiveLockedFeature,
    DashboardImpressionPromotionType
>

export enum DescriptionEnum {
    EarnUpTo15PointsPerDay3PointsPerSearch = 'Earn up to 15 points per day, 3 points per search',
    Empty = ''
}

export enum DashboardImpressionPromotionSubtype {
    Empty = '',
    Streaks = 'streaks'
}

export enum DashboardImpressionPromotionType {
    Coachmarks = 'coachmarks',
    Empty = '',
    Search = 'search'
}

export enum Title {
    Empty = '',
    Search = 'Search'
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
    image2Title: null | string
    image3Title: null | string
    image4Title: null | string
    imageDescription: null
    image2Description: null | string
    image3Description: null | string
    image4Description: null | string
    imageUrl: null | string
    darkImageUrl: null
    image2Url: null | string
    image3Url: null | string
    image4Url: null | string
    layout: null | string
    actionButtonText: null | string
    actionButtonUrl: null | string
    foregroundImageUrl: null
    backLink: null
    nextLink: CloseLink
    closeLink: CloseLink
    footnote: null | string
    termsText: null
    termsUrl: null
    privacyText: null
    privacyUrl: null
    taggedItem: null | string
    slideVisited: boolean
    aboutPageLinkText: null
    aboutPageLink: null
    redeemLink: null
    rewardsLink: null
    labelText: null
    quizLinks?: unknown[]
    quizCorrectAnswerTitle?: string
    quizWrongAnswerTitle?: string
    quizAnswerDescription?: string
}

export interface CloseLink {
    text: null | string
    url: URL | null
}

export enum URL {
    JavascriptVoid0 = 'javascript:void(0);',
    RewardsDashboard = '/rewards/dashboard',
    RewardsRedeem = '/rewards/redeem',
    WWWBingCOMFORMMA1368 = '//www.bing.com/?FORM=MA1368',
    WWWMicrosoftstoreCOM = '//www.microsoftstore.com'
}

export type PromotionalItem = BasePromotion<
    PromotionalItemAttributes,
    Style,
    Style,
    string,
    ExclusiveLockedFeature,
    Type
>

export interface PromotionalItemAttributes {
    animated_icon?: string
    bg_image?: string
    complete: GiveEligible
    daily_set_date?: string
    description: string
    description_comment?: string
    destination: string
    icon?: string
    image: string
    link_text: string
    max: string
    modern_image?: string
    offerid: string
    progress: string
    query_comment?: string
    sc_bg_image?: string
    sc_bg_large_image?: string
    small_image: string
    state: State
    title: string
    title_comment?: string
    translation_prompt?: string
    type?: Type
    give_eligible: GiveEligible
    promotional?: GiveEligible
    translationprompt?: string
    description_style?: Style
    link_text_style?: Style
    title_style?: Style
    sc_description?: string
    sc_title?: ShowcaseTitle
    parentPunchcards?: ParentPunchcards
    is_unlocked?: GiveEligible
    'classification.DescriptionText'?: string
    'classification.PunchcardChildrenCount'?: string
    'classification.PunchcardEndDate'?: Date
    'classification.Template'?: string
    'classification.TitleText'?: string
    legal_text?: string
    'answerScenario.Tag'?: string
    'classification.Tag'?: string
    recurring?: string
    searchMultiplier?: string
}
export type PurplePromotionalItem = BasePromotion<
    PurplePromotionalItemAttributes,
    Style,
    Style,
    string,
    ExclusiveLockedFeature,
    Type
>

export interface PurplePromotionalItemAttributes extends PromotionalItemAttributes {
    animated_icon: string
    bg_image: string
    icon: string
    promotional: GiveEligible
    sc_bg_image: string
    sc_bg_large_image: string
    type: Type
}

export enum Style {
    ColorBlack = 'color:black',
    Empty = ''
}

export enum ParentPunchcards {
    ENWWPcparentFY26BingMonthlyPCMayPunchcard = 'ENWW_pcparent_FY26_BingMonthlyPC_May_punchcard',
    WWEvergreenPcparentSeaofThievesRubyPunchcard = 'WW_evergreen_pcparent_SeaofThieves_Ruby_punchcard',
    WWEvergreenPcparentSpotifyPunchcard = 'WW_evergreen_pcparent_Spotify_punchcard'
}

export enum State {
    Default = 'Default'
}

export enum Type {
    Empty = '',
    Search = 'search',
    Urlreward = 'urlreward',
    UrlrewardUrlrewardUrlrewardUrlreward = 'urlreward,urlreward,urlreward,urlreward',
    UrlrewardUrlrewardUrlrewardUrlrewardUrlreward = 'urlreward,urlreward,urlreward,urlreward,urlreward'
}

export interface DashboardFlights {
    dashboardbannernav: string
    togglegiveuser: string
    spotifyRedirect: string
    give_eligible: GiveEligible
    destination: string
}

export type FindClippyPromotion = BasePromotion<FindClippyPromotionAttributes>

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

export type HighValueSweepstakesPromotion = BasePromotion<{ [key: string]: string }>

export type LevelUpHeroBannerPromotion = BasePromotion<LevelUpHeroBannerPromotionAttributes>

export interface LevelUpHeroBannerPromotionAttributes {
    ariaLabel: string
    bg_image: string
    complete: GiveEligible
    description: string
    destination: string
    hidden: GiveEligible
    icon: string
    image: string
    is_new_levels_feature_available: GiveEligible
    level_up_actions_progress: string
    level_up_card_image: string
    level_up_card_incomplete_image: string
    link_text: string
    max: string
    offerid: string
    progress: string
    promotional: GiveEligible
    sc_bg_image: string
    sc_bg_large_image: string
    search_points_card_image: string
    search_points_card_incomplete_image: string
    small_image: string
    state: State
    title: string
    translationprompt: string
    type: string
    give_eligible: GiveEligible
}

export type MbingFlight = BasePromotion<MbingFlightAttributes>

export interface MbingFlightAttributes {
    button_type: string
    cancel_offer_id: string
    cancel_text: string
    confirm_link: string
    confirm_offer_id: string
    confirm_text: string
    hidden: GiveEligible
    image_dismiss_url: string
    image_url: string
    position_type: string
    title: string
    give_eligible: GiveEligible
    progress: string
    max: string
    complete: GiveEligible
    offerid: string
    destination: string
}

export type MorePromotion = BasePromotion<
    { [key: string]: string },
    Style,
    Style,
    string,
    ExclusiveLockedFeature,
    MorePromotionPromotionType
>

export enum ExclusiveLockedFeatureStatus {
    Locked = 'locked',
    Unlocked = 'unlocked',
    Notsupported = 'notsupported'
}

export enum MorePromotionPromotionType {
    Empty = '',
    Urlreward = 'urlreward',
    Welcometour = 'welcometour'
}

export interface PunchCard {
    name: ParentPunchcards
    parentPromotion: PromotionalItem
    childPromotions: PromotionalItem[]
}

export type ReferAndEarnPromotion = BasePromotion<ReferAndEarnPromotionAttributes>

export interface ReferAndEarnPromotionAttributes {
    bannerImpressionOffer: string
    bonusTopBanner: GiveEligible
    claimedPointReachedCap: GiveEligible
    claimedPointsFrom1stLayer: string
    claimedPointsFrom2ndLayer: string
    dailyDirectDepositPoints: string
    dailyEarningPointsCap: string
    edgeMobileRefereeCount: string
    eduBannerEnabled: GiveEligible
    eventEndDate: string
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
    limitedTimeOffer: string
    limitedTimeOfferBanner: string
    limitedTimeOfferBonus: string
    limitedTimeOfferBonusUnits: string
    maxSearchPoints: string
    nudgingTopBanner: GiveEligible
    nudgingTopBannerImpressionPromotion: string
    offerid: string
    pendingPointsFrom1stLayer: string
    pendingPointsFrom2ndLayer: string
    rafBannerTreatment: string
    refereeCouponFlight: string
    sapphireRefereeCount: string
    searchAwardCount: string
    secondLayerDailySearchCount: string
    secondLayerDailySearchUser: string
    secondLayerRefereeCount: string
    showCompletionNotification: GiveEligible
    showRedDot: GiveEligible
    showTopBanner: GiveEligible
    showUnusualActivityBanner: GiveEligible
    totalClaimedPoints: string
    totalClaimedPointsFromEdgeMobile: string
    totalClaimedPointsFromSapphire: string
    totalDeclinedPoints: string
    totalPendingPoints: string
    type: string
    give_eligible: GiveEligible
    destination: string
}

export type StreakBonusPromotion = BasePromotion<StreakBonusPromotionAttributes>

export interface StreakBonusPromotionAttributes {
    activity_max: string
    activity_progress: string
    animated_icon: string
    bonus_earned: string
    break_description: string
    description: string
    description_localizedkey: string
    hidden: GiveEligible
    image: string
    title: string
    type: string
    give_eligible: GiveEligible
    destination: string
}

export type StreakPromotion = BasePromotion<StreakPromotionAttributes> & {
    lastUpdatedDate: Date
    breakImageUrl: string
    lifetimeMaxValue: number
    bonusPointsEarned: number
}

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

export type UserInterests = BasePromotion<UserInterestsAttributes>

export interface UserInterestsAttributes {
    hidden: GiveEligible
    give_eligible: GiveEligible
    destination: string
}

export interface Profile {
    ruid: string
    attributes: ProfileAttributes
}

export interface ProfileAttributes {
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
    creative_upd: Date
    publisher_upd: Date
    program_upd: Date
    previous_creative: string
    previous_creative_upd: Date
    previous_publisher: string
    previous_publisher_upd: Date
    previous_program: string
    previous_program_upd: Date
    cashbackuserexperiences: string
    cashbackuserexperiences_upd: Date
    waitlistattributes: string
    waitlistattributes_upd: Date
    iscashbackeligible: GiveEligible
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

export type ActivityAndQuiz = BasePromotion<ActivityAndQuizAttributes | null> & {
    benefits?: Benefit[]
    levelRequirements?: LevelRequirement[]
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

export interface ActivityAndQuizAttributes {
    type?: string
    title?: string
    link_text?: string
    description?: string
    foreground_color?: string
    image?: string
    recurring?: string
    destination: string
    'classification.ShowProgress'?: GiveEligible
    hidden?: GiveEligible
    give_eligible: GiveEligible
    animated_icon?: string
    'answerScenario.Tag'?: string
    'classification.Tag'?: string
    complete?: GiveEligible
    max?: string
    modern_image?: string
    progress?: string
    searchMultiplier?: string
    small_image?: string
    state?: State
    translation_prompt?: string
    offerid?: string
    activity_progress?: string
    activity_type?: string
    activeLevel?: string
    benefits?: string
    hva_dailyset_completed_amount?: string
    hva_dailyset_days?: string
    hva_dailystreaks_bing_completed_amount?: string
    hva_dailystreaks_mobile_completed_amount?: string
    hva_dse_completed_amount?: string
    hva_dse_days?: string
    hva_gamepass_completed?: string
    hva_puzzle_pieces_completed_amount?: string
    is_new_levels_feature_available?: GiveEligible
    level_up_actions_progress?: string
    levelMedallion?: string
    levelRequirements?: string
    levelTitleMobile?: string
    supportedLevelKeys?: string
    supportedLevelTitle?: string
}

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
    benefitsPromotion: BenefitsPromotion
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

export type BenefitsPromotion = BasePromotion<BenefitsPromotionAttributes> & {
    benefits: Benefit[]
    levelRequirements: LevelRequirement[]
    supportedLevelKeys: string[]
    supportedLevelTitles: string[]
    supportedLevelTitlesMobile: string[]
    activeLevel: string
    showShopAndEarnBenefits: boolean
    showXboxBenefits: boolean
    isLevelRedesignEnabled: boolean
    hvaDailySetDays: string
    hvaDseDays: string
    hvaGamepassCompleted: string
    hvaPuzzlePiecesCompletedAmount: string
}

export interface BenefitsPromotionAttributes {
    activeLevel: string
    benefits: string
    hidden: GiveEligible
    hva_dailyset_completed_amount: string
    hva_dailyset_days: string
    hva_dailystreaks_bing_completed_amount: string
    hva_dailystreaks_mobile_completed_amount: string
    hva_dse_completed_amount: string
    hva_dse_days: string
    hva_gamepass_completed: string
    hva_puzzle_pieces_completed_amount: string
    is_new_levels_feature_available: GiveEligible
    level_up_actions_progress: string
    levelMedallion: string
    levelRequirements: string
    levelTitleMobile: string
    supportedLevelKeys: string
    supportedLevelTitle: string
    give_eligible: GiveEligible
    destination: string
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

export interface WelcomeTour {
    promotion: RedeemInfoPromotion
    slides: Slide[]
}

export interface Status {
    userStatus: UserStatus
    badgesResult: Badges
    pointsSummary: PointsSummary[]
    tip: RedeemInfoPromotion
    redeemInfoPromotion: RedeemInfoPromotion
    stories: null
}

export interface PointsSummary {
    dayOfWeek: number
    pointsEarned: number
}
