import { httpRequest } from '../util/Http'
import type { HttpRequestConfig } from '../util/Http'
import PQueue from 'p-queue'
import type { WebhookBarkConfig } from '../interface/Config'
import type { LogLevel } from './Logger'
import { flushQueue } from './Queue'

const barkQueue = new PQueue({
    interval: 1000,
    intervalCap: 2,
    carryoverConcurrencyCount: true
})

export async function sendBark(config: WebhookBarkConfig, content: string, level: LogLevel): Promise<void> {
    if (!config?.url && !config?.deviceKey) return

    const baseUrl = (config.url?.trim() || 'https://api.day.app').replace(/\/+$/, '')
    let targetUrl: string

    const title = config.title || 'Microsoft-Rewards-Script'

    let interruptionLevel = config.level
    if (!interruptionLevel) {
        if (level === 'error') {
            interruptionLevel = 'timeSensitive'
        } else if (level === 'warn') {
            interruptionLevel = 'active'
        }
    }

    const payload: Record<string, unknown> = {
        title,
        body: content
    }

    if (config.deviceKey) {
        payload.device_key = config.deviceKey
        targetUrl = baseUrl.endsWith('/push') ? baseUrl : `${baseUrl}/push`
    } else {
        targetUrl = baseUrl
    }

    if (config.group) payload.group = config.group
    if (config.icon) payload.icon = config.icon
    if (config.sound) payload.sound = config.sound
    if (interruptionLevel) payload.level = interruptionLevel

    const request: HttpRequestConfig = {
        method: 'POST',
        url: targetUrl,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        data: payload,
        timeout: 10000
    }

    await barkQueue.add(async () => {
        try {
            await httpRequest(request)
        } catch (err) {
            const status = (err as { response?: { status?: number } })?.response?.status
            if (status === 429) return
        }
    })
}

export function flushBarkQueue(timeoutMs = 5000): Promise<void> {
    return flushQueue(barkQueue, timeoutMs)
}
