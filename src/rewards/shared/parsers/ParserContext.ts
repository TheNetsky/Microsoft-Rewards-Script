import type { Logger } from '../../../logging/Logger'
import type { StreakState } from './RewardsPageParser'

export interface ParserContext {
    readonly logger: Pick<Logger, 'event' | 'warn' | 'debug' | 'error'>
    readonly isMobile: boolean
    readonly currentAccountEmail: string | null
    readonly userData?: { timezone: string }
    observeStreaks?(streaks: readonly StreakState[]): void
}
