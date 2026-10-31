import type { BotContext } from '../../core/BotContext'
import type { StreakState } from './parsers/RewardsPageParser'

type StreakKind = 'bing-search' | 'bing-app' | 'daily-set' | 'edge-browsing' | 'visual-search'
type StreakContext = Pick<BotContext, 'rewards' | 'signal' | 'logger' | 'isMobile'>

const LABELS: Record<StreakKind, string> = {
    'bing-search': 'Bing Search Streak',
    'bing-app': 'Bing App Streak',
    'daily-set': 'Daily Set Streak',
    'edge-browsing': 'Edge Browsing Streak',
    'visual-search': 'Visual Search Streak'
}

function matchesPartner(partner: string, kind: StreakKind): boolean {
    const normalized = partner.replace(/[^a-z]/gi, '').toLowerCase()
    if (kind === 'bing-search') {
        if (/visual|image|edge/.test(normalized)) return false
        return (
            ['bing', 'search', 'searchstreak', 'microsoftbing'].includes(normalized) ||
            (normalized.includes('bing') && normalized.includes('search'))
        )
    }
    if (kind === 'bing-app')
        return (
            ['app', 'appstreak', 'bingapp', 'bingappstreak', 'sapphire', 'sapphirestreak'].includes(normalized) ||
            /^(?:bingapp|app|sapphire)?(?:daily)?checkin(?:streak)?$/.test(normalized)
        )
    if (kind === 'daily-set')
        return (
            ['rewards', 'bingrewards', 'msrewards', 'microsoftrewards'].includes(normalized) ||
            normalized.includes('dailyset')
        )
    if (kind === 'edge-browsing') return normalized === 'edge' || normalized.includes('edgebrows')
    return normalized.includes('visualsearch')
}

export function streakLabel(streak: StreakState): string {
    const kind = (Object.keys(LABELS) as StreakKind[]).find(kind => matchesPartner(streak.partner, kind))
    if (kind) return LABELS[kind]
    const label = streak.partner
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .trim()
    return /streak$/i.test(label) ? label : `${label || 'Rewards'} Streak`
}

export function streakProgress(streak: StreakState | undefined): string | null {
    if (!streak) return null
    return Number.isSafeInteger(streak.completedDays) &&
        Number.isSafeInteger(streak.totalDays) &&
        streak.completedDays >= 0 &&
        streak.totalDays > 0 &&
        streak.completedDays <= streak.totalDays
        ? `${streak.completedDays}/${streak.totalDays}`
        : null
}

function isCurrentPeriod(streak: StreakState): boolean {
    if (!streak.resetAt) return true
    const resetAt = Date.parse(streak.resetAt)
    return Number.isFinite(resetAt) && resetAt > Date.now()
}

export function isStreakCompleteToday(streak: StreakState | undefined): boolean {
    return Boolean(
        streak &&
        isCurrentPeriod(streak) &&
        (streak.isCurrentDayCompleted ||
            (streak.activitiesTotal > 0 && streak.activitiesCompleted >= streak.activitiesTotal))
    )
}

export async function readStreak(
    bot: StreakContext,
    kind: StreakKind,
    logTitle: string
): Promise<StreakState | undefined> {
    const label = LABELS[kind]
    try {
        bot.signal.throwIfAborted()
        const snapshot = await bot.rewards.refreshEarnSnapshot()
        bot.signal.throwIfAborted()
        const candidates = snapshot?.streaks.filter(streak => matchesPartner(streak.partner, kind)) ?? []
        const streak = candidates.find(isCurrentPeriod)
        if (!streak) {
            bot.logger.debug(
                bot.isMobile,
                logTitle,
                candidates.length
                    ? `Ignoring expired ${label} state | resetAt=${candidates.map(item => item.resetAt).join(',')}`
                    : `${label} unavailable in fresh snapshot | partners=${snapshot?.streaks.map(item => item.partner).join(',') || 'none'}`
            )
            return undefined
        }
        bot.logger.debug(
            bot.isMobile,
            logTitle,
            `${label} state | partner=${streak.partner} | dayCompleted=${streak.isCurrentDayCompleted}` +
                ` | activities=${streak.activitiesCompleted}/${streak.activitiesTotal}` +
                ` | days=${streak.completedDays}/${streak.totalDays} | resetAt=${streak.resetAt ?? 'unknown'}`
        )
        return streak
    } catch (error) {
        bot.signal.throwIfAborted()
        bot.logger.debug(bot.isMobile, logTitle, `${label} data unavailable | ${String(error)}`)
        return undefined
    }
}
