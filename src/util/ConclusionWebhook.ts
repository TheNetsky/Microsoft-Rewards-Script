import axios from 'axios'

import { Config } from '../interface/Config'

interface ConclusionPayload {
    content?: string
    embeds?: any[]
}

/**
 * Send a final structured summary to the dedicated conclusion webhook (if enabled),
 * otherwise do nothing. Does NOT fallback to the normal logging webhook to avoid spam.
 */
export async function ConclusionWebhook(configData: Config, content: string, embed?: ConclusionPayload) {
    const webhook = configData.conclusionWebhook

    if (!webhook || !webhook.enabled || webhook.url.length < 10) return

    const body: ConclusionPayload = embed?.embeds ? { embeds: embed.embeds } : { content }
    if (content && !body.content && !body.embeds) body.content = content

    const request = {
        method: 'POST',
        url: webhook.url,
        headers: {
            'Content-Type': 'application/json'
        },
        data: body
    }

    await axios(request).catch(() => { })
}
