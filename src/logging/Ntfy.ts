import type { HttpRequestConfig } from '../network/HttpClient'
import type { WebhookNtfyConfig } from '../config/Config'
import type { LogLevel } from './Logger'
import { createNotificationQueue, enqueueNotification, flushQueue } from './Queue'

const ntfyQueue = createNotificationQueue()

export async function sendNtfy(config: WebhookNtfyConfig, content: string, level: LogLevel): Promise<void> {
    if (!config?.url) return

    const priority = level === 'error' ? 5 : level === 'warn' ? 4 : config.priority

    const headers: Record<string, string> = { 'Content-Type': 'text/plain' }
    if (config.title) headers['Title'] = config.title
    if (config.tags?.length) headers['Tags'] = config.tags.join(',')
    if (priority) headers['Priority'] = String(priority)
    if (config.token) headers['Authorization'] = `Bearer ${config.token}`

    const url = config.topic ? `${config.url}/${config.topic}` : config.url

    const request: HttpRequestConfig = {
        method: 'POST',
        url: url,
        headers,
        data: content,
        timeout: 10000
    }

    await enqueueNotification(ntfyQueue, 'Ntfy', content, level, request)
}

export function flushNtfyQueue(timeoutMs = 5000): Promise<void> {
    return flushQueue(ntfyQueue, timeoutMs)
}
