import { createHmac } from 'node:crypto'
import PQueue from 'p-queue'
import type { AccountStats } from '../core/RunTypes'
import type { CompletionDetail } from '../rewards/shared/ActivityCompletion'
import type { WebhookFeishuConfig } from '../config/Config'
import { logSystemMessage } from './LogEvent'
import { flushQueue } from './Queue'

const queue = new PQueue({ concurrency: 1 })
const MAX_ITEMS = 12

function safeText(value: string): string {
    return value
        .replace(/https?:\/\/\S+/gi, '[link]')
        .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
        .replace(/[\r\n<>[\]`*_\\]/g, ' ')
        .slice(0, 160)
}

function formatItems(items: CompletionDetail[] | undefined, total: number): string {
    const shown = (items ?? []).slice(0, MAX_ITEMS)
    const lines = shown.map(item => {
        const platform = item.platform === 'mobile' ? 'Mobile' : item.platform === 'desktop' ? 'Desktop' : 'General'
        const title = item.title ? `: ${safeText(item.title)}` : ''
        const points =
            item.pointsKnown !== false && (item.pointsGained ?? 0) > 0 ? ` (+${item.pointsGained} points)` : ''
        const message = item.category !== 'completed' && item.message ? ` — ${safeText(item.message)}` : ''
        return `• ${platform} ${safeText(item.label)}${title}${points}${message}`
    })
    if (total > shown.length) lines.push(`• ${total - shown.length} more`)
    return lines.length ? lines.join('\n') : 'None'
}

export function createFeishuCard(stats: AccountStats) {
    const status = stats.status ?? (stats.success ? 'completed' : 'partial')
    const template = status === 'completed' ? 'green' : status === 'partial' ? 'orange' : 'red'
    const heading =
        status === 'completed' ? 'Completed' : status === 'partial' ? 'Partially completed' : 'Run failed or stopped'
    const points =
        stats.pointsKnown === false
            ? 'Points: unknown'
            : `Points: ${stats.initialPoints} → ${stats.finalPoints} (${stats.collectedPoints >= 0 ? '+' : ''}${stats.collectedPoints})`
    const completion = stats.completion
    const text = completion
        ? `${points}\n\n**Completed**\n${formatItems(completion.completed, completion.counts.completed)}\n\n**Incomplete or unconfirmed**\n${formatItems(completion.incomplete, completion.counts.incomplete)}\n\n**Unavailable or skipped**\n${formatItems(completion.unavailable, completion.counts.unavailable)}\n\n**Not applicable**\n${formatItems(completion.notApplicable, completion.counts.notApplicable)}`
        : `${points}\n\nTask details unavailable.`
    return {
        config: { wide_screen_mode: true },
        header: { template, title: { tag: 'plain_text', content: `Microsoft Rewards · ${heading}` } },
        elements: [{ tag: 'div', text: { tag: 'lark_md', content: text } }]
    }
}

export function createFeishuPayload(stats: AccountStats, secret: string, timestamp: string) {
    const signature = secret
        ? { timestamp, sign: createHmac('sha256', `${timestamp}\n${secret}`).update('').digest('base64') }
        : {}
    return { ...signature, msg_type: 'interactive', card: createFeishuCard(stats) }
}

export function isFeishuWebhook(value: string): boolean {
    try {
        const url = new URL(value)
        return (
            url.protocol === 'https:' &&
            ['open.feishu.cn', 'open.larksuite.com'].includes(url.hostname) &&
            !url.username &&
            !url.password &&
            !url.port &&
            !url.search &&
            !url.hash &&
            /^\/open-apis\/bot\/v2\/hook\/[A-Za-z0-9-]+$/.test(url.pathname)
        )
    } catch {
        return false
    }
}

export function sendFeishuSummary(config: WebhookFeishuConfig | undefined, stats: AccountStats): void {
    if (!config?.enabled) return
    if (!isFeishuWebhook(config.url)) {
        logSystemMessage('warn', 'NOTIFICATIONS', 'Feishu webhook URL is invalid.')
        return
    }
    void queue.add(async () => {
        try {
            const response = await fetch(config.url, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                redirect: 'error',
                body: JSON.stringify(
                    createFeishuPayload(stats, config.signingSecret ?? '', String(Math.floor(Date.now() / 1000)))
                ),
                signal: AbortSignal.timeout(4000)
            })
            const result: unknown = await response.json()
            if (!response.ok || !result || typeof result !== 'object' || !('code' in result) || result.code !== 0)
                throw new Error('Delivery failed')
        } catch {
            logSystemMessage('warn', 'NOTIFICATIONS', 'Feishu delivery failed.')
        }
    })
}

export function flushFeishuQueue(timeoutMs: number): Promise<void> {
    return flushQueue(queue, timeoutMs)
}
