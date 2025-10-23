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
    thumbnail?: {
        url: string
    }
    author?: {
        name: string
        icon_url?: string
    }
}

interface WebhookPayload {
    username: string
    avatar_url: string
    embeds: DiscordEmbed[]
}

interface AccountSummary {
    email: string
    totalCollected: number
    desktopCollected: number
    mobileCollected: number
    initialTotal: number
    endTotal: number
    durationMs: number
    errors: string[]
    banned?: { status: boolean; reason?: string }
}

interface ConclusionData {
    version: string
    runId: string
    totalAccounts: number
    successes: number
    accountsWithErrors: number
    accountsBanned: number
    totalCollected: number
    totalInitial: number
    totalEnd: number
    avgPointsPerAccount: number
    totalDuration: number
    avgDuration: number
    summaries: AccountSummary[]
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

    // Use custom webhook settings if provided, otherwise fall back to defaults
    const webhookUsername = config.webhook?.username || config.conclusionWebhook?.username || 'Microsoft Rewards'
    const webhookAvatarUrl = config.webhook?.avatarUrl || config.conclusionWebhook?.avatarUrl || DISCORD.AVATAR_URL

    const payload: WebhookPayload = {
        username: webhookUsername,
        avatar_url: webhookAvatarUrl,
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

/**
 * Enhanced conclusion webhook with beautiful formatting and clear statistics
 */
export async function ConclusionWebhookEnhanced(config: Config, data: ConclusionData) {
    const hasConclusion = config.conclusionWebhook?.enabled && config.conclusionWebhook.url
    const hasWebhook = config.webhook?.enabled && config.webhook.url

    if (!hasConclusion && !hasWebhook) return

    // Helper to format duration
    const formatDuration = (ms: number): string => {
        const totalSeconds = Math.floor(ms / 1000)
        const hours = Math.floor(totalSeconds / 3600)
        const minutes = Math.floor((totalSeconds % 3600) / 60)
        const seconds = totalSeconds % 60
        
        if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
        if (minutes > 0) return `${minutes}m ${seconds}s`
        return `${seconds}s`
    }

    // Helper to create progress bar (future use)
    // const createProgressBar = (current: number, max: number, length: number = 10): string => {
    //     const percentage = Math.min(100, Math.max(0, (current / max) * 100))
    //     const filled = Math.round((percentage / 100) * length)
    //     const empty = length - filled
    //     return `${'█'.repeat(filled)}${'░'.repeat(empty)} ${percentage.toFixed(0)}%`
    // }

    // Determine overall status and color
    let statusEmoji = '✅'
    let statusText = 'Success'
    let embedColor: number = DISCORD.COLOR_GREEN

    if (data.accountsBanned > 0) {
        statusEmoji = '🚫'
        statusText = 'Banned Accounts Detected'
        embedColor = DISCORD.COLOR_RED
    } else if (data.accountsWithErrors > 0) {
        statusEmoji = '⚠️'
        statusText = 'Completed with Warnings'
        embedColor = DISCORD.COLOR_ORANGE
    }

    // Build main summary description
    const mainDescription = [
        `**Status:** ${statusEmoji} ${statusText}`,
        `**Version:** v${data.version} • **Run ID:** \`${data.runId}\``,
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    ].join('\n')

    // Build global statistics field
    const globalStats = [
        `**💎 Total Points Earned**`,
        `\`${data.totalInitial.toLocaleString()}\` → \`${data.totalEnd.toLocaleString()}\` **(+${data.totalCollected.toLocaleString()})**`,
        '',
        `**📊 Accounts Processed**`,
        `✅ Success: **${data.successes}** | ⚠️ Errors: **${data.accountsWithErrors}** | 🚫 Banned: **${data.accountsBanned}**`,
        `Total: **${data.totalAccounts}** ${data.totalAccounts === 1 ? 'account' : 'accounts'}`,
        '',
        `**⚡ Performance**`,
        `Average: **${data.avgPointsPerAccount}pts/account** in **${formatDuration(data.avgDuration)}**`,
        `Total Runtime: **${formatDuration(data.totalDuration)}**`
    ].join('\n')

    // Build per-account breakdown (split if too many accounts)
    const accountFields: DiscordField[] = []
    const maxAccountsPerField = 5
    const accountChunks: AccountSummary[][] = []
    
    for (let i = 0; i < data.summaries.length; i += maxAccountsPerField) {
        accountChunks.push(data.summaries.slice(i, i + maxAccountsPerField))
    }

    accountChunks.forEach((chunk, chunkIndex) => {
        const accountLines: string[] = []
        
        chunk.forEach((acc) => {
            const statusIcon = acc.banned?.status ? '🚫' : (acc.errors.length > 0 ? '⚠️' : '✅')
            const emailShort = acc.email.length > 25 ? acc.email.substring(0, 22) + '...' : acc.email
            
            accountLines.push(`${statusIcon} **${emailShort}**`)
            accountLines.push(`└ Points: **+${acc.totalCollected}** (🖥️ ${acc.desktopCollected} • 📱 ${acc.mobileCollected})`)
            accountLines.push(`└ Duration: ${formatDuration(acc.durationMs)}`)
            
            if (acc.banned?.status) {
                accountLines.push(`└ 🚫 **Banned:** ${acc.banned.reason || 'Account suspended'}`)
            } else if (acc.errors.length > 0) {
                const errorPreview = acc.errors.slice(0, 1).join(', ')
                accountLines.push(`└ ⚠️ **Error:** ${errorPreview.length > 50 ? errorPreview.substring(0, 47) + '...' : errorPreview}`)
            }
            
            accountLines.push('') // Empty line between accounts
        })

        const fieldName = accountChunks.length > 1 
            ? `📈 Account Details (${chunkIndex + 1}/${accountChunks.length})`
            : '📈 Account Details'

        accountFields.push({
            name: fieldName,
            value: accountLines.join('\n').trim(),
            inline: false
        })
    })

    // Create embeds
    const embeds: DiscordEmbed[] = []

    // Main embed with summary
    embeds.push({
        title: '🎯 Microsoft Rewards — Daily Summary',
        description: mainDescription,
        color: embedColor,
        fields: [
            {
                name: '📊 Global Statistics',
                value: globalStats,
                inline: false
            }
        ],
        thumbnail: {
            url: 'https://media.discordapp.net/attachments/1421163952972369931/1421929950377939125/Gc.png'
        },
        footer: {
            text: `Microsoft Rewards Bot v${data.version} • Completed at`,
            icon_url: 'https://media.discordapp.net/attachments/1421163952972369931/1421929950377939125/Gc.png'
        },
        timestamp: new Date().toISOString()
    })

    // Add account details in separate embed(s) if needed
    if (accountFields.length > 0) {
        // If we have multiple fields, split into multiple embeds
        accountFields.forEach((field, index) => {
            if (index === 0 && embeds[0] && embeds[0].fields) {
                // Add first field to main embed
                embeds[0].fields.push(field)
            } else {
                // Create additional embeds for remaining fields
                embeds.push({
                    color: embedColor,
                    fields: [field],
                    timestamp: new Date().toISOString()
                })
            }
        })
    }

    // Use custom webhook settings
    const webhookUsername = config.conclusionWebhook?.username || config.webhook?.username || 'Microsoft Rewards'
    const webhookAvatarUrl = config.conclusionWebhook?.avatarUrl || config.webhook?.avatarUrl || DISCORD.AVATAR_URL

    const payload: WebhookPayload = {
        username: webhookUsername,
        avatar_url: webhookAvatarUrl,
        embeds
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
                log('main', 'WEBHOOK', `${label} conclusion sent successfully (${data.totalAccounts} accounts, +${data.totalCollected}pts)`)
                return
            } catch (error) {
                lastError = error
                if (attempt < maxAttempts) {
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
        Array.from(urls).map((url, index) => postWebhook(url, `conclusion-webhook-${index + 1}`))
    )

    // Optional NTFY notification (simplified summary)
    if (config.ntfy?.enabled && config.ntfy.url && config.ntfy.topic) {
        const message = [
            `🎯 Microsoft Rewards Summary`,
            `Status: ${statusText}`,
            `Points: ${data.totalInitial} → ${data.totalEnd} (+${data.totalCollected})`,
            `Accounts: ${data.successes}/${data.totalAccounts} successful`,
            `Duration: ${formatDuration(data.totalDuration)}`
        ].join('\n')
        
        const ntfyType = embedColor === DISCORD.COLOR_RED ? 'error' : embedColor === DISCORD.COLOR_ORANGE ? 'warn' : 'log'

        try {
            await Ntfy(message, ntfyType)
            log('main', 'NTFY', 'Conclusion notification sent successfully')
        } catch (error) {
            log('main', 'NTFY', `Failed to send conclusion notification: ${error instanceof Error ? error.message : String(error)}`, 'error')
        }
    }
}
