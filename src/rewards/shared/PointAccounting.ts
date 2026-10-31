import { getWebPromotions, type BasePromotion } from './Promotion'
import type { RewardsDashboard } from '../types/RewardsState'

export function pointValue(value: unknown): number | null {
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null
    const points = Number(value)
    return Number.isFinite(points) && points >= 0 ? points : null
}

export function pointDelta(before: unknown, after: unknown): number | null {
    const start = pointValue(before)
    const end = pointValue(after)
    return start !== null && end !== null && end >= start ? end - start : null
}

export function creditedPoints(progress: number | null, beforeBalance: unknown, afterBalance: unknown): number | null {
    const credited = pointDelta(beforeBalance, afterBalance)
    if (progress === 0 && credited !== 0) return null
    return progress !== null && credited !== null && credited >= progress ? progress : null
}

export function promotionProgress(promotion?: BasePromotion | null): number | null {
    return promotion?.pointProgressKnown === false ? null : pointValue(promotion?.pointProgress)
}

export function promotionPoints(before?: BasePromotion | null, after?: BasePromotion | null): number | null {
    if (!before || !after || before.offerId !== after.offerId) return null
    if (before.pointProgressMax !== after.pointProgressMax) return null
    return pointDelta(promotionProgress(before), promotionProgress(after))
}

export function findPointOffer(dashboard: RewardsDashboard, offerId: string): BasePromotion | undefined {
    return [
        ...getWebPromotions(dashboard),
        ...dashboard.punchCards.flatMap(card => [card.parentPromotion, ...card.childPromotions]),
        dashboard.streakPromotion,
        ...dashboard.streakBonusPromotions,
        dashboard.pointClaimBannerPromotion
    ].find((offer): offer is BasePromotion => offer?.offerId === offerId)
}
