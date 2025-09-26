import axios from 'axios'
import { Config } from '../interface/Config'
import { Ntfy } from './Ntfy'

// Light obfuscation of the avatar URL (base64). Prevents casual editing in config.
const AVATAR_B64 = 'aHR0cHM6Ly9tZWRpYS5kaXNjb3JkYXBwLm5ldC9hdHRhY2htZW50cy8xNDIxMTYzOTUyOTcyMzY5OTMxLzE0MjExNjQxNDU5OTQyNDAxMTAvbXNuLnBuZz93aWR0aD01MTImZWlnaHQ9NTEy'
function getAvatarUrl(): string {
    try { return Buffer.from(AVATAR_B64, 'base64').toString('utf-8') } catch { return '' }
}

type WebhookContext = 'summary' | 'ban' | 'security' | 'compromised' | 'spend' | 'error' | 'default'

function pickUsername(ctx: WebhookContext, fallbackColor?: number): string {
    switch (ctx) {
        case 'summary': return 'Summary'
        case 'ban': return 'Ban'
        case 'security': return 'Security'
        case 'compromised': return 'Pirate'
        case 'spend': return 'Spend'
        case 'error': return 'Error'
        default: return fallbackColor === 0xFF0000 ? 'Error' : 'Rewards'
    }
}

interface DiscordField { name: string; value: string; inline?: boolean }
interface DiscordEmbed {
    title?: string
    description?: string
    color?: number
    fields?: DiscordField[]
}

interface ConclusionPayload {
    content?: string
    embeds?: DiscordEmbed[]
    context?: WebhookContext
}

/**
 * Send a final structured summary to the configured webhook,
 * and optionally mirror a plain-text summary to NTFY.
 *
 * This preserves existing webhook behavior while adding NTFY
 * as a separate, optional channel.
 */
export async function ConclusionWebhook(config: Config, content: string, payload?: ConclusionPayload) {
    // Send to both webhooks when available
    const hasConclusion = !!(config.conclusionWebhook?.enabled && config.conclusionWebhook.url)
    const hasWebhook = !!(config.webhook?.enabled && config.webhook.url)
    const sameTarget = hasConclusion && hasWebhook && config.conclusionWebhook!.url === config.webhook!.url

    const body: ConclusionPayload & { username?: string; avatar_url?: string } = {}
    if (payload?.embeds) body.embeds = payload.embeds
    if (content && content.trim()) body.content = content
    const firstColor = payload?.embeds && payload.embeds[0]?.color
    const ctx: WebhookContext = payload?.context || (firstColor === 0xFF0000 ? 'error' : 'default')
    body.username = pickUsername(ctx, firstColor)
    body.avatar_url = getAvatarUrl()

    // Post to conclusion webhook if configured
    const postWithRetry = async (url: string, label: string) => {
        const max = 2
        let lastErr: unknown = null
        for (let attempt = 1; attempt <= max; attempt++) {
            try {
                await axios.post(url, body, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 })
                console.log(`[Webhook:${label}] summary sent (attempt ${attempt}).`)
                return
            } catch (e) {
                lastErr = e
                if (attempt === max) break
                await new Promise(r => setTimeout(r, 1000 * attempt))
            }
        }
        console.error(`[Webhook:${label}] failed after ${max} attempts:`, lastErr)
    }

    if (hasConclusion) {
        await postWithRetry(config.conclusionWebhook!.url, sameTarget ? 'conclusion+primary' : 'conclusion')
    }
    if (hasWebhook && !sameTarget) {
        await postWithRetry(config.webhook!.url, 'primary')
    }

    // NTFY: mirror a plain text summary (optional)
    if (config.ntfy?.enabled && config.ntfy.url && config.ntfy.topic) {
        let message = content || ''
        if (!message && payload?.embeds && payload.embeds.length > 0) {
            const e: DiscordEmbed = payload.embeds[0]!
            const title = e.title ? `${e.title}\n` : ''
            const desc = e.description ? `${e.description}\n` : ''
            const totals = e.fields && e.fields[0]?.value ? `\n${e.fields[0].value}\n` : ''
            message = `${title}${desc}${totals}`.trim()
        }
        if (!message) message = 'Microsoft Rewards run complete.'
        // Choose NTFY level based on embed color (yellow = warn)
        let embedColor: number | undefined
        if (payload?.embeds && payload.embeds.length > 0) {
            embedColor = payload.embeds[0]!.color
        }
        const ntfyType = embedColor === 0xFFAA00 ? 'warn' : 'log'
        try {
            await Ntfy(message, ntfyType)
            console.log('Conclusion summary sent to NTFY.')
        } catch (err) {
            console.error('Failed to send conclusion summary to NTFY:', err)
        }
    }
}
