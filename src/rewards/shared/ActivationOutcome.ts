import { activityResult, type ActivityResult } from './ActivityResult'
import { sanitizeLogMessage } from '../../logging/LogMessage'

export interface ActivationOutcome {
    status: 'activated' | 'already-active' | 'unavailable' | 'unconfirmed' | 'failed'
    reason: string
    attempted: boolean
    offerId?: string
    message?: string
    httpStatus?: number
    acknowledged?: boolean
    verified?: boolean
    errorCode?: string
}

export function activationOutcome(
    status: ActivationOutcome['status'],
    reason: string,
    offerId?: string,
    attempted = false,
    details: Partial<Omit<ActivationOutcome, 'status' | 'reason' | 'offerId' | 'attempted'>> = {}
): ActivationOutcome {
    return { status, reason, offerId, attempted, ...details }
}

export function activationActivity(outcome: ActivationOutcome): ActivityResult {
    const status =
        outcome.status === 'unavailable' || outcome.status === 'already-active'
            ? 'skipped'
            : outcome.status === 'activated'
              ? 'confirmed'
              : outcome.status
    return {
        ...activityResult(status, outcome.reason, outcome.offerId),
        message: outcome.message,
        errorCode: outcome.errorCode,
        activation: outcome
    }
}

export function activationException(error: unknown, offerId?: string, attempted = false): ActivationOutcome {
    const request = error as { status?: number; response?: { status?: number }; code?: string } | null
    const httpStatus = request?.response?.status ?? request?.status
    const rejected = attempted && typeof httpStatus === 'number' && httpStatus >= 400 && httpStatus < 500
    return activationOutcome(
        rejected ? 'failed' : 'unconfirmed',
        rejected
            ? 'activation-request-rejected'
            : attempted
              ? 'activation-request-error'
              : 'activation-data-unavailable',
        offerId,
        attempted,
        {
            message: sanitizeLogMessage(error instanceof Error ? error.message : String(error)),
            httpStatus,
            errorCode: typeof request?.code === 'string' ? request.code : error instanceof Error ? error.name : 'Error'
        }
    )
}

export function isActivationOutcome(value: unknown): value is ActivationOutcome {
    if (!value || typeof value !== 'object') return false
    const data = value as Record<string, unknown>
    return (
        ['activated', 'already-active', 'unavailable', 'unconfirmed', 'failed'].includes(String(data.status)) &&
        typeof data.reason === 'string' &&
        typeof data.attempted === 'boolean' &&
        ['offerId', 'message', 'errorCode'].every(key => data[key] === undefined || typeof data[key] === 'string') &&
        ['acknowledged', 'verified'].every(key => data[key] === undefined || typeof data[key] === 'boolean') &&
        (data.httpStatus === undefined ||
            (Number.isSafeInteger(data.httpStatus) && Number(data.httpStatus) >= 100 && Number(data.httpStatus) <= 599))
    )
}
