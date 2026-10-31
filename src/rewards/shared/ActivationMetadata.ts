import type { PageSnapshot, ParsedOffer, StreakState } from './parsers/RewardsPageParser'
import type { BotContext } from '../../core/BotContext'

export function activationSnapshots(
    bot: Pick<BotContext, 'reactSnapshot' | 'reactSnapshots'>,
    preferred?: PageSnapshot
): { source: 'current' | 'desktop' | 'mobile'; snapshot: PageSnapshot }[] {
    const snapshots = [
        { source: 'current', snapshot: preferred ?? bot.reactSnapshot },
        { source: 'desktop', snapshot: bot.reactSnapshots.desktop },
        { source: 'mobile', snapshot: bot.reactSnapshots.mobile }
    ] as const
    const seen = new Set<PageSnapshot>()
    return snapshots.flatMap(({ source, snapshot }) => {
        if (!snapshot || seen.has(snapshot)) return []
        seen.add(snapshot)
        return [{ source, snapshot }]
    })
}

export function streakActivationTarget(
    streak: StreakState,
    title: string
): (ParsedOffer & { activationSource: 'streak' }) | null {
    if (!streak.activationOfferId) return null
    return {
        offerId: streak.activationOfferId,
        hash: streak.activationHash,
        title,
        description: '',
        points: 0,
        promotionSubtype: null,
        destination: streak.destinationUrl ?? '',
        isCompleted: streak.isEnabled,
        isPromotional: false,
        isLocked: false,
        unlockCriteria: null,
        date: null,
        activityType: streak.activationActivityType,
        reportable: true,
        activationSource: 'streak'
    }
}

interface ActivationMetadata {
    activityType: number
    activityTypeSource: 'react' | 'streak' | 'dashboard' | 'verified-fallback'
    isPromotional: boolean
}

export function resolveActivationMetadata(
    offer: Pick<ParsedOffer, 'offerId' | 'activityType' | 'isPromotional'> & { activationSource: string },
    dashboard: unknown,
    verifiedActivityTypes: ReadonlyMap<string, number>
): ActivationMetadata | null {
    const promotion = findDashboardPromotion(dashboard, offer.offerId)
    const attributes = asRecord(promotion?.attributes)
    const promotional = promotion?.isPromotional ?? promotion?.promotional ?? attributes?.promotional
    const isPromotional =
        offer.isPromotional ||
        promotional === true ||
        (typeof promotional === 'string' && promotional.toLowerCase() === 'true')

    if (offer.activityType !== null) {
        return {
            activityType: offer.activityType,
            activityTypeSource: offer.activationSource === 'streak' ? 'streak' : 'react',
            isPromotional
        }
    }

    const activityType = Number(
        promotion?.activityType ?? promotion?.activity_type ?? attributes?.activityType ?? attributes?.activity_type
    )
    if (Number.isInteger(activityType) && activityType > 0) {
        return { activityType, activityTypeSource: 'dashboard', isPromotional }
    }

    const fallback = verifiedActivityTypes.get(offer.offerId.toLowerCase())
    return fallback === undefined
        ? null
        : { activityType: fallback, activityTypeSource: 'verified-fallback', isPromotional }
}

function findDashboardPromotion(root: unknown, offerId: string): Record<string, unknown> | null {
    const target = offerId.toLowerCase()
    const pending: unknown[] = [root]
    const visited = new Set<object>()

    while (pending.length) {
        const value = pending.pop()
        if (!value || typeof value !== 'object' || visited.has(value)) continue
        visited.add(value)

        if (Array.isArray(value)) {
            for (const entry of value) pending.push(entry)
            continue
        }

        const record = value as Record<string, unknown>
        const attributes = asRecord(record.attributes)
        const candidateId = record.offerId ?? record.offerid ?? attributes?.offerid
        if (typeof candidateId === 'string' && candidateId.toLowerCase() === target) return record

        for (const entry of Object.values(record)) pending.push(entry)
    }

    return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}
