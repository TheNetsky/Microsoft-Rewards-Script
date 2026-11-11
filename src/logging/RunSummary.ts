import type { BotContext } from '../core/BotContext'
import type { AccountStats } from '../core/RunTypes'
import type { Logger } from './Logger'
import { activityKey, summarizeCompletion, summarizeRunCompletion } from '../rewards/shared/ActivityCompletion'
import { sanitizeLogMessage } from './LogMessage'
import { sendFeishuSummary } from './Feishu'

type SummaryContext = Pick<BotContext, 'logger' | 'userData' | 'activityResults' | 'accountIssues' | 'config'>

export function logRunResult(
    logger: Pick<Logger, 'event'>,
    expectedAccounts: number,
    stats: AccountStats[],
    runStartTime: number,
    interrupted = false
): void {
    const completion = summarizeRunCompletion(stats)
    const pointsKnown = stats.length === expectedAccounts && stats.every(stat => stat.pointsKnown !== false)
    const pointsGained = stats.reduce((sum, stat) => sum + stat.collectedPoints, 0)
    const initialPoints = stats.reduce((sum, stat) => sum + stat.initialPoints, 0)
    const currentBalance = stats.reduce((sum, stat) => sum + stat.finalPoints, 0)
    const runtimeMinutes = Number(((Date.now() - runStartTime) / 60000).toFixed(1))
    const status =
        interrupted || stats.length !== expectedAccounts
            ? 'interrupted'
            : stats.some(stat => !stat.success)
              ? 'partial'
              : 'completed'
    logger.event(
        'main',
        'RUN-END',
        `${status === 'interrupted' ? 'Run interrupted' : 'Completed all accounts'} | accountsProcessed=${stats.length} | pointsGained=${pointsKnown ? pointsGained : 'unknown'}` +
            ` | previousBalance=${initialPoints} | currentBalance=${currentBalance} | runtimeMinutes=${runtimeMinutes} | status=${status}`,
        {
            kind: 'run',
            status,
            accountsProcessed: stats.length,
            pointsGained,
            pointsKnown,
            initialPoints,
            currentBalance,
            runtimeMinutes,
            completion
        }
    )
}

export function logAccountResult(context: SummaryContext, stats: AccountStats): void {
    const status = stats.status ?? (stats.success ? 'completed' : 'partial')
    const pointsKnown = stats.pointsKnown !== false
    if (!stats.completion) {
        const results = context.userData.userName === stats.email ? context.activityResults : []
        const keys = new Set(results.map(result => activityKey(result.activity, result, result.platform)))
        const otherIssues =
            context.userData.userName === stats.email
                ? [...context.accountIssues].filter(([key]) => !keys.has(key)).map(([, reason]) => reason)
                : []
        const accountReason =
            status === 'failed' || status === 'cancelled' || status === 'skipped' ? stats.error : otherIssues.join('; ')
        stats.completion = summarizeCompletion(results, accountReason || null)
    }
    const counts = stats.completion.counts
    const reason = stats.error ? sanitizeLogMessage(stats.error).slice(0, 2000) : undefined
    context.logger.event(
        'main',
        status === 'skipped' ? 'ACCOUNT-SKIP' : 'ACCOUNT-END',
        `Finished account: ${stats.email} | pointsGained=${pointsKnown ? stats.collectedPoints : 'unknown'}` +
            ` | previousBalance=${stats.initialPoints} | currentBalance=${stats.finalPoints}` +
            ` | durationSeconds=${stats.duration} | status=${status}` +
            (reason ? ` | reason=${JSON.stringify(reason)}` : '') +
            ` | activities: ${counts.completed} completed, ${counts.incomplete} incomplete, ${counts.unavailable} unavailable, ${counts.notApplicable} not applicable`,
        {
            kind: 'account',
            email: stats.email,
            status,
            initialPoints: stats.initialPoints,
            currentBalance: stats.finalPoints,
            pointsGained: stats.collectedPoints,
            pointsKnown,
            durationSeconds: stats.duration,
            reason,
            completion: stats.completion
        }
    )
    sendFeishuSummary(context.config.webhook.feishu, stats)
}
