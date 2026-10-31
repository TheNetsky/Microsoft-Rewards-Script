import type { HttpRequestConfig } from '../network/HttpClient'
import type { LogLevel } from './Logger'
import { createNotificationQueue, enqueueNotification, flushQueue } from './Queue'
import { resolveLogColor, resolveLogAccent, type LogColor } from './LogStyle'

const DISCORD_LIMIT = 2000

const discordQueue = createNotificationQueue()

function truncate(text: string) {
    return text.length <= DISCORD_LIMIT ? text : text.slice(0, DISCORD_LIMIT - 14) + ' …(truncated)'
}

export async function sendDiscord(
    discordUrl: string,
    content: string,
    level: LogLevel,
    color?: LogColor
): Promise<void> {
    if (!discordUrl) return

    const request: HttpRequestConfig = {
        method: 'POST',
        url: discordUrl,
        headers: { 'Content-Type': 'application/json' },
        data: {
            embeds: [
                { description: truncate(content), color: resolveLogAccent(resolveLogColor(level, undefined, color)) }
            ],
            allowed_mentions: { parse: [] }
        },
        timeout: 10000
    }

    await enqueueNotification(discordQueue, 'Discord', content, level, request)
}

export function flushDiscordQueue(timeoutMs = 5000): Promise<void> {
    return flushQueue(discordQueue, timeoutMs)
}
