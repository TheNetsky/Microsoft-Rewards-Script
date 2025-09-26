import chalk from 'chalk'

import { Ntfy } from './Ntfy'
import { loadConfig } from './Load'

// Synchronous logger that returns an Error when type === 'error' so callers can `throw log(...)` safely.
export function log(isMobile: boolean | 'main', title: string, message: string, type: 'log' | 'warn' | 'error' = 'log', color?: keyof typeof chalk): Error | void {
    const configData = loadConfig()

    // Access logging config with fallback for backward compatibility
    const configAny = configData as unknown as Record<string, unknown>
    const loggingConfig = configAny.logging || configData
    const loggingConfigAny = loggingConfig as unknown as Record<string, unknown>
    
    const logExcludeFunc = Array.isArray(loggingConfigAny.excludeFunc) ? loggingConfigAny.excludeFunc : 
                          Array.isArray(loggingConfigAny.logExcludeFunc) ? loggingConfigAny.logExcludeFunc : []

    if (Array.isArray(logExcludeFunc) && logExcludeFunc.some((x: string) => x.toLowerCase() === title.toLowerCase())) {
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

    // Console output with better formatting
    const typeIndicator = type === 'error' ? '✗' : type === 'warn' ? '⚠' : '●'
    const platformColor = isMobile === 'main' ? chalk.cyan : isMobile ? chalk.blue : chalk.magenta
    const typeColor = type === 'error' ? chalk.red : type === 'warn' ? chalk.yellow : chalk.green
    
    const formattedStr = [
        chalk.gray(`[${currentTime}]`),
        chalk.gray(`[${process.pid}]`),
        typeColor(`${typeIndicator} ${type.toUpperCase()}`),
        platformColor(`[${platformText}]`),
        chalk.bold(`[${title}]`),
        redact(message)
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

    // Return an Error when logging an error so callers can `throw log(...)`
    if (type === 'error') {
        // CommunityReporter disabled per project policy
        return new Error(cleanStr)
    }
}