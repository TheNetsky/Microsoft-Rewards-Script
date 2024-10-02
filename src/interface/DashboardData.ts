export interface DashboardData {
    userStatus: UserStatus;
    promotionalItem: PromotionalItem;
    dailySetPromotions: { [key: string]: PromotionalItem[] };
    streakPromotion: StreakPromotion;
    streakBonusPromotions: StreakBonusPromotion[];
    punchCards: PunchCard[];
    dashboardFlights: DashboardFlights;
    morePromotions: MorePromotion[];
    suggestedRewards: AutoRedeemItem[];
    coachMarks: CoachMarks;
    welcomeTour: WelcomeTour;
    userInterests: UserInterests;
    isVisualParityTest: boolean;
    mbingFlight: null;
    langCountryMismatchPromo: null;
    machineTranslationPromo: MachineTranslationPromo;
    autoRedeemItem: AutoRedeemItem;
    userProfile: UserProfile;
}

export interface AutoRedeemItem {
    name: null | string;
    price: number;
    provider: null | string;
    disabled: boolean;
    category: string;
    title: string;
    variableGoalSpecificTitle: string;
    smallImageUrl: string;
    mediumImageUrl: string;
    largeImageUrl: string;
    largeShowcaseImageUrl: string;
    description: Description;
    showcase: boolean;
    showcaseInAllCategory: boolean;
    originalPrice: number;
    discountedPrice: number;
    popular: boolean;
    isTestOnly: boolean;
    groupId: string;
    inGroup: boolean;
    isDefaultItemInGroup: boolean;
    groupTitle: string;
    groupImageUrl: string;
    groupShowcaseImageUrl: string;
    instantWinGameId: string;
    instantWinPlayAgainSku: string;
    isLowInStock: boolean;
    isOutOfStock: boolean;
    getCodeMessage: string;
    disableEmail: boolean;
    stockMessage: string;
    comingSoonFlag: boolean;
    isGenericDonation: boolean;
    isVariableRedemptionItem: boolean;
    variableRedemptionItemCurrencySymbol: null;
    variableRedemptionItemMin: number;
    variableRedemptionItemMax: number;
    variableItemConfigPointsToCurrencyConversionRatio: number;
    isAutoRedeem: boolean;
}

export interface Description {
    itemGroupText: string;
    smallText: string;
    largeText: string;
    legalText: string;
    showcaseTitle: string;
    showcaseDescription: string;
}

export interface CoachMarks {
    streaks: WelcomeTour;
}

export interface WelcomeTour {
    promotion: DashboardImpression;
    slides: Slide[];
}

export interface DashboardImpression {
    name: null | string;
    priority: number;
    attributes: { [key: string]: string } | null;
    offerId: string;
    complete: boolean;
    counter: number;
    activityProgress: number;
    activityProgressMax: number;
    pointProgressMax: number;
    pointProgress: number;
    promotionType: string;
    promotionSubtype: string;
    title: string;
    extBannerTitle: string;
    titleStyle: string;
    theme: string;
    description: string;
    extBannerDescription: string;
    descriptionStyle: string;
    showcaseTitle: string;
    showcaseDescription: string;
    imageUrl: string;
    dynamicImage: string;
    smallImageUrl: string;
    backgroundImageUrl: string;
    showcaseBackgroundImageUrl: string;
    showcaseBackgroundLargeImageUrl: string;
    promotionBackgroundLeft: string;
    promotionBackgroundRight: string;
    iconUrl: string;
    animatedIconUrl: string;
    animatedLargeBackgroundImageUrl: string;
    destinationUrl: string;
    linkText: string;
    hash: string;
    activityType: string;
    isRecurring: boolean;
    isHidden: boolean;
    isTestOnly: boolean;
    isGiveEligible: boolean;
    level: string;
    slidesCount: number;
    legalText: string;
    legalLinkText: string;
    deviceType: string;
    benefits?: Benefit[];
    supportedLevelKeys?: string[];
    supportedLevelTitles?: string[];
    supportedLevelTitlesMobile?: string[];
    activeLevel?: string;
    isCodexAutoJoinUser?: boolean;
}

export interface Benefit {
    key: string;
    text: string;
    url: null | string;
    helpText: null | string;
    supportedLevels: SupportedLevels;
}

export interface SupportedLevels {
    level1?: string;
    level2: string;
    level2XBoxGold: string;
}

export interface Slide {
    slideType: null;
    slideShowTourId: string;
    id: number;
    title: string;
    subtitle: null;
    subtitle1: null;
    description: string;
    description1: null;
    imageTitle: null;
    image2Title: null | string;
    image3Title: null | string;
    image4Title: null | string;
    imageDescription: null;
    image2Description: null | string;
    image3Description: null | string;
    image4Description: null | string;
    imageUrl: null | string;
    darkImageUrl: null;
    image2Url: null | string;
    image3Url: null | string;
    image4Url: null | string;
    layout: null | string;
    actionButtonText: null | string;
    actionButtonUrl: null | string;
    foregroundImageUrl: null;
    backLink: null;
    nextLink: CloseLink;
    closeLink: CloseLink;
    footnote: null | string;
    termsText: null;
    termsUrl: null;
    privacyText: null;
    privacyUrl: null;
    taggedItem: null | string;
    slideVisited: boolean;
    aboutPageLinkText: null;
    aboutPageLink: null;
    redeemLink: null;
    rewardsLink: null;
    quizLinks?: string[];
    quizCorrectAnswerTitle?: string;
    quizWrongAnswerTitle?: string;
    quizAnswerDescription?: string;
}

export interface CloseLink {
    text: null | string;
    url: null | string;
}

export interface PromotionalItem {
    name: string;
    priority: number;
    attributes: PromotionalItemAttributes;
    offerId: string;
    complete: boolean;
    counter: number;
    activityProgress: number;
    activityProgressMax: number;
    pointProgressMax: number;
    pointProgress: number;
    promotionType: Type;
    promotionSubtype: string;
    title: string;
    extBannerTitle: string;
    titleStyle: string;
    theme: string;
    description: string;
    extBannerDescription: string;
    descriptionStyle: string;
    showcaseTitle: string;
    showcaseDescription: string;
    imageUrl: string;
    dynamicImage: string;
    smallImageUrl: string;
    backgroundImageUrl: string;
    showcaseBackgroundImageUrl: string;
    showcaseBackgroundLargeImageUrl: string;
    promotionBackgroundLeft: string;
    promotionBackgroundRight: string;
    iconUrl: string;
    animatedIconUrl: string;
    animatedLargeBackgroundImageUrl: string;
    destinationUrl: string;
    linkText: string;
    hash: string;
    activityType: string;
    isRecurring: boolean;
    isHidden: boolean;
    isTestOnly: boolean;
    isGiveEligible: boolean;
    level: string;
    slidesCount: number;
    legalText: string;
    legalLinkText: string;
    deviceType: string;
}

export interface PromotionalItemAttributes {
    animated_icon?: string;
    bg_image: string;
    complete: GiveEligible;
    daily_set_date?: string;
    description: string;
    destination: string;
    icon: string;
    image: string;
    link_text: string;
    max: string;
    offerid: string;
    progress: string;
    sc_bg_image: string;
    sc_bg_large_image: string;
    small_image: string;
    state: State;
    title: string;
    type: Type;
    give_eligible: GiveEligible;
    activity_max?: string;
    activity_progress?: string;
    is_wot?: GiveEligible;
    offer_counter?: string;
    promotional?: GiveEligible;
    parentPunchcards?: string;
    'classification.DescriptionText'?: string;
    'classification.PunchcardChildrenCount'?: string;
    'classification.PunchcardEndDate'?: Date;
    'classification.Template'?: string;
    'classification.TitleText'?: string;
}

export enum GiveEligible {
    False = 'False',
    True = 'True'
}

export enum State {
    Default = 'Default'
}

export enum Type {
    Quiz = 'quiz',
    Urlreward = 'urlreward',
    UrlrewardUrlrewardUrlrewardUrlrewardUrlreward = 'urlreward,urlreward,urlreward,urlreward,urlreward'
}

export interface DashboardFlights {
    dashboardbannernav: string;
    togglegiveuser: string;
    spotifyRedirect: string;
    give_eligible: GiveEligible;
    destination: string;
}

export interface MachineTranslationPromo {
}

export interface MorePromotion {
    name: string;
    priority: number;
    attributes: { [key: string]: string };
    offerId: string;
    complete: boolean;
    counter: number;
    activityProgress: number;
    activityProgressMax: number;
    pointProgressMax: number;
    pointProgress: number;
    promotionType: string;
    promotionSubtype: string;
    title: string;
    extBannerTitle: string;
    titleStyle: string;
    theme: string;
    description: string;
    extBannerDescription: string;
    descriptionStyle: string;
    showcaseTitle: string;
    showcaseDescription: string;
    imageUrl: string;
    dynamicImage: string;
    smallImageUrl: string;
    backgroundImageUrl: string;
    showcaseBackgroundImageUrl: string;
    showcaseBackgroundLargeImageUrl: string;
    promotionBackgroundLeft: string;
    promotionBackgroundRight: string;
    iconUrl: string;
    animatedIconUrl: string;
    animatedLargeBackgroundImageUrl: string;
    destinationUrl: string;
    linkText: string;
    hash: string;
    activityType: string;
    isRecurring: boolean;
    isHidden: boolean;
    isTestOnly: boolean;
    isGiveEligible: boolean;
    level: string;
    slidesCount: number;
    legalText: string;
    legalLinkText: string;
    deviceType: string;
    exclusiveLockedFeatureType: string;
    exclusiveLockedFeatureStatus: string;
}

export interface PunchCard {
    name: string;
    parentPromotion: PromotionalItem;
    childPromotions: PromotionalItem[];
}

export interface StreakBonusPromotion {
    name: string;
    priority: number;
    attributes: StreakBonusPromotionAttributes;
    offerId: string;
    complete: boolean;
    counter: number;
    activityProgress: number;
    activityProgressMax: number;
    pointProgressMax: number;
    pointProgress: number;
    promotionType: string;
    promotionSubtype: string;
    title: string;
    extBannerTitle: string;
    titleStyle: string;
    theme: string;
    description: string;
    extBannerDescription: string;
    descriptionStyle: string;
    showcaseTitle: string;
    showcaseDescription: string;
    imageUrl: string;
    dynamicImage: string;
    smallImageUrl: string;
    backgroundImageUrl: string;
    showcaseBackgroundImageUrl: string;
    showcaseBackgroundLargeImageUrl: string;
    promotionBackgroundLeft: string;
    promotionBackgroundRight: string;
    iconUrl: string;
    animatedIconUrl: string;
    animatedLargeBackgroundImageUrl: string;
    destinationUrl: string;
    linkText: string;
    hash: string;
    activityType: string;
    isRecurring: boolean;
    isHidden: boolean;
    isTestOnly: boolean;
    isGiveEligible: boolean;
    level: string;
    slidesCount: number;
    legalText: string;
    legalLinkText: string;
    deviceType: string;
}

export interface StreakBonusPromotionAttributes {
    hidden: GiveEligible;
    type: string;
    title: string;
    description: string;
    description_localizedkey: string;
    image: string;
    animated_icon: string;
    activity_progress: string;
    activity_max: string;
    bonus_earned: string;
    break_description: string;
    give_eligible: GiveEligible;
    destination: string;
}

export interface StreakPromotion {
    lastUpdatedDate: Date;
    breakImageUrl: string;
    lifetimeMaxValue: number;
    bonusPointsEarned: number;
    name: string;
    priority: number;
    attributes: StreakPromotionAttributes;
    offerId: string;
    complete: boolean;
    counter: number;
    activityProgress: number;
    activityProgressMax: number;
    pointProgressMax: number;
    pointProgress: number;
    promotionType: string;
    promotionSubtype: string;
    title: string;
    extBannerTitle: string;
    titleStyle: string;
    theme: string;
    description: string;
    extBannerDescription: string;
    descriptionStyle: string;
    showcaseTitle: string;
    showcaseDescription: string;
    imageUrl: string;
    dynamicImage: string;
    smallImageUrl: string;
    backgroundImageUrl: string;
    showcaseBackgroundImageUrl: string;
    showcaseBackgroundLargeImageUrl: string;
    promotionBackgroundLeft: string;
    promotionBackgroundRight: string;
    iconUrl: string;
    animatedIconUrl: string;
    animatedLargeBackgroundImageUrl: string;
    destinationUrl: string;
    linkText: string;
    hash: string;
    activityType: string;
    isRecurring: boolean;
    isHidden: boolean;
    isTestOnly: boolean;
    isGiveEligible: boolean;
    level: string;
    slidesCount: number;
    legalText: string;
    legalLinkText: string;
    deviceType: string;
}

export interface StreakPromotionAttributes {
    hidden: GiveEligible;
    type: string;
    title: string;
    image: string;
    activity_progress: string;
    last_updated: Date;
    break_image: string;
    lifetime_max: string;
    bonus_points: string;
    give_eligible: GiveEligible;
    destination: string;
}

export interface UserInterests {
    name: string;
    priority: number;
    attributes: UserInterestsAttributes;
    offerId: string;
    complete: boolean;
    counter: number;
    activityProgress: number;
    activityProgressMax: number;
    pointProgressMax: number;
    pointProgress: number;
    promotionType: string;
    promotionSubtype: string;
    title: string;
    extBannerTitle: string;
    titleStyle: string;
    theme: string;
    description: string;
    extBannerDescription: string;
    descriptionStyle: string;
    showcaseTitle: string;
    showcaseDescription: string;
    imageUrl: string;
    dynamicImage: string;
    smallImageUrl: string;
    backgroundImageUrl: string;
    showcaseBackgroundImageUrl: string;
    showcaseBackgroundLargeImageUrl: string;
    promotionBackgroundLeft: string;
    promotionBackgroundRight: string;
    iconUrl: string;
    animatedIconUrl: string;
    animatedLargeBackgroundImageUrl: string;
    destinationUrl: string;
    linkText: string;
    hash: string;
    activityType: string;
    isRecurring: boolean;
    isHidden: boolean;
    isTestOnly: boolean;
    isGiveEligible: boolean;
    level: string;
    slidesCount: number;
    legalText: string;
    legalLinkText: string;
    deviceType: string;
}

export interface UserInterestsAttributes {
    hidden: GiveEligible;
    give_eligible: GiveEligible;
    destination: string;
}

export interface UserProfile {
    ruid: string;
    attributes: UserProfileAttributes;
}

export interface UserProfileAttributes {
    publisher: string;
    publisher_upd: Date;
    creative: string;
    creative_upd: Date;
    program: string;
    program_upd: Date;
    country: string;
    country_upd: Date;
    referrerhash: string;
    referrerhash_upd: Date;
    optout_upd: Date;
    language: string;
    language_upd: Date;
    target: string;
    target_upd: Date;
    created: Date;
    created_upd: Date;
    epuid: string;
    epuid_upd: Date;
    waitlistattributes: string;
    waitlistattributes_upd: Date;
    cbedc: GiveEligible;
    iscashbackeligible: GiveEligible;
    give_user: GiveEligible;
}

export interface UserStatus {
    levelInfo: LevelInfo;
    availablePoints: number;
    lifetimePoints: number;
    lifetimePointsRedeemed: number;
    ePuid: string;
    redeemGoal: AutoRedeemItem;
    counters: Counters;
    lastOrder: LastOrder;
    dashboardImpression: DashboardImpression;
    referrerProgressInfo: ReferrerProgressInfo;
    isGiveModeOn: boolean;
    giveBalance: number;
    firstTimeGiveModeOptIn: null;
    giveOrganizationName: string;
    lifetimeGivingPoints: number;
    isRewardsUser: boolean;
    isMuidTrialUser: boolean;
}

export interface Counters {
    pcSearch: DashboardImpression[];
    mobileSearch?: DashboardImpression[];
    shopAndEarn: DashboardImpression[];
    activityAndQuiz: ActivityAndQuiz[];
    dailyPoint: DashboardImpression[];
}

export interface ActivityAndQuiz {
    name: string;
    priority: number;
    attributes: ActivityAndQuizAttributes;
    offerId: string;
    complete: boolean;
    counter: number;
    activityProgress: number;
    activityProgressMax: number;
    pointProgressMax: number;
    pointProgress: number;
    promotionType: string;
    promotionSubtype: string;
    title: string;
    extBannerTitle: string;
    titleStyle: string;
    theme: string;
    description: string;
    extBannerDescription: string;
    descriptionStyle: string;
    showcaseTitle: string;
    showcaseDescription: string;
    imageUrl: string;
    dynamicImage: string;
    smallImageUrl: string;
    backgroundImageUrl: string;
    showcaseBackgroundImageUrl: string;
    showcaseBackgroundLargeImageUrl: string;
    promotionBackgroundLeft: string;
    promotionBackgroundRight: string;
    iconUrl: string;
    animatedIconUrl: string;
    animatedLargeBackgroundImageUrl: string;
    destinationUrl: string;
    linkText: string;
    hash: string;
    activityType: string;
    isRecurring: boolean;
    isHidden: boolean;
    isTestOnly: boolean;
    isGiveEligible: boolean;
    level: string;
    slidesCount: number;
    legalText: string;
    legalLinkText: string;
    deviceType: string;
}

export interface ActivityAndQuizAttributes {
    type: string;
    title: string;
    link_text: string;
    description: string;
    foreground_color: string;
    image: string;
    recurring: string;
    destination: string;
    'classification.ShowProgress': GiveEligible;
    hidden: GiveEligible;
    give_eligible: GiveEligible;
}

export interface LastOrder {
    id: null;
    price: number;
    status: null;
    sku: null;
    timestamp: Date;
    catalogItem: null;
}

export interface LevelInfo {
    activeLevel: string;
    activeLevelName: string;
    progress: number;
    progressMax: number;
    levels: Level[];
    benefitsPromotion: DashboardImpression;
}

export interface Level {
    key: string;
    active: boolean;
    name: string;
    tasks: CloseLink[];
    privileges: CloseLink[];
}

export interface ReferrerProgressInfo {
    pointsEarned: number;
    pointsMax: number;
    isComplete: boolean;
    promotions: string[];
}
