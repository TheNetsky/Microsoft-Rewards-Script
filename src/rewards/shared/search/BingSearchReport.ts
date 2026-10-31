export interface BingSearchReport {
    acknowledged: boolean
    ig: string | null
    balance: number | null
    previousBalance: number | null
    sessionBalanceDelta: number | null
    searchPointsEarned: number | null
    searchPointsLimit: number | null
}

export function parseBingSearchReport(data: unknown, acknowledged = false, ig: string | null = null): BingSearchReport {
    const report: BingSearchReport = {
        acknowledged,
        ig,
        balance: null,
        previousBalance: null,
        sessionBalanceDelta: null,
        searchPointsEarned: null,
        searchPointsLimit: null
    }
    const match = typeof data === 'string' ? data.match(/ModernRewards\.ReportActivity\((\{[\s\S]*?\})\)\s*;/) : null
    if (!match) return report

    try {
        const session = JSON.parse(match[1] ?? '{}').RewardsSessionData ?? {}
        const numberOrNull = (value: unknown): number | null =>
            typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
        report.balance = numberOrNull(session.Balance)
        report.previousBalance = numberOrNull(session.PreviousBalance)
        report.searchPointsEarned = numberOrNull(session.DailySearchPointsEarned)
        report.searchPointsLimit = numberOrNull(session.DailySearchPointsLimit)
        report.sessionBalanceDelta =
            report.balance !== null && report.previousBalance !== null ? report.balance - report.previousBalance : null
    } catch {
        // Ignore
    }
    return report
}
