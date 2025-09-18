import axios from 'axios'
import { Config } from '../interface/Config'
import { Ntfy } from './Ntfy'

interface ConclusionPayload {
    content?: string
    embeds?: any[]
}

/**
 * Send a final structured summary to the configured webhook,
 * and optionally mirror a plain-text summary to NTFY.
 *
 * This preserves existing webhook behavior while adding NTFY
 * as a separate, optional channel.
 */
export async function ConclusionWebhook(config: Config, content: string, embed?: ConclusionPayload) {
    // Webhook: structured JSON (embeds or content)
    if (config.webhook?.enabled && config.webhook.url) {
        const body: ConclusionPayload =
            embed?.embeds ? { embeds: embed.embeds } : { content }

        try {
            await axios.post(config.webhook.url, body, {
                headers: { 'Content-Type': 'application/json' }
            })
            console.log('Conclusion summary sent to webhook.')
        } catch (err) {
            console.error('Failed to send conclusion summary to webhook:', err)
        }
    }

    // NTFY: plain text summary
    if (config.ntfy?.enabled && config.ntfy.url && config.ntfy.topic) {
        let message = content || ''

        if (!message && embed?.embeds?.length) {
            const e = embed.embeds[0]
            const title = e.title ? `${e.title}\n` : ''
            const desc = e.description ? `${e.description}\n` : ''
            const totals = e.fields?.[0]?.value ? `\n${e.fields[0].value}\n` : ''
            message = `${title}${desc}${totals}`.trim()
        }

        if (!message) {
            message = 'Microsoft Rewards run complete.'
        }

        // Pick notification type based on embed color (yellow = warn)
        const embedColor = embed?.embeds?.[0]?.color
        const ntfyType = embedColor === 0xFFAA00 ? 'warn' : 'log'

        try {
            await Ntfy(message, ntfyType)
            console.log('Conclusion summary sent to NTFY.')
        } catch (err) {
            console.error('Failed to send conclusion summary to NTFY:', err)
        }
    }
}
