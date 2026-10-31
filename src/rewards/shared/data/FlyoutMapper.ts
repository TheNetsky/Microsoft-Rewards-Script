import { isEligiblePromotion, isSearchOnBingPromotion } from '../PromotionEligibility'
import type { BasePromotion, RewardsState } from '../../types/RewardsState'
import type { RawPromotion } from '../Promotion'
import type { RewardsFlyoutData, FlyoutResult } from './FlyoutTypes'
import { mergeAccountInfo, normalizeDashboard, normalizePromotion, isRawPromotion } from '../parsers/NormalizeRewards'
import { isPlainObject } from '../../../util/Utils'

export type { RewardsFlyoutData } from './FlyoutTypes'

export function mapFlyoutToDashboard(data: RewardsFlyoutData, account: RewardsState): RewardsState {
    const userInfo = data.userInfo
    const flyout = data.flyoutResult
    const profile = account.profile

    if (data.isError || !flyout) {
        const message = data.errorMessage ?? userInfo?.errorMessage ?? 'Flyout response is missing Rewards task data'
        throw new Error(message)
    }

    const explorePromotions = uniquePromotions([
        ...(flyout.exploreOnBingPromotions ?? []),
        ...(flyout.exploreOnOutlookPromotions ?? [])
    ])
    const singularCardPromotions = [
        flyout.acquisitionPromotion,
        flyout.bingOnboardingPromotion,
        flyout.bingTrialStreakPromotion,
        flyout.dailySurprisePromotion,
        flyout.edgeAcquisitionPromotion,
        flyout.exploreOnBingAnyCardCompletionPromotion,
        flyout.onboardingChecklistBonusPromotion,
        flyout.onboardingPromotion,
        flyout.oneTimeStreakPromotion,
        flyout.partnerGreetingPromotion,
        flyout.searchStreakPromotion
    ].filter((promotion): promotion is RawPromotion => Boolean(promotion))
    const activityCardPromotions = uniquePromotions([
        ...(flyout.highValueActionPromotions ?? []),
        ...(flyout.edgeHighValueActionPromotions ?? []),
        ...explorePromotions,
        ...(flyout.onboardingChecklistPromotions ?? []),
        ...(flyout.browseStreakPromotions ?? []),
        ...(flyout.dailySurpriseL2Promotions ?? []),
        ...singularCardPromotions
    ])
    const primaryPromotions = uniquePromotions([
        ...activityCardPromotions,
        ...(flyout.searchAndEarnPromotion ? [flyout.searchAndEarnPromotion] : []),
        ...(flyout.dailyCheckInPromotion ? [flyout.dailyCheckInPromotion] : [])
    ])
    const dailySetPromotions = Object.fromEntries(
        Object.entries(flyout.dailySetPromotions ?? {}).map(([date, promotions]) => [
            date,
            uniquePromotions(promotions)
        ])
    )
    const morePromotions = uniquePromotions(flyout.morePromotions ?? [])
    const morePromotionsWithoutPromotionalItems = uniquePromotions([
        ...(flyout.morePromotionsWithoutPromotionalItems ?? []),
        ...activityCardPromotions,
        ...(flyout.searchAndEarnPromotion ? [flyout.searchAndEarnPromotion] : [])
    ])
    const activitySources = collectFlyoutPromotionSources(flyout)
    const sourceActivities = new Map<
        string,
        {
            offerId: string
            title: string
            sources: string[]
            kind: 'urlReward' | 'searchOnBing' | 'statusCard' | 'unsupported'
            actionable: boolean
            reason?: string
        }
    >()

    for (const [source, promotions] of activitySources) {
        for (const promotion of promotions) {
            const attributes =
                promotion.attributes && typeof promotion.attributes === 'object'
                    ? (promotion.attributes as Record<string, unknown>)
                    : {}
            const offerId = promotion.offerId || String(attributes.offerid ?? '')
            if (!offerId) continue

            const existing = sourceActivities.get(offerId)
            if (existing) {
                if (!existing.sources.includes(source)) existing.sources.push(source)
                continue
            }

            const promotionType = promotion.promotionType?.toLowerCase() ?? ''
            const searchOnBing = isSearchOnBingPromotion(promotion)

            const statusCard = promotionType === 'searchandearncardtype'
            const supported = promotionType === 'urlreward'
            const actionable =
                supported &&
                Boolean(promotion.destinationUrl) &&
                promotion.pointProgressMax > 0 &&
                isEligiblePromotion(promotion, true)

            const kind = searchOnBing
                ? 'searchOnBing'
                : supported
                  ? 'urlReward'
                  : statusCard
                    ? 'statusCard'
                    : 'unsupported'

            sourceActivities.set(offerId, {
                offerId,
                title: promotion.title ?? '',
                sources: [source],
                kind,
                actionable,
                ...(!supported && !statusCard
                    ? { reason: `unsupported promotion type: ${promotion.promotionType}` }
                    : {})
            })
        }
    }

    for (const promotion of userInfo?.promotions ?? []) {
        const attributes = promotion.attributes ?? {}
        const offerId = String(attributes.offerid ?? promotion.name ?? '')
        if (!offerId) continue

        const existing = sourceActivities.get(offerId)
        if (existing) {
            if (!existing.sources.includes('userInfo.promotions')) existing.sources.push('userInfo.promotions')
            continue
        }

        const type = String(attributes.type ?? '').toLowerCase()
        const markers = [promotion.name, offerId, type].filter(Boolean).join(' ')
        const searchOnBing =
            type === 'urlreward' &&
            (/explore[\s_-]*on[\s_-]*bing/i.test(markers) ||
                String(attributes.isExploreOnBingTask ?? '').toLowerCase() === 'true')
        const kind = searchOnBing
            ? 'searchOnBing'
            : type === 'urlreward'
              ? 'urlReward'
              : type === 'search' || type === 'searchandearncardtype'
                ? 'statusCard'
                : 'unsupported'

        sourceActivities.set(offerId, {
            offerId,
            title: String(attributes.title ?? ''),
            sources: ['userInfo.promotions'],
            kind,
            actionable: false,
            reason:
                kind === 'unsupported'
                    ? `unsupported promotion type: ${type || 'unknown'}`
                    : 'not materialized as an actionable flyout promotion'
        })
    }

    const accountInfo = mergeAccountInfo(account.account, flyout.userStatus)
    const dashboard = normalizeDashboard({
        ...account.dashboard,
        userStatus: {
            ...account.dashboard.userStatus,
            level: accountInfo.level,
            levelInfo:
                account.dashboard.userStatus.levelInfo ??
                (account.account.level === null ? flyout.userStatus?.levelInfo : null)
        },
        promotionalItem: primaryPromotions[0] ?? null,
        promotionalItems: primaryPromotions.slice(1),
        dailySetPromotions,
        morePromotions,
        morePromotionsWithoutPromotionalItems,
        highValueSweepstakesPromotions: uniquePromotions(flyout.highValueSweepstakesPromotions ?? []),
        punchCards: flyout.punchCards ?? [],
        componentImpressionPromotions: uniquePromotions(flyout.impressionPromotions ?? [])
    })

    const parsedSections = Object.entries(flyout)
        .filter(([, value]) => value !== null && value !== undefined)
        .map(([key]) => key)
        .sort()
    const promotionSections = [
        ...activitySources.map(([source]) => source),
        ...(userInfo?.promotions?.length ? ['userInfo.promotions'] : [])
    ].sort()
    const suggestedSearchCount = Array.isArray(flyout.suggestedSearches?.suggestedItems)
        ? flyout.suggestedSearches.suggestedItems.length
        : 0
    const orderCount = Array.isArray(flyout.userOrders)
        ? flyout.userOrders.length
        : Array.isArray(userInfo?.orders)
          ? userInfo.orders.length
          : 0

    return {
        dashboard,
        account: accountInfo,
        profile,
        raw: { source: 'bing-flyout', payload: data },
        sourceInfo: {
            source: 'bing-flyout',
            activities: [...sourceActivities.values()],
            missingSections: [
                ...(account.sourceInfo.missingSections.includes('userWarnings') ? ['userWarnings'] : []),
                ...(flyout.dailySetPromotions === undefined ? ['dailySetPromotions'] : []),
                ...(flyout.morePromotions === undefined && !activityCardPromotions.length ? ['morePromotions'] : []),
                ...(dashboard.userStatus.counters.pcSearch === undefined &&
                dashboard.userStatus.counters.mobileSearch === undefined
                    ? ['counters']
                    : [])
            ],
            metadata: {
                parsedSections,
                promotionSections,
                rewardsCountry: profile.attributes.country ?? null,
                layoutName: flyout.layout?.layoutName ?? null,
                traceId: flyout.traceId ?? null,
                catalogItemCount: userInfo?.catalogItems?.length ?? 0,
                orderCount,
                suggestedSearchCount,
                hasGoal: Boolean(flyout.userGoal ?? userInfo?.catalogGoal),
                hasAutoRedeem: Boolean(account.dashboard.autoRedeemItem)
            }
        }
    }
}

function collectFlyoutPromotionSources(flyout: FlyoutResult): Array<[string, BasePromotion[]]> {
    const sources: Array<[string, BasePromotion[]]> = []

    for (const [section, value] of Object.entries(flyout)) {
        let promotions: RawPromotion[] = []

        if (section === 'dailySetPromotions' && isPlainObject(value)) {
            promotions = Object.values(value).flatMap(entry =>
                Array.isArray(entry) ? entry.filter(isRawPromotion) : []
            )
        } else if (Array.isArray(value)) {
            promotions = value.filter(isRawPromotion)
        } else if (isRawPromotion(value)) {
            promotions = [value]
        }

        if (promotions.length) sources.push([`flyoutResult.${section}`, uniquePromotions(promotions)])
    }

    return sources
}

function uniquePromotions(promotions: unknown[]): BasePromotion[] {
    const unique = new Map<string, BasePromotion>()
    let anonymousIndex = 0

    for (const value of promotions) {
        const promotion = normalizePromotion(value)
        if (!promotion) continue
        const key =
            promotion.offerId?.trim() ||
            promotion.name?.trim() ||
            [promotion.promotionType, promotion.title, promotion.destinationUrl].filter(Boolean).join('|') ||
            `anonymous-${anonymousIndex++}`
        unique.set(key, promotion)
    }

    return [...unique.values()]
}
