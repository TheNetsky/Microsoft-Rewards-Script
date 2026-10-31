import type { ActivityResult } from '../types/ActivityResult'
import { activityLabel, activityReason, sanitizeLogMessage } from '../../logging/LogMessage'
import { isActivationOutcome } from './ActivationOutcome'

export type CompletionCategory = 'completed' | 'incomplete' | 'unavailable' | 'not-applicable'
export type CompletionCounts = Record<'completed' | 'incomplete' | 'unavailable' | 'notApplicable', number>

export interface RecordedActivity extends ActivityResult {
    activity: string
    platform?: string | null
}

export interface CompletionDetail {
    activity: string
    label: string
    platform: 'desktop' | 'mobile' | null
    status: ActivityResult['status']
    category: CompletionCategory
    reason: string
    message: string
    pointsGained?: number | null
    pointsKnown?: boolean
    balanceBefore?: number | null
    balanceAfter?: number | null
    title?: string
    offerId?: string
    operationId?: string
    errorCode?: string
    activation?: ActivityResult['activation']
}

export interface AccountCompletion {
    counts: CompletionCounts
    completed?: CompletionDetail[]
    incomplete: CompletionDetail[]
    unavailable: CompletionDetail[]
    notApplicable: CompletionDetail[]
    accountReason: string | null
    omitted: Record<'incomplete' | 'unavailable' | 'notApplicable', number> & { completed?: number }
}

export interface RunCompletion {
    accounts: Record<'completed' | 'partial' | 'failed' | 'skipped' | 'cancelled' | 'running', number>
    activities: CompletionCounts
    detailsKnown: boolean
}

export function completionCategory(result: Pick<ActivityResult, 'status' | 'reason'>): CompletionCategory {
    if (result.status === 'failed' || result.status === 'unconfirmed') return 'incomplete'
    if (
        result.status === 'confirmed' ||
        ['already-complete', 'offer-already-complete', 'already-active'].includes(result.reason)
    )
        return 'completed'
    if (
        [
            'offer-unavailable',
            'perk-unavailable',
            'offer-not-present',
            'offer-locked',
            'offer-disabled',
            'offer-not-yet-available'
        ].includes(result.reason)
    )
        return 'unavailable'
    return 'not-applicable'
}

export function activityKey(
    activity: string,
    result: Pick<ActivityResult, 'offerId'>,
    platform?: string | null
): string {
    if (activity === 'visual-search' || activity === 'edge-browsing')
        return `${platform?.toLowerCase() ?? 'main'}:${activity}`
    return result.offerId ? `offer:${result.offerId}` : `${platform?.toLowerCase() ?? 'main'}:${activity}`
}

const short = (value: string, limit = 400): string => sanitizeLogMessage(value).slice(0, limit)

export function activityPointKey(result: RecordedActivity): string {
    return result.operationId
        ? `operation:${result.operationId}`
        : result.offerId
          ? `offer:${result.offerId}`
          : `${result.platform}:${result.activity}`
}

function activityPointTotals(results: readonly RecordedActivity[]): Map<string, number> {
    const credits = new Map<string, { task: string; points: number }>()
    for (const result of results) {
        if (result.pointsKnown === false || !Number.isFinite(result.pointsGained) || result.pointsGained <= 0) continue
        const key = activityPointKey(result)
        credits.set(key, {
            task: activityKey(result.activity, result, result.platform),
            points: Math.max(credits.get(key)?.points ?? 0, result.pointsGained)
        })
    }
    const totals = new Map<string, number>()
    for (const { task, points } of credits.values()) totals.set(task, (totals.get(task) ?? 0) + points)
    return totals
}

export function summarizeCompletion(
    results: readonly RecordedActivity[],
    accountReason: string | null = null,
    pointTotals: ReadonlyMap<string, number> = activityPointTotals(results)
): AccountCompletion {
    const latest = new Map<string, RecordedActivity>()
    for (const result of results) {
        const key = activityKey(result.activity, result, result.platform)
        latest.set(key, { ...result, title: result.title ?? latest.get(key)?.title })
    }
    const summary: AccountCompletion = {
        counts: { completed: 0, incomplete: 0, unavailable: 0, notApplicable: 0 },
        completed: [],
        incomplete: [],
        unavailable: [],
        notApplicable: [],
        accountReason: accountReason ? short(accountReason, 1000) : null,
        omitted: { completed: 0, incomplete: 0, unavailable: 0, notApplicable: 0 }
    }
    let detailBytes = 0

    const priority = { incomplete: 0, unavailable: 1, 'not-applicable': 2, completed: 3 }
    const outcomes = [...latest.values()].sort(
        (a, b) => priority[completionCategory(a)] - priority[completionCategory(b)]
    )
    for (const result of outcomes) {
        if ((result.activity.endsWith('-data') || result.activity.endsWith('-quota')) && result.status === 'confirmed')
            continue
        const category = completionCategory(result)
        const key = category === 'not-applicable' ? 'notApplicable' : category
        summary.counts[key]++
        const list = summary[key]!
        if (list.length >= (key === 'completed' ? 50 : 20)) {
            summary.omitted[key] = (summary.omitted[key] ?? 0) + 1
            continue
        }
        const platform = result.platform?.toLowerCase()
        const verifiedPoints = pointTotals.get(activityKey(result.activity, result, result.platform))
        const pointsKnown =
            verifiedPoints !== undefined || (result.pointsKnown !== false && Number.isFinite(result.pointsGained))
        const detail: CompletionDetail = {
            activity: short(result.activity, 100),
            label: short(activityLabel(result.activity), 100),
            platform: platform === 'desktop' || platform === 'mobile' ? platform : null,
            status: result.status,
            category,
            reason: short(result.reason, 100),
            message: short(activityReason(result)),
            pointsGained: verifiedPoints ?? (pointsKnown ? 0 : null),
            pointsKnown,
            balanceBefore: result.balanceBefore ?? null,
            balanceAfter: result.balanceAfter ?? null,
            title: result.title ? short(result.title, 160) : undefined,
            offerId: result.offerId ? short(result.offerId, 200) : undefined,
            operationId: result.operationId ? short(result.operationId, 100) : undefined,
            errorCode: result.errorCode ? short(result.errorCode, 100) : undefined,
            activation: result.activation
                ? {
                      ...result.activation,
                      reason: short(result.activation.reason, 100),
                      offerId: result.activation.offerId ? short(result.activation.offerId, 200) : undefined,
                      message: result.activation.message ? short(result.activation.message, 200) : undefined,
                      errorCode: result.activation.errorCode ? short(result.activation.errorCode, 100) : undefined
                  }
                : undefined
        }
        const bytes = Buffer.byteLength(JSON.stringify(detail))
        if (detailBytes + bytes > 36000) summary.omitted[key] = (summary.omitted[key] ?? 0) + 1
        else {
            detailBytes += bytes
            list.push(detail)
        }
    }
    return summary
}

export function isAccountCompletion(value: unknown): value is AccountCompletion {
    if (!value || typeof value !== 'object') return false
    const data = value as Record<string, unknown>
    const counts = data.counts as Record<string, unknown> | null
    const omitted = data.omitted as Record<string, unknown> | null
    if (
        !counts ||
        !omitted ||
        !['completed', 'incomplete', 'unavailable', 'notApplicable'].every(
            key => Number.isSafeInteger(counts[key]) && Number(counts[key]) >= 0
        )
    )
        return false
    if (data.accountReason !== null && typeof data.accountReason !== 'string') return false
    return ['completed', 'incomplete', 'unavailable', 'notApplicable'].every(key => {
        const list = data[key]

        if (key === 'completed' && list === undefined) return omitted[key] === undefined
        return (
            Number.isSafeInteger(omitted[key]) &&
            Number(omitted[key]) >= 0 &&
            Array.isArray(list) &&
            list.length <= (key === 'completed' ? 50 : 20) &&
            list.every(
                item =>
                    item &&
                    typeof item === 'object' &&
                    ['activity', 'label', 'reason', 'message'].every(field => typeof item[field] === 'string') &&
                    ['title', 'offerId', 'operationId', 'errorCode'].every(
                        field => item[field] === undefined || typeof item[field] === 'string'
                    ) &&
                    ['desktop', 'mobile', null].includes(item.platform) &&
                    ['balanceBefore', 'balanceAfter'].every(
                        field =>
                            item[field] == null ||
                            (typeof item[field] === 'number' && Number.isFinite(item[field]) && item[field] >= 0)
                    ) &&
                    ['confirmed', 'unconfirmed', 'skipped', 'failed'].includes(item.status) &&
                    ((item.pointsGained === undefined && item.pointsKnown === undefined) ||
                        (item.pointsKnown === false && item.pointsGained === null) ||
                        (item.pointsKnown === true &&
                            typeof item.pointsGained === 'number' &&
                            Number.isFinite(item.pointsGained) &&
                            item.pointsGained >= 0)) &&
                    item.category === (key === 'notApplicable' ? 'not-applicable' : key) &&
                    completionCategory(item) === item.category &&
                    (item.activation === undefined || isActivationOutcome(item.activation))
            ) &&
            Number(counts[key]) === list.length + Number(omitted[key])
        )
    })
}

export function isRunCompletion(value: unknown): value is RunCompletion {
    if (!value || typeof value !== 'object') return false
    const data = value as Record<string, unknown>
    const accounts = data.accounts as Record<string, unknown> | null
    const activities = data.activities as Record<string, unknown> | null
    return (
        typeof data.detailsKnown === 'boolean' &&
        !!accounts &&
        !!activities &&
        ['completed', 'partial', 'failed', 'skipped', 'cancelled', 'running'].every(
            key => Number.isSafeInteger(accounts[key]) && Number(accounts[key]) >= 0
        ) &&
        ['completed', 'incomplete', 'unavailable', 'notApplicable'].every(
            key => Number.isSafeInteger(activities[key]) && Number(activities[key]) >= 0
        )
    )
}

export function summarizeRunCompletion(
    accounts: readonly { status?: string | null; completion?: AccountCompletion | null }[]
): RunCompletion {
    const summary: RunCompletion = {
        accounts: { completed: 0, partial: 0, failed: 0, skipped: 0, cancelled: 0, running: 0 },
        activities: { completed: 0, incomplete: 0, unavailable: 0, notApplicable: 0 },
        detailsKnown: accounts.length > 0 && accounts.every(account => account.completion != null)
    }
    for (const account of accounts) {
        const status = account.status as keyof RunCompletion['accounts']
        summary.accounts[status in summary.accounts ? status : 'running']++
        if (account.completion)
            for (const key of Object.keys(summary.activities) as Array<keyof CompletionCounts>)
                summary.activities[key] += account.completion.counts[key]
    }
    return summary
}
