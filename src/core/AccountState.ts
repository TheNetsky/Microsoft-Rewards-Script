import type { Config } from '../config/Config'
import type { ActivityResult } from '../rewards/types/ActivityResult'
import type { RewardsState } from '../rewards/types/RewardsState'
import { activityLabel, activityReason } from '../logging/LogMessage'
import { activityKey } from '../rewards/shared/ActivityCompletion'

export class AccountDeferredError extends Error {
    constructor(readonly reason: string) {
        super(reason)
        this.name = 'AccountDeferredError'
    }
}

export type WarningStatus = 'clear' | 'restricted' | 'unknown'

export class AccountState {
    readonly results: Array<ActivityResult & { activity: string; platform: 'mobile' | 'desktop' }> = []
    readonly issues = new Map<string, string>()
    readonly taskReadyAt = new Map<'mobile' | 'desktop', number>()
    readonly searchOnBingAttempts = new Map<string, Set<string>>()
    readonly loggedStreaks = new Set<string>()
    private controller = new AbortController()
    initialBalance: number | null = null
    dailyCheckIn: Promise<ActivityResult> | null = null
    backgroundRewardsActive = false
    warningStatus: WarningStatus = 'unknown'

    get signal(): AbortSignal {
        return this.controller.signal
    }

    reset(): void {
        this.results.length = 0
        this.issues.clear()
        this.taskReadyAt.clear()
        this.searchOnBingAttempts.clear()
        this.loggedStreaks.clear()
        this.controller = new AbortController()
        this.warningStatus = 'unknown'
        this.initialBalance = null
        this.dailyCheckIn = null
        this.backgroundRewardsActive = false
    }

    record(activity: string, result: ActivityResult, isMobile: boolean): boolean {
        const platform = isMobile ? 'mobile' : 'desktop'
        if (activity.endsWith('-data') || activity.endsWith('-quota')) {
            const previous = [...this.results]
                .reverse()
                .find(item => item.activity === activity && item.platform === platform)
            if (previous?.status === result.status && previous.reason === result.reason) return false
        }
        this.results.push({ activity, platform, ...result })
        const key = activityKey(activity, result, platform)
        if (result.status === 'failed' || result.status === 'unconfirmed')
            this.issues.set(
                key,
                `${activityLabel(activity)}${result.title ? ` (${result.title})` : ''}: ${activityReason(result)}`
            )
        else this.issues.delete(key)
        return true
    }

    observe(data: RewardsState, config: Pick<Config, 'continueOnBotWarning'>): void {
        this.initialBalance ??= data.dashboard.userStatus.availablePoints
        const warnings = data.dashboard.userWarnings
        this.warningStatus = warnings.some(warning => warning.name === 'Fraud_UserWarning_BotScore_UX')
            ? 'restricted'
            : data.sourceInfo.missingSections.includes('userWarnings')
              ? 'unknown'
              : 'clear'
        if (this.warningStatus === 'restricted' && !config.continueOnBotWarning)
            this.defer('Microsoft bot-score warning detected')
    }

    defer(reason: string): void {
        this.issues.set(reason, reason)
        this.controller.abort(new AccountDeferredError(reason))
    }
}
