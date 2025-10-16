import { loadConfig } from './Load'
import axios from 'axios'

const NOTIFICATION_TYPES = {
    error: { priority: 'max', tags: 'rotating_light' }, // Customize the ERROR icon here, see: https://docs.ntfy.sh/emojis/
    warn: { priority: 'high', tags: 'warning' }, // Customize the WARN icon here, see: https://docs.ntfy.sh/emojis/
    log: { priority: 'default', tags: 'medal_sports' } // Customize the LOG icon here, see: https://docs.ntfy.sh/emojis/
}

export async function Ntfy(message: string, type: keyof typeof NOTIFICATION_TYPES = 'log'): Promise<void> {
    const config = loadConfig().ntfy
    if (!config?.enabled || !config.url || !config.topic) return

    try {
        const { priority, tags } = NOTIFICATION_TYPES[type]
        const headers = {
            Title: 'Microsoft Rewards Script',
            Priority: priority,
            Tags: tags,
            ...(config.authToken && { Authorization: `Bearer ${config.authToken}` })
        }

        await axios.post(`${config.url}/${config.topic}`, message, { headers })
    } catch (error) {
        // Silently fail - NTFY is a non-critical notification service
    }
}