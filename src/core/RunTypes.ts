import type { AccountCompletion } from '../rewards/shared/ActivityCompletion'

export interface AccountStats {
    email: string
    initialPoints: number
    finalPoints: number
    collectedPoints: number
    pointsKnown?: boolean
    duration: number
    status?: 'completed' | 'partial' | 'failed' | 'skipped' | 'cancelled'
    success: boolean
    error?: string
    completion?: AccountCompletion
}

export interface AccountRunResult {
    initialPoints: number
    collectedPoints: number
    pointsKnown?: boolean
    deferredReason?: string
}
