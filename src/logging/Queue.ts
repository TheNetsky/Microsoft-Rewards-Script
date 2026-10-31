import PQueue from 'p-queue'
import { httpRequest, type HttpRequestConfig } from '../network/HttpClient'
import type { LogLevel } from './Logger'
import { logSystemMessage } from './LogEvent'

interface IdleQueue {
    onIdle(): Promise<void>
}

export function createNotificationQueue(): PQueue {
    return new PQueue({
        concurrency: 1,
        interval: 1000,
        intervalCap: 2,
        carryoverConcurrencyCount: true
    })
}

export async function enqueueNotification(
    queue: PQueue,
    channel: string,
    content: string,
    level: LogLevel,
    request: HttpRequestConfig
): Promise<void> {
    const summary = /\[(RUN-END|ACCOUNT-END)\]/.test(content)
    if (queue.size >= (summary ? 120 : 100)) {
        logSystemMessage('warn', 'NOTIFICATIONS', `${channel} queue full; message dropped.`)
        return
    }
    await queue.add(
        async () => {
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    await httpRequest(request)
                    return
                } catch (err) {
                    const response = (err as { response?: { status?: number; headers?: Record<string, unknown> } })
                        ?.response
                    if (response?.status === 429 && attempt === 0) {
                        const seconds = Math.min(10, Math.max(1, Number(response.headers?.['retry-after']) || 2))
                        await new Promise(resolve => setTimeout(resolve, seconds * 1000))
                        continue
                    }
                    logSystemMessage(
                        'warn',
                        'NOTIFICATIONS',
                        `${channel} delivery failed` + (response?.status ? ` (HTTP ${response.status})` : '') + '.'
                    )
                    return
                }
            }
        },
        { priority: summary ? 10 : level === 'error' ? 5 : 0 }
    )
}

export async function flushQueue(queue: IdleQueue, timeoutMs = 5000): Promise<void> {
    let timer: NodeJS.Timeout | undefined

    await Promise.race([
        queue.onIdle(),
        new Promise<void>(resolve => {
            timer = setTimeout(resolve, timeoutMs)
        })
    ])

    if (timer) clearTimeout(timer)
}
