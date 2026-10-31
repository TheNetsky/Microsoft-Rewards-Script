import ms, { type StringValue } from 'ms'
import type { Config } from '../config/Config'

export function browserTimeout(
    bot: { config?: Pick<Config, 'globalTimeout'> },
    kind: 'action' | 'navigation' | 'optional' = 'action'
): number {
    const value = bot.config?.globalTimeout ?? 30000
    let parsed: number | undefined
    try {
        parsed = typeof value === 'number' ? value : ms(value as StringValue)
    } catch {
        // Ignore
    }
    const timeout = parsed && Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 2147483647) : 30000
    if (kind === 'navigation') return Math.max(timeout, 45000)
    if (kind === 'optional') return Math.min(timeout, Math.max(5000, timeout / 6))
    return timeout
}
