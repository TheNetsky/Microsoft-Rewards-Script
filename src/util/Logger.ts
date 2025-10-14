import axios from 'axios'
import chalk from 'chalk'

import { Ntfy } from './Ntfy'
import { loadConfig } from './Load'

type WebhookBuffer = {
    lines: string[]
    sending: boolean
    timer?: NodeJS.Timeout
}

const webhookBuffers = new Map<string, WebhookBuffer>()

function getBuffer(url: string): WebhookBuffer {
    let buf = webhookBuffers.get(url)
    if (!buf) {
        buf = { lines: [], sending: false }
        webhookBuffers.set(url, buf)
    }
    return buf
}

async function sendBatch(url: string, buf: WebhookBuffer) {
    if (buf.sending) return
    buf.sending = true
    while (buf.lines.length > 0) {
        const chunk: string[] = []
        let currentLength = 0
        while (buf.lines.length > 0) {
            const next = buf.lines[0]!
            const projected = currentLength + next.length + (chunk.length > 0 ? 1 : 0)
            if (projected > 1900 && chunk.length > 0) break
            buf.lines.shift()
            chunk.push(next)
            currentLength = projected
        }

        const content = chunk.join('\n').slice(0, 1900)
        if (!content) {
            continue
        }

        try {
            await axios.post(url, { content }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 })
            await new Promise(resolve => setTimeout(resolve, 500))
        } catch (error) {
            // Re-queue failed batch at front and exit loop
            buf.lines = chunk.concat(buf.lines)
            console.error('[Webhook] live log delivery failed:', error)
            break
        }
    }
    buf.sending = false
}

function enqueueWebhookLog(url: string, line: string) {
    const buf = getBuffer(url)
    buf.lines.push(line)
    if (!buf.timer) {
        buf.timer = setTimeout(() => {
            buf.timer = undefined
            void sendBatch(url, buf)
        }, 750)
    }
}

// Synchronous logger that returns an Error when type === 'error' so callers can `throw log(...)` safely.
export function log(isMobile: boolean | 'main', title: string, message: string, type: 'log' | 'warn' | 'error' = 'log', color?: keyof typeof chalk): Error | void {
    const configData = loadConfig()

    // Access logging config with fallback for backward compatibility
    const configAny = configData as unknown as Record<string, unknown>
    const logging = configAny.logging as { excludeFunc?: string[]; logExcludeFunc?: string[] } | undefined
    const logExcludeFunc = logging?.excludeFunc ?? (configData as { logExcludeFunc?: string[] }).logExcludeFunc ?? []

    if (logExcludeFunc.some((x: string) => x.toLowerCase() === title.toLowerCase())) {
        return
    }

    const currentTime = new Date().toLocaleString()
    const platformText = isMobile === 'main' ? 'MAIN' : isMobile ? 'MOBILE' : 'DESKTOP'
    
    // Clean string for notifications (no chalk, structured)
    type LoggingCfg = { excludeFunc?: string[]; webhookExcludeFunc?: string[]; redactEmails?: boolean }
    const loggingCfg: LoggingCfg = (configAny.logging || {}) as LoggingCfg
    const shouldRedact = !!loggingCfg.redactEmails
    const redact = (s: string) => shouldRedact ? s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig, (m) => {
        const [u, d] = m.split('@'); return `${(u||'').slice(0,2)}***@${d||''}`
    }) : s
    const cleanStr = redact(`[${currentTime}] [PID: ${process.pid}] [${type.toUpperCase()}] ${platformText} [${title}] ${message}`)

    // Define conditions for sending to NTFY 
    const ntfyConditions = {
        log: [
            message.toLowerCase().includes('started tasks for account'),
            message.toLowerCase().includes('press the number'),
            message.toLowerCase().includes('no points to earn')
        ],
        error: [], 
        warn: [
            message.toLowerCase().includes('aborting'),
            message.toLowerCase().includes('didn\'t gain')
        ]
    }

    // Check if the current log type and message meet the NTFY conditions
    try {
        if (type in ntfyConditions && ntfyConditions[type as keyof typeof ntfyConditions].some(condition => condition)) {
            // Fire-and-forget
            Promise.resolve(Ntfy(cleanStr, type)).catch(() => { /* ignore ntfy errors */ })
        }
    } catch { /* ignore */ }

    // Console output with better formatting and contextual emojis
    const typeIndicator = type === 'error' ? '✗' : type === 'warn' ? '⚠' : '✓'
    const platformColor = isMobile === 'main' ? chalk.cyan : isMobile ? chalk.blue : chalk.magenta
    const typeColor = type === 'error' ? chalk.red : type === 'warn' ? chalk.yellow : chalk.green
    
    // Add contextual emoji based on title/message (priority order matters)
    const titleLower = title.toLowerCase()
    const msgLower = message.toLowerCase()
    
    const emojiMap: Array<[RegExp, string]> = [
        [/security|compromised/i, '�'],
        [/ban|suspend/i, '�'],
        [/error/i, '❌'],
        [/warn/i, '⚠️'],
        [/success|complet/i, '✅'],
        [/login/i, '🔐'],
        [/point/i, '💰'],
        [/search/i, '�'],
        [/activity|quiz|poll/i, '🎯'],
        [/browser/i, '🌐'],
        [/main/i, '⚙️']
    ]
    
    let emoji = ''
    for (const [pattern, symbol] of emojiMap) {
        if (pattern.test(titleLower) || pattern.test(msgLower)) {
            emoji = symbol
            break
        }
    }
    
    const emojiPart = emoji ? emoji + ' ' : ''
    
    const formattedStr = [
        chalk.gray(`[${currentTime}]`),
        chalk.gray(`[${process.pid}]`),
        typeColor(`${typeIndicator}`),
        platformColor(`[${platformText}]`),
        chalk.bold(`[${title}]`),
        emojiPart + redact(message)
    ].join(' ')

    const applyChalk = color && typeof chalk[color] === 'function' ? chalk[color] as (msg: string) => string : null

    // Log based on the type
    switch (type) {
        case 'warn':
            applyChalk ? console.warn(applyChalk(formattedStr)) : console.warn(formattedStr)
            break

        case 'error':
            applyChalk ? console.error(applyChalk(formattedStr)) : console.error(formattedStr)
            break

        default:
            applyChalk ? console.log(applyChalk(formattedStr)) : console.log(formattedStr)
            break
    }

    // Webhook streaming (live logs)
    try {
        const loggingCfg: Record<string, unknown> = (configAny.logging || {}) as Record<string, unknown>
        const webhookCfg = configData.webhook
        const liveUrlRaw = typeof loggingCfg.liveWebhookUrl === 'string' ? loggingCfg.liveWebhookUrl.trim() : ''
        const liveUrl = liveUrlRaw || (webhookCfg?.enabled && webhookCfg.url ? webhookCfg.url : '')
        const webhookExclude = Array.isArray(loggingCfg.webhookExcludeFunc) ? loggingCfg.webhookExcludeFunc : configData.webhookLogExcludeFunc || []
        const webhookExcluded = Array.isArray(webhookExclude) && webhookExclude.some((x: string) => x.toLowerCase() === title.toLowerCase())
        if (liveUrl && !webhookExcluded) {
            enqueueWebhookLog(liveUrl, cleanStr)
        }
    } catch (error) {
        console.error('[Logger] Failed to enqueue webhook log:', error)
    }

    // Return an Error when logging an error so callers can `throw log(...)`
    if (type === 'error') {
        // CommunityReporter disabled per project policy
        return new Error(cleanStr)
    }
}