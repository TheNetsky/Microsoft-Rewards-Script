import chalk from 'chalk'

import { Webhook } from './Webhook'
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
    const webhookLogExcludeFunc = Array.isArray(loggingConfigAny.webhookExcludeFunc) ? loggingConfigAny.webhookExcludeFunc : 
                                 Array.isArray(loggingConfigAny.webhookLogExcludeFunc) ? loggingConfigAny.webhookLogExcludeFunc : []

    if (Array.isArray(logExcludeFunc) && logExcludeFunc.some((x: string) => x.toLowerCase() === title.toLowerCase())) {
        return
    }

    const currentTime = new Date().toLocaleString()
    const platformText = isMobile === 'main' ? 'MAIN' : isMobile ? 'MOBILE' : 'DESKTOP'
    
    // Clean string for the Webhook (no chalk, structured)
    const cleanStr = `[${currentTime}] [PID: ${process.pid}] [${type.toUpperCase()}] ${platformText} [${title}] ${message}`

    // Send the clean string to the Webhook (fire-and-forget)
    try {
        if (!Array.isArray(webhookLogExcludeFunc) || !webhookLogExcludeFunc.some((x: string) => x.toLowerCase() === title.toLowerCase())) {
            // Intentionally not awaited to keep logger synchronous
            Promise.resolve(Webhook(configData, cleanStr)).catch(() => { /* ignore webhook errors */ })
        }
    } catch { /* ignore */ }

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
        message
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
        return new Error(cleanStr)
    }
}
