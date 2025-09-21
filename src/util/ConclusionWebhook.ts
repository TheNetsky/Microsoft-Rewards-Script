import axios from 'axios'
import { Config } from '../interface/Config'
import { Ntfy } from './Ntfy'

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

    const body: ConclusionPayload = {}
    if (payload?.embeds) body.embeds = payload.embeds
    if (content && content.trim()) body.content = content

    // Post to conclusion webhook if configured
    if (hasConclusion) {
        try {
            await axios.post(config.conclusionWebhook!.url, body, {
                headers: { 'Content-Type': 'application/json' }
            })
            console.log('Conclusion summary sent to conclusionWebhook.')
        } catch (err) {
            console.error('Failed to send conclusion summary to conclusionWebhook:', err)
        }
    }
    // Also post to primary webhook if configured
    if (hasWebhook) {
        try {
            await axios.post(config.webhook!.url, body, {
                headers: { 'Content-Type': 'application/json' }
            })
            console.log('Conclusion summary sent to webhook.')
        } catch (err) {
            console.error('Failed to send conclusion summary to webhook:', err)
        }
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
