import { httpRequest } from '../util/Http'
import type { HttpRequestConfig } from '../util/Http'
import PQueue from 'p-queue'
import type { LogLevel } from './Logger'
import { flushQueue } from './Queue'

const DISCORD_LIMIT = 2000

export interface DiscordConfig {
    enabled?: boolean
    url: string
}

const discordQueue = new PQueue({
    interval: 1000,
    intervalCap: 2,
    carryoverConcurrencyCount: true
})

function truncate(text: string) {
    return text.length <= DISCORD_LIMIT ? text : text.slice(0, DISCORD_LIMIT - 14) + ' …(truncated)'
}

// Embed accent colour by severity so errors/warnings stand out in the channel
const LEVEL_COLOR: Record<LogLevel, number> = {
    error: 0xed4245, // red
    warn: 0xfee75c, // amber
    info: 0x5865f2, // blurple
    debug: 0x4f545c // grey
}

export async function sendDiscord(discordUrl: string, content: string, level: LogLevel): Promise<void> {
    if (!discordUrl) return

    const request: HttpRequestConfig = {
        method: 'POST',
        url: discordUrl,
        headers: { 'Content-Type': 'application/json' },
        data: {
            embeds: [{ description: truncate(content), color: LEVEL_COLOR[level] ?? LEVEL_COLOR.info }],
            allowed_mentions: { parse: [] }
        },
        timeout: 10000
    }

    await discordQueue.add(async () => {
        try {
            await httpRequest(request)
        } catch (err) {
            const status = (err as { response?: { status?: number } })?.response?.status
            if (status === 429) return
        }
    })
}

export function flushDiscordQueue(timeoutMs = 5000): Promise<void> {
    return flushQueue(discordQueue, timeoutMs)
}
