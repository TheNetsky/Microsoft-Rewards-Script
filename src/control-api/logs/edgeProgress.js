import { numericField, fractionField } from './fields.js'
import { ensureAccount, accountEmailForEntry, eventTime } from './state.js'

export function applyEdgeBrowsing(state, entry) {
    if (entry.title !== 'EDGE-BROWSING') return null

    const account = ensureAccount(state, accountEmailForEntry(state, entry))
    if (!account) return null

    const message = entry.message ?? ''
    const finalReports = message.startsWith('Finished background Edge browsing activity')
        ? numericField(message, 'reports')
        : null
    const progress =
        fractionField(message, 'reportsCompleted') ??
        fractionField(message, 'report') ??
        (finalReports != null ? { current: finalReports, total: finalReports } : null)
    const previous = account.edgeBrowsing ?? {
        status: 'pending',
        targetMinutes: null,
        serverIntervalMinutes: null,
        reportsCompleted: 0,
        reportsTotal: null,
        reportsRemaining: null,
        scheduledMinutesCovered: 0,
        nextReportInSeconds: null,
        estimatedRemainingMinutes: null,
        elapsedMinutes: null,
        accepted: 0,
        duplicates: 0,
        failed: 0,
        waitingForBackground: false,
        updatedAt: null
    }

    if (message.startsWith('Started background Edge browsing activity')) {
        previous.status = 'running'
        previous.targetMinutes = numericField(message, 'targetMinutes')
        previous.serverIntervalMinutes = numericField(message, 'serverIntervalMinutes')
        previous.reportsTotal = numericField(message, 'reports')
        previous.reportsRemaining = previous.reportsTotal
        previous.scheduledMinutesCovered = 0
        previous.estimatedRemainingMinutes = numericField(message, 'estimatedDurationMinutes')
        previous.waitingForBackground = false
    } else if (message.startsWith('Edge browsing progress')) {
        previous.status = 'running'
    } else if (message.startsWith('Submitted Edge browsing report')) {
        previous.status = 'running'
        previous.nextReportInSeconds = null
    } else if (message.startsWith('Finished background Edge browsing activity')) {
        const duplicates = numericField(message, 'duplicates') ?? previous.duplicates
        const failed = numericField(message, 'failed') ?? previous.failed
        const serverCompleteMatch = message.match(/(?:^| \| )serverComplete=(true|false)(?= \| |$)/)
        const serverComplete = serverCompleteMatch ? serverCompleteMatch[1] === 'true' : null

        if (serverComplete === true) previous.status = 'complete'
        else if (serverComplete === false) previous.status = 'partial'
        else previous.status = duplicates > 0 || failed > 0 ? 'partial' : 'complete'

        previous.reportsRemaining = serverComplete === false ? previous.reportsRemaining : 0
        previous.nextReportInSeconds = null
        previous.estimatedRemainingMinutes = 0
        previous.waitingForBackground = false
    } else if (message === 'Browsing Streak on Edge is already complete') {
        previous.status = 'complete'
        previous.reportsRemaining = 0
        previous.nextReportInSeconds = null
        previous.estimatedRemainingMinutes = 0
        previous.waitingForBackground = false
    } else if (
        message === 'Browsing Streak on Edge is not available for this account' ||
        message.startsWith('Skipping:')
    ) {
        previous.status = 'skipped'
        previous.waitingForBackground = false
    } else if (
        message.startsWith('Background Edge browsing activity failed') ||
        message.startsWith('Unexpected background task failure')
    ) {
        previous.status = 'failed'
        previous.waitingForBackground = false
    } else if (message === 'Background activity cancelled') {
        previous.status = 'cancelled'
        previous.waitingForBackground = false
    } else if (message.startsWith('Foreground activities finished;')) {
        previous.waitingForBackground = true
    } else {
        return null
    }

    if (progress?.current != null) previous.reportsCompleted = progress.current
    if (progress?.total != null) previous.reportsTotal = progress.total

    const reportsRemaining = numericField(message, 'reportsRemaining')
    const scheduledMinutes = fractionField(message, 'scheduledMinutesCovered')
    const nextReportInSeconds = numericField(message, 'nextReportInSeconds')
    const estimatedRemainingMinutes = numericField(message, 'estimatedRemainingMinutes')
    const elapsedMinutes = numericField(message, 'elapsedMinutes')
    const accepted = numericField(message, 'accepted')
    const duplicates = numericField(message, 'duplicates')
    const failed = numericField(message, 'failed')

    if (reportsRemaining != null) previous.reportsRemaining = reportsRemaining
    if (scheduledMinutes?.current != null) previous.scheduledMinutesCovered = scheduledMinutes.current
    if (nextReportInSeconds != null) previous.nextReportInSeconds = nextReportInSeconds
    if (estimatedRemainingMinutes != null) previous.estimatedRemainingMinutes = estimatedRemainingMinutes
    if (elapsedMinutes != null) previous.elapsedMinutes = elapsedMinutes
    if (accepted != null) previous.accepted = accepted
    if (duplicates != null) previous.duplicates = duplicates
    if (failed != null) previous.failed = failed

    previous.updatedAt = eventTime(entry)
    account.edgeBrowsing = previous
    return 'edge-browsing'
}
