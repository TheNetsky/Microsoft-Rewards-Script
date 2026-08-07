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

// 按严重级别设置嵌入消息的强调色，使错误和警告在频道中更醒目
const LEVEL_COLOR: Record<LogLevel, number> = {
    error: 0xed4245, // 红色
    warn: 0xfee75c, // 琥珀色
    info: 0x5865f2, // 蓝紫色
    debug: 0x4f545c // 灰色
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
