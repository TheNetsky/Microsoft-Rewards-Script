import axios from 'axios'
import { Config } from '../interface/Config'
import { Ntfy } from './Ntfy'
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
    thumbnail?: {
        url: string
    }
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
        timestamp: new Date().toISOString(),
        thumbnail: {
            url: 'https://media.discordapp.net/attachments/1421163952972369931/1434299121098952958/v2.50.5.png?ex=6907d2a6&is=69068126&hm=1a11362e2c2c40fc9f8b67762abf17e5bae72e4b70567d4331de195a880ba043&=&format=png&quality=lossless&width=1024&height=1076'
        }
    }

    if (fields && fields.length > 0) {
        embed.fields = fields
    }

    const payload: WebhookPayload = {
        username: 'MS Rewi',
        avatar_url: 'https://media.discordapp.net/attachments/1421163952972369931/1434299121098952958/v2.50.5.png?ex=6907d2a6&is=69068126&hm=1a11362e2c2c40fc9f8b67762abf17e5bae72e4b70567d4331de195a880ba043&=&format=png&quality=lossless&width=1024&height=1076',
        embeds: [embed]
    }

    const postWebhook = async (url: string, label: string) => {
        const maxAttempts = 3
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
                    // Exponential backoff: 1s, 2s, 4s
                    const delayMs = 1000 * Math.pow(2, attempt - 1)
                    await new Promise(resolve => setTimeout(resolve, delayMs))
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
