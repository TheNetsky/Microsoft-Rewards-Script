import type { AxiosRequestConfig } from 'axios'
import { Session } from 'httpcloak'
import type { LogLevel } from './Logger'

const DISCORD_LIMIT = 2000
const webhookSession = new Session({
    preset: 'chrome-146-windows',
    timeout: 10,
    retry: 3
})

export interface DiscordConfig {
    enabled?: boolean
    url: string
}

let discordQueuePromise: Promise<any> | null = null

async function getDiscordQueue(): Promise<any> {
    if (!discordQueuePromise) {
        discordQueuePromise = import('p-queue').then(mod =>
            new mod.default({
                interval: 1000,
                intervalCap: 2,
                carryoverConcurrencyCount: true
            })
        )
    }

    return discordQueuePromise
}

function truncate(text: string) {
    return text.length <= DISCORD_LIMIT ? text : text.slice(0, DISCORD_LIMIT - 14) + ' …(truncated)'
}

export async function sendDiscord(discordUrl: string, content: string, level: LogLevel): Promise<void> {
    if (!discordUrl) return
    void level

    const request: AxiosRequestConfig = {
        method: 'POST',
        url: discordUrl,
        headers: { 'Content-Type': 'application/json' },
        data: { content: truncate(content), allowed_mentions: { parse: [] } },
        timeout: 10000
    }

    const discordQueue = await getDiscordQueue()
    await discordQueue.add(async () => {
        try {
            const method = (request.method ?? 'POST').toUpperCase()
            const response = await webhookSession.request(method, request.url as string, {
                headers: request.headers as Record<string, string>,
                timeout: request.timeout ? Math.max(1, Math.ceil(request.timeout / 1000)) : 10,
                json: request.data as Record<string, any>
            })

            if (response.statusCode >= 400) {
                throw new Error(`Discord webhook failed with status ${response.statusCode}`)
            }
        } catch (err: any) {
            const status = err?.response?.status ?? err?.statusCode
            if (status === 429) return
        }
    })
}

export async function flushDiscordQueue(timeoutMs = 5000): Promise<void> {
    const discordQueue = await getDiscordQueue()
    await Promise.race([
        (async () => {
            await discordQueue.onIdle()
        })(),
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('discord flush timeout')), timeoutMs))
    ]).catch(() => {})
}
