import type { HttpRequestConfig } from '../network/HttpClient'
import type { WebhookTelegramConfig } from '../config/Config'
import type { LogLevel } from './Logger'
import { createNotificationQueue, enqueueNotification, flushQueue } from './Queue'

const telegramQueue = createNotificationQueue()

function getTelegramEmoji(level: LogLevel): string {
    switch (level) {
        case 'error':
            return '❌'
        case 'warn':
            return '⚠️'
        case 'info':
            return 'ℹ️'
        case 'debug':
            return '🐛'
        default:
            return '📝'
    }
}

export async function sendTelegram(config: WebhookTelegramConfig, content: string, level: LogLevel): Promise<void> {
    if (!config?.botToken || !config?.chatId) return

    const emoji = getTelegramEmoji(level)
    const message = `${emoji}\n${content}`.slice(0, 4096)

    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`

    const request: HttpRequestConfig = {
        method: 'POST',
        url: url,
        headers: { 'Content-Type': 'application/json' },
        data: {
            chat_id: config.chatId,
            text: message,
            disable_notification: level === 'debug'
        },
        timeout: 10000
    }

    await enqueueNotification(telegramQueue, 'Telegram', content, level, request)
}

export function flushTelegramQueue(timeoutMs = 5000): Promise<void> {
    return flushQueue(telegramQueue, timeoutMs)
}
