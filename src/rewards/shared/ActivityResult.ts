import { randomUUID } from 'node:crypto'
import { sanitizeLogMessage } from '../../logging/LogMessage'
import { pointValue } from './PointAccounting'
import type { ActivityResult, ActivityStatus } from '../types/ActivityResult'

export type { ActivityResult, ActivityStatus } from '../types/ActivityResult'

export function activityResult(
    status: ActivityStatus,
    reason: string,
    offerId?: string,
    pointsGained: number | null = status === 'skipped' ? 0 : null
): ActivityResult {
    const measured = pointValue(pointsGained)
    return {
        status,
        reason,
        offerId,
        operationId: randomUUID(),
        pointsGained: measured ?? 0,
        pointsKnown: measured !== null
    }
}

export class ActivitySkipError extends Error {
    constructor(
        readonly reason: string,
        message: string
    ) {
        super(message)
        this.name = 'ActivitySkipError'
    }
}

export function activityFailure(error: unknown, offerId?: string): ActivityResult {
    return {
        ...activityResult(
            error instanceof ActivitySkipError ? 'unconfirmed' : 'failed',
            error instanceof ActivitySkipError ? error.reason : 'activity-error',
            offerId
        ),
        message: sanitizeLogMessage(error instanceof Error ? error.message : String(error)),
        errorCode:
            error instanceof Error && 'code' in error && typeof error.code === 'string'
                ? error.code
                : error instanceof Error
                  ? error.name
                  : 'Error'
    }
}

export function summarizeActivities(results: readonly ActivityResult[]): Record<ActivityStatus, number> {
    const counts = { confirmed: 0, unconfirmed: 0, skipped: 0, failed: 0 }
    for (const result of results) counts[result.status]++
    return counts
}

export function nonReportableOfferResult(offer: {
    offerId: string
    hash: string | null
    isCompleted: boolean
    isLocked: boolean
    isDisabled?: boolean
    date?: string | null
}): ActivityResult {
    if (offer.isCompleted) return activityResult('skipped', 'already-complete', offer.offerId)
    if (offer.isLocked) return activityResult('skipped', 'offer-locked', offer.offerId)
    if (offer.isDisabled) return activityResult('skipped', 'offer-disabled', offer.offerId)
    if (offer.date && Date.parse(offer.date) > Date.now())
        return activityResult('skipped', 'offer-not-yet-available', offer.offerId)
    return activityResult('unconfirmed', offer.hash ? 'offer-not-actionable' : 'offer-hash-unavailable', offer.offerId)
}
