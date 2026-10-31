/** @param {string | null} runId */
export function createRunState(runId = null) {
    return {
        runId,
        operation: 'rewards',
        sessionGeneration:
            /** @type {import('../../session/SessionGeneration.js').SessionGenerationProgress | null} */ (null),
        version: null,
        clusters: null,
        accountsTotal: /** @type {number | null} */ (null),
        currentEmail: null,
        userToEmail: Object.create(null), // Legacy username -> full account email.
        lastPointUpdateAt: null,
        totals: /** @type {null | { collected: number | null, pointsKnown: boolean, oldTotal: number, newTotal: number, runtimeMinutes: number, accountsProcessed: number }} */ (
            null
        ), // { collected, oldTotal, newTotal, runtimeMinutes, accountsProcessed }
        order: /** @type {string[]} */ ([]), // emails in the order they started
        accounts: Object.create(null), // email -> account summary
        finished: false,
        runEnded: false,
        executionComplete: false,
        executionError: /** @type {string | null} */ (null),
        pendingDelay: null // { seconds, nextEmail, sinceTs } while waiting between accounts/workers
    }
}

export function ensureAccount(state, email) {
    if (!email) return null
    if (!state.accounts[email]) {
        state.accounts[email] = {
            email,
            geoLocale: null,
            locale: null,
            cachedRegion: null,
            level: null,
            pointsProgress: null,
            pointsRemaining: null,
            lifetimeEarn: null,
            accountUpdatedAt: null,
            resetAt: null,
            resetAtSource: null,
            initialPoints: null,
            collectedPoints: null,
            pointsKnown: false,
            finalPoints: null,
            earnable: null, // { mobile, browser, app }; browser is the desktop search pool
            appQuotaState: null,
            searchSummary: null, // { mobile, desktop, bonus, total }
            streaks: [],
            punchCards: [],
            streakProtection: null, // { enabled, remainingDays, streakCounter, updatedAt }
            edgeBrowsing: null, // background Edge activity progress and ETA
            durationSeconds: null,
            success: null,
            error: null,
            live: {
                balance: null, // latest known available-points balance
                gained: 0, // points earned so far this run (per this account)
                bySource: Object.create(null), // keyed by activity source
                lastUpdateTs: null
            }
        }
        state.order.push(email)
    }
    return state.accounts[email]
}

export function eventTime(entry) {
    return entry.receivedAt ?? entry.ts ?? null
}

export function accountEmailForEntry(state, entry) {
    return (
        (entry.user?.includes('@') ? entry.user : entry.user && state.userToEmail[entry.user]) ||
        state.currentEmail ||
        null
    )
}

function accountCollected(a) {
    if (a.pointsKnown === false) return null
    if (typeof a.collectedPoints === 'number') return a.collectedPoints
    return a.live?.gained ?? 0
}

export function summarizeRunState(state) {
    const accounts = state.order.map(email => {
        const account = state.accounts[email]
        const { activityOutcomes, ...fields } = account
        const outcomes = activityOutcomes ? Object.values(activityOutcomes) : account.activities
        const pointTotals = new Map()
        for (const { taskKey, points } of Object.values(account.attribution ?? {}))
            if (taskKey) pointTotals.set(taskKey, (pointTotals.get(taskKey) ?? 0) + points)
        return {
            ...fields,
            completion:
                account.completion ??
                (outcomes?.length ? summarizeCompletion(outcomes, account.error ?? null, pointTotals) : null)
        }
    })
    const pointsKnown =
        state.totals?.pointsKnown ??
        (accounts.length > 0 &&
            accounts.every(account => account.pointsKnown !== false) &&
            (!state.finished || state.accountsTotal === null || accounts.length >= state.accountsTotal))
    const collected = pointsKnown
        ? (state.totals?.collected ?? accounts.reduce((sum, a) => sum + (accountCollected(a) ?? 0), 0))
        : null

    const current = state.currentEmail ? state.accounts[state.currentEmail] : null
    return {
        runId: state.runId ?? null,
        operation: state.operation,
        sessionGeneration: state.sessionGeneration,
        completion: summarizeRunCompletion(accounts),
        version: state.version,
        clusters: state.clusters,
        accountsTotal: state.accountsTotal,
        accountsSeen: accounts.length,
        collected,
        pointsKnown,
        totals: state.totals,
        finished: state.finished,
        executionComplete: state.executionComplete,
        status:
            state.terminalStatus ??
            (state.finished
                ? accounts.some(account => account.success === false)
                    ? 'partial'
                    : 'completed'
                : 'running'),
        pendingDelay: state.pendingDelay,
        live: {
            currentAccount: state.currentEmail,
            currentBalance: current?.live?.balance ?? null,
            gained: collected,
            updatedAt: state.lastPointUpdateAt
        },
        accounts
    }
}
import { summarizeCompletion, summarizeRunCompletion } from '../../rewards/shared/ActivityCompletion.js'
