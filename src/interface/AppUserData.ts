export interface AppUserData {
    response: Response;
    correlationId: string;
    code: number;
}

export interface Response {
    profile: Profile;
    balance: number;
    counters: null;
    promotions: Promotion[];
    catalog: null;
    goal_item: GoalItem;
    activities: null;
    cashback: null;
    orders: Order[];
    rebateProfile: null;
    rebatePayouts: null;
    giveProfile: GiveProfile;
    autoRedeemProfile: null;
    autoRedeemItem: null;
    thirdPartyProfile: null;
    notifications: null;
    waitlist: null;
    autoOpenFlyout: null;
    coupons: null;
    recommendedAffordableCatalog: null;
}

export interface GiveProfile {
    give_user: string;
    give_organization: { [key: string]: GiveOrganization | null };
    first_give_optin: string;
    last_give_optout: string;
    give_lifetime_balance: string;
    give_lifetime_donation_balance: string;
    give_balance: string;
    form: null;
}

export interface GiveOrganization {
    give_organization_donation_points: number;
    give_organization_donation_point_to_currency_ratio: number;
    give_organization_donation_currency: number;
}

export interface GoalItem {
    name: string;
    provider: string;
    price: number;
    attributes: GoalItemAttributes;
    config: GoalItemConfig;
}

export interface GoalItemAttributes {
    category: string;
    CategoryDescription: string;
    'desc.group_text': string;
    'desc.legal_text'?: string;
    'desc.sc_description': string;
    'desc.sc_title': string;
    display_order: string;
    ExtraLargeImage: string;
    group: string;
    group_image: string;
    group_sc_image: string;
    group_title: string;
    hidden?: string;
    large_image: string;
    large_sc_image: string;
    medium_image: string;
    MobileImage: string;
    original_price: string;
    Remarks?: string;
    ShortText?: string;
    showcase?: string;
    small_image: string;
    title: string;
    cimsid: string;
    user_defined_goal?: string;
    disable_bot_redemptions?: string;
    'desc.large_text'?: string;
    english_title?: string;
    etid?: string;
    sku?: string;
    coupon_discount?: string;
}

export interface GoalItemConfig {
    amount: string;
    currencyCode: string;
    isHidden: string;
    PointToCurrencyConversionRatio: string;
}

export interface Order {
    id: string;
    t: Date;
    sku: string;
    item_snapshot: ItemSnapshot;
    p: number;
    s: S;
    a: A;
    child_redemption: null;
    third_party_partner: null;
    log: Log[];
}

export interface A {
    form?: string;
    OrderId: string;
    CorrelationId: string;
    Channel: string;
    Language: string;
    Country: string;
    EvaluationId: string;
    provider?: string;
    referenceOrderID?: string;
    externalRefID?: string;
    denomination?: string;
    rewardName?: string;
    sendEmail?: string;
    status?: string;
    createdAt?: Date;
    bal_before_deduct?: string;
    bal_after_deduct?: string;
}

export interface ItemSnapshot {
    name: string;
    provider: string;
    price: number;
    attributes: GoalItemAttributes;
    config: ItemSnapshotConfig;
}

export interface ItemSnapshotConfig {
    amount: string;
    countryCode: string;
    currencyCode: string;
    sku: string;
}

export interface Log {
    time: Date;
    from: From;
    to: S;
    reason: string;
}

export enum From {
    Created = 'Created',
    RiskApproved = 'RiskApproved',
    RiskReview = 'RiskReview'
}

export enum S {
    Cancelled = 'Cancelled',
    RiskApproved = 'RiskApproved',
    RiskReview = 'RiskReview',
    Shipped = 'Shipped'
}

export interface Profile {
    ruid: string;
    attributes: ProfileAttributes;
    offline_attributes: OfflineAttributes;
}

export interface ProfileAttributes {
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
    goal: string;
    goal_upd: Date;
    waitlistattributes: string;
    waitlistattributes_upd: Date;
    serpbotscore_upd: Date;
    iscashbackeligible: string;
    cbedc: string;
    rlscpct_upd: Date;
    give_user: string;
    rebcpc_upd: Date;
    SerpBotScore_upd: Date;
    AdsBotScore_upd: Date;
    dbs_upd: Date;
    rbs: string;
    rbs_upd: Date;
    iris_segmentation: string;
    iris_segmentation_upd: Date;
}

export interface OfflineAttributes {
}

export interface Promotion {
    name: string;
    priority: number;
    attributes: { [key: string]: string };
    tags: Tag[];
}

export enum Tag {
    AllowTrialUser = 'allow_trial_user',
    ExcludeGivePcparent = 'exclude_give_pcparent',
    ExcludeGlobalConfig = 'exclude_global_config',
    ExcludeHidden = 'exclude_hidden',
    LOCString = 'locString',
    NonGlobalConfig = 'non_global_config'
}
