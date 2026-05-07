import type { AxiosRequestConfig } from 'axios'
import { Session } from 'httpcloak'
import type { WebhookNtfyConfig } from '../interface/Config'
import type { LogLevel } from './Logger'

let ntfyQueuePromise: Promise<any> | null = null
const webhookSession = new Session({
    preset: 'chrome-146-windows',
    timeout: 10,
    retry: 3
})

async function getNtfyQueue(): Promise<any> {
    if (!ntfyQueuePromise) {
        ntfyQueuePromise = import('p-queue').then(mod =>
            new mod.default({
                interval: 1000,
                intervalCap: 2,
                carryoverConcurrencyCount: true
            })
        )
    }

    return ntfyQueuePromise
}

export async function sendNtfy(config: WebhookNtfyConfig, content: string, level: LogLevel): Promise<void> {
    if (!config?.url) return

    switch (level) {
        case 'error':
            config.priority = 5 // Highest
            break

        case 'warn':
            config.priority = 4
            break

        default:
            break
    }

    const headers: Record<string, string> = { 'Content-Type': 'text/plain' }
    if (config.title) headers['Title'] = config.title
    if (config.tags?.length) headers['Tags'] = config.tags.join(',')
    if (config.priority) headers['Priority'] = String(config.priority)
    if (config.token) headers['Authorization'] = `Bearer ${config.token}`

    const url = config.topic ? `${config.url}/${config.topic}` : config.url

    const request: AxiosRequestConfig = {
        method: 'POST',
        url: url,
        headers,
        data: content,
        timeout: 10000
    }

    const ntfyQueue = await getNtfyQueue()
    await ntfyQueue.add(async () => {
        try {
            const method = (request.method ?? 'POST').toUpperCase()
            const response = await webhookSession.request(method, request.url as string, {
                headers: request.headers as Record<string, string>,
                timeout: request.timeout ? Math.max(1, Math.ceil(request.timeout / 1000)) : 10,
                body: typeof request.data === 'string' ? request.data : String(request.data ?? '')
            })

            if (response.statusCode >= 400) {
                throw new Error(`ntfy webhook failed with status ${response.statusCode}`)
            }
        } catch (err: any) {
            const status = err?.response?.status ?? err?.statusCode
            if (status === 429) return
        }
    })
}

export async function flushNtfyQueue(timeoutMs = 5000): Promise<void> {
    const ntfyQueue = await getNtfyQueue()
    await Promise.race([
        (async () => {
            await ntfyQueue.onIdle()
        })(),
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('ntfy flush timeout')), timeoutMs))
    ]).catch(() => {})
}
