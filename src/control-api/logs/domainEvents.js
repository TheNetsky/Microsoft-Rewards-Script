/** @typedef {import('../../logging/LogEvent.js').DomainEvent} DomainEvent */
import { completionCategory, isAccountCompletion, isRunCompletion } from '../../rewards/shared/ActivityCompletion.js'
import { isActivationOutcome } from '../../rewards/shared/ActivationOutcome.js'
import { activityKey, activityPointKey } from '../../rewards/shared/ActivityCompletion.js'
import { activityReason } from '../../logging/LogMessage.js'

/** @param {unknown} value @returns {value is DomainEvent} */
export function isDomainEvent(value) {
    if (!value || typeof value !== 'object') return false
    const data = /** @type {Record<string, unknown>} */ (value)
    if (data.pointsKnown !== undefined && typeof data.pointsKnown !== 'boolean') return false
    const nonNegative = key => typeof data[key] === 'number' && Number.isFinite(data[key]) && data[key] >= 0
    const numbers = (...keys) => keys.every(key => typeof data[key] === 'number' && Number.isFinite(data[key]))
    const optionalDate = value => value == null || (typeof value === 'string' && Number.isFinite(Date.parse(value)))
    switch (data.kind) {
        case 'punchcard':
            return (
                typeof data.offerId === 'string' &&
                data.offerId.trim().length > 0 &&
                typeof data.title === 'string' &&
                typeof data.complete === 'boolean' &&
                typeof data.pointsKnown === 'boolean' &&
                ['completedSteps', 'totalSteps', 'lockedSteps'].every(
                    key => data[key] === null || (Number.isSafeInteger(data[key]) && Number(data[key]) >= 0)
                ) &&
                ['pointsGained', 'pointsAvailable'].every(key => data[key] === null || nonNegative(key)) &&
                data.pointsKnown === (data.pointsGained !== null) &&
                (data.completedSteps === null ||
                    data.totalSteps === null ||
                    Number(data.completedSteps) <= Number(data.totalSteps))
            )
        case 'session':
            return (
                typeof data.email === 'string' &&
                data.email.includes('@') &&
                ['desktop', 'mobile'].includes(String(data.platform)) &&
                ['running', 'completed', 'failed', 'cancelled'].includes(String(data.status)) &&
                (data.reason === undefined || typeof data.reason === 'string')
            )
        case 'activity':
            return (
                typeof data.activity === 'string' &&
                (data.title === undefined || typeof data.title === 'string') &&
                typeof data.reason === 'string' &&
                (data.offerId === undefined || typeof data.offerId === 'string') &&
                (data.operationId === undefined || typeof data.operationId === 'string') &&
                (data.message === undefined || typeof data.message === 'string') &&
                (data.errorCode === undefined || typeof data.errorCode === 'string') &&
                (data.category === undefined ||
                    ['completed', 'incomplete', 'unavailable', 'not-applicable'].includes(String(data.category))) &&
                (data.activation === undefined || isActivationOutcome(data.activation)) &&
                ['balanceBefore', 'balanceAfter'].every(key => data[key] == null || nonNegative(key)) &&
                (data.pointsKnown === undefined || typeof data.pointsKnown === 'boolean') &&
                ['confirmed', 'unconfirmed', 'skipped', 'failed'].includes(String(data.status)) &&
                numbers('pointsGained') &&
                nonNegative('pointsGained')
            )
        case 'account':
            return (
                ['completed', 'partial', 'skipped', 'failed', 'cancelled'].includes(String(data.status)) &&
                (data.email === undefined || (typeof data.email === 'string' && data.email.includes('@'))) &&
                (data.reason === undefined || typeof data.reason === 'string') &&
                (data.completion === undefined || isAccountCompletion(data.completion)) &&
                numbers('initialPoints', 'currentBalance', 'pointsGained', 'durationSeconds') &&
                nonNegative('initialPoints') &&
                nonNegative('currentBalance') &&
                nonNegative('durationSeconds')
            )
        case 'quota':
            return (
                ['mobile', 'browser', 'app'].some(key => key in data) &&
                ['mobile', 'browser', 'app'].every(
                    key =>
                        data[key] === undefined ||
                        data[key] === null ||
                        (typeof data[key] === 'number' && Number.isFinite(data[key]) && data[key] >= 0)
                ) &&
                (data.locale === undefined || typeof data.locale === 'string') &&
                (data.appState === undefined ||
                    ['pending', 'available', 'unavailable', 'disabled'].includes(String(data.appState)))
            )
        case 'balance':
            return (
                numbers('initialPoints', 'currentBalance') &&
                nonNegative('initialPoints') &&
                nonNegative('currentBalance')
            )
        case 'account-info': {
            const protection = /** @type {Record<string, unknown> | null | undefined} */ (data.streakProtection)
            return (
                (data.streaks === undefined ||
                    (Array.isArray(data.streaks) &&
                        data.streaks.every(
                            streak =>
                                streak &&
                                typeof streak === 'object' &&
                                typeof streak.partner === 'string' &&
                                typeof streak.label === 'string' &&
                                typeof streak.completedToday === 'boolean' &&
                                ['completedDays', 'totalDays', 'activitiesCompleted', 'activitiesTotal'].every(
                                    key => Number.isSafeInteger(streak[key]) && streak[key] >= 0
                                ) &&
                                (streak.currentDay === undefined ||
                                    (Number.isSafeInteger(streak.currentDay) && streak.currentDay >= 0)) &&
                                (streak.isEnabled === undefined || typeof streak.isEnabled === 'boolean') &&
                                (streak.dailyPoints === undefined ||
                                    (Array.isArray(streak.dailyPoints) &&
                                        streak.dailyPoints.every(
                                            points => Number.isSafeInteger(points) && points >= 0
                                        ))) &&
                                (streak.resetAt === null ||
                                    (typeof streak.resetAt === 'string' && Number.isFinite(Date.parse(streak.resetAt))))
                        ))) &&
                optionalDate(data.resetAt) &&
                (data.resetAtSource == null || ['service', 'estimated'].includes(String(data.resetAtSource))) &&
                (data.level === null || (Number.isSafeInteger(data.level) && Number(data.level) > 0)) &&
                ['pointsProgress', 'pointsRemaining', 'lifetimeEarn', 'availablePoints'].every(
                    key => data[key] === null || nonNegative(key)
                ) &&
                (protection == null ||
                    (typeof protection === 'object' &&
                        !Array.isArray(protection) &&
                        typeof protection.isProtectionOn === 'boolean' &&
                        ['remainingDays', 'streakCounter'].every(
                            key =>
                                protection[key] === null ||
                                (typeof protection[key] === 'number' &&
                                    Number.isFinite(protection[key]) &&
                                    protection[key] >= 0)
                        )))
            )
        }
        case 'run':
            return (
                ['completed', 'partial', 'interrupted'].includes(String(data.status)) &&
                numbers('initialPoints', 'currentBalance', 'pointsGained', 'accountsProcessed', 'runtimeMinutes') &&
                nonNegative('initialPoints') &&
                nonNegative('currentBalance') &&
                nonNegative('runtimeMinutes') &&
                Number.isSafeInteger(data.accountsProcessed) &&
                (data.completion === undefined || isRunCompletion(data.completion)) &&
                nonNegative('accountsProcessed')
            )
        default:
            return false
    }
}

export function applyDomainEvent(state, entry, account) {
    const data = entry.data
    if (!isDomainEvent(data)) return null
    const at = entry.receivedAt ?? entry.ts
    if (data.kind === 'session') {
        const step = state.sessionGeneration?.steps.find(
            step => step.email === data.email && step.platform === data.platform
        )
        if (!step || !['pending', 'running'].includes(step.status)) return null
        step.status = data.status
        step.startedAt ??= at
        if (data.status === 'running') state.currentEmail = data.email
        else {
            step.endedAt = at
            step.error = data.reason ?? null
        }
        return 'session-generation'
    }
    if (data.kind === 'run') {
        state.totals = {
            accountsProcessed: data.accountsProcessed,
            collected: data.pointsKnown === false ? null : data.pointsGained,
            pointsKnown: data.pointsKnown !== false,
            oldTotal: data.initialPoints,
            newTotal: data.currentBalance,
            runtimeMinutes: data.runtimeMinutes
        }
        state.finished = true
        state.runEnded = true
        state.terminalStatus = data.status
        state.pendingDelay = null
        return 'run-end'
    }
    if (!account) return null
    if (data.kind === 'punchcard') {
        const cards = new Map((account.punchCards ?? []).map(card => [card.offerId, card]))
        const previous = cards.get(data.offerId)
        const totalSteps = data.totalSteps ?? previous?.totalSteps ?? null
        const completed = data.completedSteps ?? previous?.completedSteps ?? null
        const completedSteps =
            completed !== null && previous?.completedSteps != null
                ? Math.max(completed, previous.completedSteps)
                : completed
        const complete =
            data.complete ||
            previous?.complete === true ||
            (totalSteps !== null && totalSteps > 0 && completedSteps !== null && completedSteps >= totalSteps)
        const pointsGained =
            data.pointsGained !== null && previous?.pointsGained != null
                ? Math.max(data.pointsGained, previous.pointsGained)
                : (data.pointsGained ?? previous?.pointsGained ?? null)
        const locked = data.lockedSteps ?? previous?.lockedSteps ?? null
        cards.set(data.offerId, {
            offerId: data.offerId,
            title: data.title && data.title !== data.offerId ? data.title : (previous?.title ?? data.title),
            completedSteps:
                complete && totalSteps !== null
                    ? totalSteps
                    : completedSteps !== null && totalSteps !== null
                      ? Math.min(completedSteps, totalSteps)
                      : completedSteps,
            totalSteps,
            lockedSteps: complete
                ? 0
                : locked !== null && totalSteps !== null && completedSteps !== null
                  ? Math.min(locked, Math.max(0, totalSteps - completedSteps))
                  : locked,
            pointsGained,
            pointsAvailable: data.pointsAvailable ?? previous?.pointsAvailable ?? null,
            pointsKnown: pointsGained !== null,
            complete
        })
        account.punchCards = [...cards.values()]
        return 'punchcard'
    }
    if (data.kind === 'account-info') {
        let observed = false
        if (data.resetAt != null) {
            account.resetAt = data.resetAt
            account.resetAtSource = data.resetAtSource ?? null
            observed = true
        }
        for (const key of ['level', 'pointsProgress', 'pointsRemaining', 'lifetimeEarn']) {
            if (data[key] === null) continue
            account[key] = data[key]
            observed = true
        }
        if (data.streaks?.length) {
            const streaks = new Map((account.streaks ?? []).map(streak => [streak.partner, streak]))
            for (const streak of data.streaks) streaks.set(streak.partner, { ...streak, updatedAt: at })
            account.streaks = [...streaks.values()]
            observed = true
        }
        if (data.streakProtection) {
            const previous = account.streakProtection
            account.streakProtection = {
                enabled: data.streakProtection.isProtectionOn,
                remainingDays: data.streakProtection.remainingDays ?? previous?.remainingDays ?? null,
                streakCounter: data.streakProtection.streakCounter ?? previous?.streakCounter ?? null,
                updatedAt: at
            }
            observed = true
        }
        if (!observed) return null
        account.accountUpdatedAt = at
        return 'account-info'
    }
    if (data.kind === 'quota') {
        account.earnable ??= { mobile: null, browser: null, app: null }
        for (const key of ['mobile', 'browser', 'app']) if (data[key] !== undefined) account.earnable[key] = data[key]
        if (data.appState !== undefined) account.appQuotaState = data.appState
        if (data.locale !== undefined) account.locale = data.locale
        return 'quota'
    }
    if (data.kind === 'activity') {
        account.activities ??= []
        const activity = {
            ...data,
            balanceBefore: data.balanceBefore ?? null,
            balanceAfter: data.balanceAfter ?? null,
            category: completionCategory(data),
            ts: entry.ts,
            platform: entry.platform,
            summary: entry.message,
            message: data.message ?? activityReason(data)
        }
        const existing = data.operationId
            ? account.activities.findIndex(item => item.operationId === data.operationId)
            : -1
        if (existing >= 0) account.activities[existing] = activity
        else account.activities.push(activity)
        account.activities = account.activities.slice(-200)
        account.activityOutcomes ??= Object.create(null)
        const taskKey = activityKey(data.activity, data, entry.platform)
        account.activityOutcomes[taskKey] = {
            ...activity,
            title: activity.title ?? account.activityOutcomes[taskKey]?.title
        }
        account.attribution ??= Object.create(null)
        if (data.pointsKnown !== false && data.pointsGained > 0) {
            const key = activityPointKey(activity)
            const previous = account.attribution[key]?.points ?? 0
            account.attribution[key] = {
                activity: data.activity,
                taskKey,
                points: Math.max(previous, data.pointsGained)
            }
        }
        account.live.bySource = Object.create(null)
        for (const { activity, points } of Object.values(account.attribution))
            account.live.bySource[activity] = (account.live.bySource[activity] ?? 0) + points
        const attributed = Object.values(account.live.bySource).reduce((sum, points) => sum + points, 0)
        account.live.unattributed = Math.max(0, account.live.gained - attributed)
        if (data.pointsKnown !== false) {
            account.live.lastUpdateTs = at
            state.lastPointUpdateAt = at
        }
        return 'activity-result'
    }
    if (data.kind === 'balance' || data.pointsKnown !== false) {
        if (!account.endedAt) account.pointsKnown = true
        account.initialPoints = data.initialPoints
        account.live.balance = data.currentBalance
        account.live.gained = data.currentBalance - data.initialPoints
        account.live.lastUpdateTs = at
        state.lastPointUpdateAt = at
        const attributed = Object.values(account.live.bySource).reduce((sum, points) => sum + points, 0)
        account.live.unattributed = Math.max(0, account.live.gained - attributed)
    }
    if (data.kind === 'account') {
        account.endedAt = at
        account.pointsKnown = data.pointsKnown !== false
        account.finalPoints = data.pointsKnown === false ? null : data.currentBalance
        account.collectedPoints = data.pointsKnown === false ? null : data.pointsGained
        account.durationSeconds = data.durationSeconds
        account.status = data.status
        account.success = data.status === 'completed'
        account.error = data.reason ?? null
        account.completion = data.completion ?? null
        return data.status === 'skipped' ? 'account-skip' : 'account-end'
    }
    return 'points'
}
