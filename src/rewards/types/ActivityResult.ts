import type { ActivationOutcome } from '../shared/ActivationOutcome'

export type ActivityStatus = 'confirmed' | 'unconfirmed' | 'skipped' | 'failed'

export interface ActivityResult {
    status: ActivityStatus
    reason: string
    title?: string
    message?: string
    errorCode?: string
    operationId?: string
    offerId?: string
    pointsKnown?: boolean
    pointsGained: number
    /** Observed account balances; their difference is not verified activity credit. */
    balanceBefore?: number | null
    balanceAfter?: number | null
    activation?: ActivationOutcome
}
