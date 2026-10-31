import type { RewardsState } from '../../types/RewardsState'
import { normalizePromotion } from '../../shared/parsers/NormalizeRewards'
import { normalizeCardText, normalizeRewardUrl, type RenderedRewardCard } from './RewardCardParser'
import { URLs } from '../../../constants/urls'

export function useRenderedDailySet(data: RewardsState, cards: RenderedRewardCard[], today: string): RewardsState {
    const promotions = [
        ...new Map(
            Object.values(data.dashboard.dailySetPromotions)
                .flat()
                .map(promotion => [promotion.offerId, promotion])
        ).values()
    ]
    const daily = cards
        .filter(card => card.visible)
        .flatMap(card => {
            const destination = normalizeRewardUrl(card.destination, URLs.bing.rewardsFlyoutPage, true)
            const byIdentity = promotions.filter(promotion =>
                card.offerIds.length
                    ? card.offerIds.includes(promotion.offerId)
                    : destination !== null &&
                      normalizeRewardUrl(promotion.destinationUrl, URLs.bing.rewardsFlyoutPage, true) === destination
            )
            const matches = byIdentity.length
                ? byIdentity
                : card.offerIds.length
                  ? []
                  : promotions.filter(
                        promotion =>
                            normalizeCardText(promotion.title) === card.title &&
                            normalizeCardText(promotion.description) === card.description
                    )
            const promotion = matches.length === 1 ? matches[0] : undefined
            const offerId = card.offerIds.length === 1 ? card.offerIds[0] : promotion?.offerId
            if (!offerId) return []
            const complete = card.complete || promotion?.complete === true
            const points = card.hasPointsBadge ? card.points : (promotion?.pointProgressMax ?? 0)
            const rendered = normalizePromotion({
                ...promotion,
                offerId,
                name: promotion?.name ?? offerId,
                title: card.title,
                description: card.description,
                destinationUrl: card.destination,
                promotionType: promotion?.promotionType || 'urlreward',
                attributes: { ...promotion?.attributes, renderedSurface: 'flyout' },
                complete,
                isHidden: false,
                pointProgress: complete ? points : (promotion?.pointProgress ?? 0),
                pointProgressKnown: promotion?.pointProgressKnown ?? false,
                pointProgressMax: points,
                exclusiveLockedFeatureStatus: card.disabled && !complete ? 'locked' : ''
            })
            return rendered ? [rendered] : []
        })

    return { ...data, dashboard: { ...data.dashboard, dailySetPromotions: { [today]: daily } } }
}
