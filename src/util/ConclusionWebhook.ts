import axios from 'axios'
import { Config } from '../interface/Config'
import { Ntfy } from './Ntfy'
import { DISCORD } from '../constants'
import { log } from './Logger'

interface DiscordField {
    name: string
    value: string
    inline?: boolean
}

interface DiscordEmbed {
    title?: string
    description?: string
    color?: number
    fields?: DiscordField[]
    timestamp?: string
    footer?: {
        text: string
        icon_url?: string
    }
}

interface WebhookPayload {
    username: string
    avatar_url: string
    embeds: DiscordEmbed[]
}

/**
 * Send a clean, structured Discord webhook notification
 */
export async function ConclusionWebhook(
    config: Config,
    title: string,
    description: string,
    fields?: DiscordField[],
    color?: number
) {
    const hasConclusion = config.conclusionWebhook?.enabled && config.conclusionWebhook.url
    const hasWebhook = config.webhook?.enabled && config.webhook.url

    if (!hasConclusion && !hasWebhook) return

    const embed: DiscordEmbed = {
        title,
        description,
        color: color || 0x0078D4,
        timestamp: new Date().toISOString()
    }

    if (fields && fields.length > 0) {
        embed.fields = fields
    }

    const payload: WebhookPayload = {
        username: 'Microsoft Rewards',
        avatar_url: DISCORD.AVATAR_URL,
        embeds: [embed]
    }

    const postWebhook = async (url: string, label: string) => {
        const maxAttempts = 2
        let lastError: unknown = null

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                await axios.post(url, payload, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 15000
                })
                log('main', 'WEBHOOK', `${label} notification sent successfully (attempt ${attempt})`)
                return
            } catch (error) {
                lastError = error
                if (attempt < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
                }
            }
        }
        log('main', 'WEBHOOK', `${label} failed after ${maxAttempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`, 'error')
    }

    const urls = new Set<string>()
    if (hasConclusion) urls.add(config.conclusionWebhook!.url)
    if (hasWebhook) urls.add(config.webhook!.url)

    await Promise.all(
        Array.from(urls).map((url, index) => postWebhook(url, `webhook-${index + 1}`))
    )

    // Optional NTFY notification
    if (config.ntfy?.enabled && config.ntfy.url && config.ntfy.topic) {
        const message = `${title}\n${description}${fields ? '\n\n' + fields.map(f => `${f.name}: ${f.value}`).join('\n') : ''}`
        const ntfyType = color === 0xFF0000 ? 'error' : color === 0xFFAA00 ? 'warn' : 'log'

        try {
            await Ntfy(message, ntfyType)
            log('main', 'NTFY', 'Notification sent successfully')
        } catch (error) {
            log('main', 'NTFY', `Failed to send notification: ${error instanceof Error ? error.message : String(error)}`, 'error')
        }
    }
}
