import type { BotContext } from '../core/BotContext'
import type { StreakState } from '../rewards/shared/parsers/RewardsPageParser'
import { isStreakCompleteToday, streakLabel, streakProgress } from '../rewards/shared/Streaks'

type StreakLogContext = Pick<BotContext, 'accountState' | 'isMobile' | 'logger'>

export function logStreakCompletions(bot: StreakLogContext, streaks: readonly StreakState[]): void {
    for (const streak of streaks) {
        if (!isStreakCompleteToday(streak)) continue
        const label = streakLabel(streak)
        const progress = streakProgress(streak)
        const period = streak.resetAt ?? new Date().toISOString().slice(0, 10)
        const key = `${label}:${period}:${progress ?? 'unknown'}`
        if (bot.accountState.loggedStreaks.has(key)) continue
        bot.accountState.loggedStreaks.add(key)
        bot.logger.success(
            bot.isMobile,
            'STREAKS',
            `${label} completed today${progress === null ? '' : ` | streak=${progress}`}`
        )
    }
}
