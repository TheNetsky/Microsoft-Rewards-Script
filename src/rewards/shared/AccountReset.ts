import type { StreakState } from './parsers/RewardsPageParser'

/** Prefer a service deadline. Local midnight is an explicitly estimated fallback. */
export function accountReset(
    streaks: readonly Pick<StreakState, 'resetAt'>[],
    timezone: string | undefined,
    now = Date.now()
): { resetAt: string | null; resetAtSource: 'service' | 'estimated' | null } {
    const deadlines = streaks
        .map(streak => Date.parse(streak.resetAt ?? ''))
        .filter(time => Number.isFinite(time) && time > now)
    if (deadlines.length) return { resetAt: new Date(Math.min(...deadlines)).toISOString(), resetAtSource: 'service' }
    if (!timezone) return { resetAt: null, resetAtSource: null }
    try {
        const date = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        })
        const today = date.format(now)
        let low = now
        let high = now + 48 * 60 * 60 * 1000
        while (high - low > 1) {
            const middle = Math.floor((low + high) / 2)
            if (date.format(middle) === today) low = middle
            else high = middle
        }
        return { resetAt: new Date(high).toISOString(), resetAtSource: 'estimated' }
    } catch {
        return { resetAt: null, resetAtSource: null }
    }
}
