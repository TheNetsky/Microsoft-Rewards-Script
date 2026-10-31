import type { ActivityResult } from '../rewards/types/ActivityResult'
import { sanitizeLogMessage, sanitizeLogData } from './LogMessage'
import type { CompletionCategory, AccountCompletion, RunCompletion } from '../rewards/shared/ActivityCompletion'
import { resolveLogColor, type LogColor } from './LogStyle'
import { formatLogLine, writeConsoleLog } from '../../scripts/lib/logging.cjs'
import type { SessionPlatform, SessionStatus } from '../session/SessionGeneration'
import type { AccountInfo } from '../rewards/types/RewardsState'
import type { StreakProtectionState } from '../rewards/shared/parsers/RewardsPageParser'
import type { PunchCardProgress } from '../rewards/shared/PunchCardProgress'

export interface StreakInfo {
    partner: string
    label: string
    completedToday: boolean
    completedDays: number
    currentDay: number
    totalDays: number
    isEnabled: boolean
    dailyPoints: number[]
    activitiesCompleted: number
    activitiesTotal: number
    resetAt: string | null
}

export type DomainEvent =
    | ({ kind: 'activity'; activity: string; category?: CompletionCategory } & ActivityResult)
    | ({ kind: 'punchcard' } & PunchCardProgress)
    | {
          kind: 'session'
          email: string
          platform: SessionPlatform
          status: Exclude<SessionStatus, 'pending'>
          reason?: string
      }
    | {
          kind: 'account'
          email?: string
          status: 'completed' | 'partial' | 'skipped' | 'failed' | 'cancelled'
          initialPoints: number
          currentBalance: number
          pointsGained: number
          pointsKnown?: boolean
          durationSeconds: number
          reason?: string
          completion?: AccountCompletion
      }
    | { kind: 'balance'; currentBalance: number; initialPoints: number }
    | ({
          kind: 'account-info'
          streakProtection?: StreakProtectionState | null
          streaks?: StreakInfo[]
          resetAt?: string | null
          resetAtSource?: 'service' | 'estimated' | null
      } & AccountInfo)
    | {
          kind: 'quota'
          mobile?: number | null
          browser?: number | null
          app?: number | null
          appState?: 'pending' | 'available' | 'unavailable' | 'disabled'
          locale?: string
      }
    | {
          kind: 'run'
          status: 'completed' | 'partial' | 'interrupted'
          accountsProcessed: number
          pointsGained: number
          pointsKnown?: boolean
          initialPoints: number
          currentBalance: number
          runtimeMinutes: number
          completion?: RunCompletion
      }

export interface LogEvent {
    ts: string
    user: string
    platform: 'MAIN' | 'MOBILE' | 'DESKTOP'
    level: 'debug' | 'info' | 'warn' | 'error'
    title: string
    message: string
    consoleAllowed?: boolean
    color?: LogColor
    data?: DomainEvent
}

export function emitControlEvent(event: LogEvent): boolean {
    if (process.env.REWARDS_CONTROL_EVENTS !== '1') return false
    const data = event.data ? sanitizeLogData(event.data) : undefined
    console.log(
        '__REWARDS_EVENT__ ' +
            JSON.stringify({
                version: 2,
                runId: process.env.REWARDS_RUN_ID,
                ...event,
                message: sanitizeLogMessage(event.message),
                data
            })
    )
    return true
}

export function logSystemMessage(level: LogEvent['level'], title: string, message: string): void {
    const event: LogEvent = {
        ts: new Date().toISOString(),
        user: 'MAIN',
        platform: 'MAIN',
        level,
        color: resolveLogColor(level),
        title,
        message: sanitizeLogMessage(message)
    }
    if (!emitControlEvent(event)) writeConsoleLog(level, formatLogLine(event))
}

export function logConfigWarning(message: string): void {
    logSystemMessage('warn', 'CONFIG', message)
}
