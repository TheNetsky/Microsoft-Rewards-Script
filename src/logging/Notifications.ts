import type { ConfigWebhook } from '../config/Config'
import type { LogLevel } from './Logger'
import { sendDiscord, flushDiscordQueue } from './Discord'
import { sendNtfy, flushNtfyQueue } from './Ntfy'
import { sendTelegram, flushTelegramQueue } from './Telegram'
import { logSystemMessage } from './LogEvent'
import type { LogColor } from './LogStyle'
import { flushFeishuQueue } from './Feishu'

export async function sendNotifications(
    config: ConfigWebhook,
    content: string,
    level: LogLevel,
    color?: LogColor
): Promise<void> {
    const requests: Promise<void>[] = []
    if (config.discord?.enabled && config.discord.url)
        requests.push(sendDiscord(config.discord.url, content, level, color))
    if (config.ntfy?.enabled && config.ntfy.url) requests.push(sendNtfy(config.ntfy, content, level))
    if (config.telegram?.enabled && config.telegram.botToken && config.telegram.chatId)
        requests.push(sendTelegram(config.telegram, content, level))
    for (const result of await Promise.allSettled(requests))
        if (result.status === 'rejected') logSystemMessage('warn', 'NOTIFICATIONS', 'Could not queue notification.')
}

export async function flushNotifications(timeoutMs: number): Promise<void> {
    await Promise.allSettled([
        flushDiscordQueue(timeoutMs),
        flushNtfyQueue(timeoutMs),
        flushTelegramQueue(timeoutMs),
        flushFeishuQueue(timeoutMs)
    ])
}
