import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import type { Page } from 'patchright'
import type { BasePromotion, RewardsDashboard, RewardsState } from '../types/RewardsState'
import { getWebPromotions } from '../shared/Promotion'
import { URLs } from '../../constants/urls'
import { normalizeCardText, normalizeRewardUrl } from './parsers/RewardCardParser'

export type BrowserTaskSurface = 'earn' | 'flyout'

export const browserTaskPass = new AsyncLocalStorage<{
    surface: BrowserTaskSurface
    confirmed: Set<string>
    page?: Page
    readEarn?: () => Promise<RewardsState>
}>()

export function browserOfferKey(promotion: Pick<BasePromotion, 'title' | 'description' | 'destinationUrl'>): string {
    const key = [
        normalizeCardText(promotion.title),
        normalizeCardText(promotion.description),
        normalizeRewardUrl(promotion.destinationUrl, URLs.rewards.earn, true)
    ]
    return `card:${createHash('sha256').update(JSON.stringify(key)).digest('hex').slice(0, 24)}`
}

export function confirmBrowserOffer(promotion: BasePromotion): void {
    const confirmed = browserTaskPass.getStore()?.confirmed
    confirmed?.add(promotion.offerId)
    confirmed?.add(browserOfferKey(promotion))
}

export function findBrowserOffer(dashboard: RewardsDashboard, target: BasePromotion): BasePromotion | undefined {
    const offers = getWebPromotions(dashboard)
    return (
        offers.find(offer => offer.offerId === target.offerId) ??
        offers.find(offer => browserOfferKey(offer) === browserOfferKey(target))
    )
}

export function markConfirmedBrowserOffers(data: RewardsState, confirmed: Set<string>): RewardsState {
    const mark = (promotion: BasePromotion) =>
        confirmed.has(promotion.offerId) || confirmed.has(browserOfferKey(promotion))
            ? { ...promotion, complete: true }
            : promotion
    return {
        ...data,
        dashboard: {
            ...data.dashboard,
            dailySetPromotions: Object.fromEntries(
                Object.entries(data.dashboard.dailySetPromotions ?? {}).map(([date, items]) => [date, items.map(mark)])
            ),
            morePromotions: (data.dashboard.morePromotions ?? []).map(mark),
            morePromotionsWithoutPromotionalItems: (data.dashboard.morePromotionsWithoutPromotionalItems ?? []).map(
                mark
            ),
            promotionalItem: data.dashboard.promotionalItem ? mark(data.dashboard.promotionalItem) : null,
            promotionalItems: (data.dashboard.promotionalItems ?? []).map(mark)
        }
    }
}
