import type { BasePromotion, RawPromotion, PunchCard } from '../Promotion'
import type { AccountInfo, Counters, LevelInfo, Profile, RewardsDashboard, UserWarning } from '../../types/RewardsState'
import { pointValue } from '../PointAccounting'

export function record(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {}
}
function text(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback
}
function numeric(value: unknown): number | undefined {
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return undefined
    const n = Number(value)
    return Number.isFinite(n) ? n : undefined
}

export function normalizeAccountLevel(value: unknown): number | null {
    const match =
        typeof value === 'string' ? value.trim().match(/^(?:(?:new)?level[\s_-]*)?([1-9]\d*)(?:xboxgold)?$/i) : null
    const level = typeof value === 'number' ? value : match ? Number(match[1]) : NaN
    return Number.isSafeInteger(level) && level > 0 ? level : null
}

function normalizeLevelInfo(value: unknown): LevelInfo | null {
    const info = record(value)
    if (!Object.keys(info).length) return null
    return {
        activeLevel: text(info.activeLevel) || null,
        activeLevelName: text(info.activeLevelName) || null,
        progress: pointValue(info.progress),
        progressMax: pointValue(info.progressMax)
    }
}

export function normalizeAccountInfo(value: unknown): AccountInfo {
    const data = record(value)
    const info = record(data.levelInfo)
    const pointsProgress = pointValue(data.pointsProgress) ?? pointValue(info.progress)
    const progressMax = pointValue(info.progressMax)
    return {
        level:
            normalizeAccountLevel(info.activeLevel) ??
            normalizeAccountLevel(data.level) ??
            normalizeAccountLevel(info.level),
        pointsProgress,
        pointsRemaining:
            pointValue(data.pointsRemaining) ??
            (pointsProgress !== null && progressMax !== null ? Math.max(0, progressMax - pointsProgress) : null),
        lifetimeEarn: pointValue(data.lifetimeEarn) ?? pointValue(data.lifetimePoints),
        availablePoints: pointValue(data.availablePoints)
    }
}

export function mergeAccountInfo(...values: unknown[]): AccountInfo {
    const account = normalizeAccountInfo(null)
    for (const value of values) {
        const candidate = normalizeAccountInfo(value)
        for (const key of Object.keys(account) as (keyof AccountInfo)[]) account[key] ??= candidate[key]
    }
    return account
}

export function normalizePromotion(value: unknown): BasePromotion | null {
    const item = record(value)
    const attributes = record(item.attributes)
    const offerId = text(item.offerId) || text(attributes.offerid) || text(item.name)
    if (!offerId) return null
    return {
        name: typeof item.name === 'string' ? item.name : null,
        offerId,
        title: text(item.title),
        description: text(item.description),
        destinationUrl: text(item.destinationUrl),
        promotionType: text(item.promotionType),
        promotionSubtype: text(item.promotionSubtype),
        attributes,
        complete: item.complete === true,
        priority: numeric(item.priority) ?? 0,
        isHidden: item.isHidden === true,
        pointProgress: pointValue(item.pointProgress ?? attributes.pointprogress) ?? 0,
        pointProgressKnown:
            item.pointProgressKnown !== false && pointValue(item.pointProgress ?? attributes.pointprogress) !== null,
        pointProgressMax: pointValue(item.pointProgressMax ?? attributes.pointmax) ?? 0,
        pointProgressMaxKnown:
            item.pointProgressMaxKnown !== false && pointValue(item.pointProgressMax ?? attributes.pointmax) !== null,
        activityProgress: numeric(item.activityProgress) ?? 0,
        activityProgressMax: numeric(item.activityProgressMax) ?? 0,
        exclusiveLockedFeatureStatus: text(item.exclusiveLockedFeatureStatus),
        hash: typeof item.hash === 'string' ? item.hash : undefined,
        activityType:
            typeof item.activityType === 'string' || typeof item.activityType === 'number' ? item.activityType : null
    }
}
function normalizePromotions(value: unknown): BasePromotion[] {
    if (!Array.isArray(value)) return []
    return value.map(normalizePromotion).filter((p): p is BasePromotion => p !== null)
}
function normalizeCounters(value: unknown): Counters {
    const counters = record(value)
    const read = (value: unknown): BasePromotion[] | undefined => {
        if (!Array.isArray(value)) return undefined
        if (
            value.some(
                item =>
                    pointValue(record(item).pointProgress) === null ||
                    pointValue(record(item).pointProgressMax) === null ||
                    Number(record(item).pointProgress) > Number(record(item).pointProgressMax)
            )
        )
            return undefined

        return value
            .map((item, i) => {
                const counter = record(item)
                return normalizePromotion({ ...counter, name: text(counter.name) || `counter-${i}` })
            })
            .filter((p): p is BasePromotion => p !== null)
    }
    return {
        pcSearch: read(counters.pcSearch ?? counters.PCSearch),
        mobileSearch: read(counters.mobileSearch ?? counters.MobileSearch),
        activityAndQuiz: read(counters.activityAndQuiz ?? counters.ActivityAndQuiz),
        dailyPoint: read(counters.dailyPoint ?? counters.DailyPoint)
    }
}
export function normalizeProfile(value: unknown): Profile {
    const profile = record(value)
    const attributes = record(profile.attributes)
    return {
        ruid: typeof profile.ruid === 'string' ? profile.ruid : undefined,
        attributes: { ...attributes, country: typeof attributes.country === 'string' ? attributes.country : undefined }
    }
}
export function normalizeWarnings(value: unknown): UserWarning[] {
    return Array.isArray(value)
        ? value.flatMap(w => (typeof record(w).name === 'string' ? [{ name: String(record(w).name) }] : []))
        : []
}
export function normalizeDashboard(value: unknown): RewardsDashboard {
    const data = record(value)
    const status = record(data.userStatus)
    const availablePoints = pointValue(status.availablePoints)
    if (availablePoints === null) throw new Error('Rewards balance is missing or invalid')
    const cards: PunchCard[] = []
    if (Array.isArray(data.punchCards)) {
        for (const value of data.punchCards) {
            const card = record(value)
            const parentPromotion = normalizePromotion(card.parentPromotion)
            if (parentPromotion)
                cards.push({ parentPromotion, childPromotions: normalizePromotions(card.childPromotions) })
        }
    }
    const protection = record(data.streakProtectionPromo)
    return {
        userStatus: {
            level: normalizeAccountInfo(status).level,
            levelInfo: normalizeLevelInfo(status.levelInfo),
            availablePoints,
            lifetimePoints: numeric(status.lifetimePoints) ?? 0,
            lifetimePointsRedeemed: numeric(status.lifetimePointsRedeemed) ?? 0,
            lifetimeGivingPoints: numeric(status.lifetimeGivingPoints) ?? 0,
            isRewardsUser: status.isRewardsUser === true,
            counters: normalizeCounters(status.counters)
        },
        userProfile: normalizeProfile(data.userProfile),
        userWarnings: normalizeWarnings(data.userWarnings),
        dailySetPromotions: Object.fromEntries(
            Object.entries(record(data.dailySetPromotions)).map(([date, promotions]) => [
                date,
                normalizePromotions(promotions)
            ])
        ),
        morePromotions: normalizePromotions(data.morePromotions),
        morePromotionsWithoutPromotionalItems: normalizePromotions(data.morePromotionsWithoutPromotionalItems),
        promotionalItem: normalizePromotion(data.promotionalItem),
        promotionalItems: normalizePromotions(data.promotionalItems),
        punchCards: cards,
        streakPromotion: normalizePromotion(data.streakPromotion),
        streakBonusPromotions: normalizePromotions(data.streakBonusPromotions),
        streakProtectionPromo: Object.keys(protection).length
            ? { streakProtectionStatus: protection.streakProtectionStatus, remainingDays: protection.remainingDays }
            : null,
        pointClaimBannerPromotion: normalizePromotion(data.pointClaimBannerPromotion),
        highValueSweepstakesPromotions: normalizePromotions(data.highValueSweepstakesPromotions),
        componentImpressionPromotions: normalizePromotions(data.componentImpressionPromotions),
        autoRedeemItem: data.autoRedeemItem ?? null,
        isAutoRedeemEligible: data.isAutoRedeemEligible === true
    }
}
export function isRawPromotion(value: unknown): value is RawPromotion {
    const item = record(value)
    return (
        typeof item.promotionType === 'string' ||
        typeof item.offerId === 'string' ||
        typeof item.destinationUrl === 'string'
    )
}
