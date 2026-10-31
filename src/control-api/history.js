import fs from 'node:fs'
import path from 'node:path'
import { writeJsonAtomic } from '../../scripts/lib/projectFiles.cjs'

export function loadRunHistory(file, limit, onWarning) {
    try {
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
        if (!Array.isArray(saved)) throw new Error('Expected an array of run summaries')
        const valid = saved.filter(
            item =>
                item &&
                typeof item === 'object' &&
                Array.isArray(item.run?.accounts) &&
                item.run.accounts.every(account => account && typeof account.email === 'string')
        )
        if (valid.length !== saved.length)
            onWarning('Some saved run summaries were invalid; showing the remaining history.')
        return valid.slice(0, limit)
    } catch (error) {
        if (error?.code !== 'ENOENT') onWarning('Could not read saved run history; new runs will still be tracked.')
        return []
    }
}

export function saveRunHistory(file, history) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    writeJsonAtomic(file, history, { backup: false })
}

export function toHistoryRecord(entry) {
    return {
        runId: entry.runId ?? entry.run?.runId ?? entry.exit?.runId ?? null,
        operation: entry.run?.operation ?? entry.exit?.operation ?? 'rewards',
        sessionGeneration: entry.run?.sessionGeneration ?? null,
        startedAt: entry.startedAt,
        endedAt: entry.endedAt,
        exit: entry.exit,
        version: entry.run?.version ?? null,
        status: entry.exit?.status ?? entry.run?.status ?? null,
        executionComplete: entry.exit?.executionComplete ?? entry.run?.executionComplete ?? null,
        collected: entry.run?.collected ?? null,
        pointsKnown: entry.run?.pointsKnown ?? false,
        completion: entry.run?.completion ?? null,
        accounts: (entry.run?.accounts ?? []).map(account => ({
            email: account.email,
            level: account.level ?? null,
            pointsProgress: account.pointsProgress ?? null,
            pointsRemaining: account.pointsRemaining ?? null,
            lifetimeEarn: account.lifetimeEarn ?? null,
            accountUpdatedAt: account.accountUpdatedAt ?? null,
            resetAt: account.resetAt ?? null,
            resetAtSource: account.resetAtSource ?? null,
            status: account.status ?? null,
            durationSeconds: account.durationSeconds ?? null,
            initialPoints: account.initialPoints ?? null,
            currentBalance: account.finalPoints ?? account.live?.balance ?? null,
            collected: account.pointsKnown === false ? null : (account.collectedPoints ?? account.live?.gained ?? null),
            pointsKnown: account.pointsKnown !== false,
            success: account.success,
            error: account.error,
            completion: account.completion ?? null,
            bySource: account.live?.bySource ?? null,
            unattributed: account.live?.unattributed ?? null,
            earnable: account.earnable ?? null,
            appQuotaState: account.appQuotaState ?? null,
            searchSummary: account.searchSummary ?? null,
            activities: account.activities ?? [],
            streaks: account.streaks ?? [],
            punchCards: account.punchCards ?? [],
            streakProtection: account.streakProtection ?? null,
            edgeBrowsing: account.edgeBrowsing ?? null
        }))
    }
}
