import axios from 'axios'


import { Config } from '../interface/Config'

export async function Webhook(configData: Config, content: string) {
    const webhook = configData.webhook

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