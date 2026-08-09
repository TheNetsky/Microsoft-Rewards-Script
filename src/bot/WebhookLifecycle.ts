import { flushDiscordQueue } from '../logging/Discord'
import { flushNtfyQueue } from '../logging/Ntfy'
import { flushTelegramQueue } from '../logging/Telegram'
import { closeSessionStore } from '../util/SessionStore'

export async function flushAllWebhooks(timeoutMs = 5000): Promise<void> {
    await Promise.allSettled([flushDiscordQueue(timeoutMs), flushNtfyQueue(timeoutMs), flushTelegramQueue(timeoutMs)])
    closeSessionStore()
}
