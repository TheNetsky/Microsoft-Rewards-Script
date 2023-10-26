import axios from 'axios'

import { loadConfig } from './Load'


export async function Webhook(content: string) {
    const webhook = loadConfig().webhook

    if (!webhook.enabled || webhook.url.length < 10) return

    const request = {
        method: 'POST',
        url: webhook.url,
        headers: {
            'Content-Type': 'application/json'
        },
        data: {
            'content': content
        }
    }

    await axios(request).catch(() => { })
}