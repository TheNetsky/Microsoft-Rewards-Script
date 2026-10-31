import type { RewardsDashboard } from '../types/RewardsState'

export interface SearchMultiplierPerk {
    offerId: string
    multiplier: number
}

export function detectSearchMultiplierPerk(dashboard: RewardsDashboard): SearchMultiplierPerk | null {
    const candidates = [dashboard.promotionalItem, ...(dashboard.promotionalItems ?? [])]

    for (const item of candidates) {
        if (!item) continue

        const attributes = item.attributes
        const offerId = item.offerId || String(attributes?.offerid ?? '')
        const description = item.description || String(attributes?.description ?? '')
        if (!offerId) continue

        const multiplierAttr = attributes?.searchMultiplier
        const multiplierFromAttr = multiplierAttr != null ? Number(multiplierAttr) : NaN
        const fromDescription = /search\s*(\d+)\s*x\s*more/i.exec(description)
        const fromOfferId = /optin[_-]?(\d+)x(?:[_-]|$)/i.exec(offerId)

        if (!(Number.isFinite(multiplierFromAttr) && multiplierFromAttr > 1) && !fromDescription && !fromOfferId) {
            continue
        }

        const multiplier =
            Number.isFinite(multiplierFromAttr) && multiplierFromAttr > 1
                ? multiplierFromAttr
                : fromDescription
                  ? Number(fromDescription[1])
                  : fromOfferId
                    ? Number(fromOfferId[1])
                    : 2

        return { offerId, multiplier }
    }

    return null
}
