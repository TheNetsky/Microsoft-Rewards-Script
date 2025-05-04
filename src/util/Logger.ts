import chalk from 'chalk'

import { Webhook } from './Webhook'
import { Ntfy } from './Ntfy'
import { loadConfig } from './Load'

export async function log(isMobile: boolean | 'main', title: string, message: string, type: 'log' | 'warn' | 'error' = 'log', color?: keyof typeof chalk) {
    const configData = loadConfig()

    if (configData.logExcludeFunc.some(x => x.toLowerCase() === title.toLowerCase())) {
        return
    }

    const currentTime = new Date().toLocaleString()
    const platformText = isMobile === 'main' ? 'MAIN' : isMobile ? 'MOBILE' : 'DESKTOP'
    const chalkedPlatform = isMobile === 'main' ? chalk.bgCyan('MAIN') : isMobile ? chalk.bgBlue('MOBILE') : chalk.bgMagenta('DESKTOP')

    // Clean string for the Webhook (no chalk)
    const cleanStr = `[${currentTime}] [PID: ${process.pid}] [${type.toUpperCase()}] ${platformText} [${title}] ${message}`

    // Send the clean string to the Webhook
    if (!configData.webhookLogExcludeFunc.some(x => x.toLowerCase() === title.toLowerCase())) {
        Webhook(configData, cleanStr)
    }

    // Define conditions for sending to NTFY 
    const ntfyConditions = {
        log: [
            message.toLowerCase().includes('started tasks for account'),
            message.toLowerCase().includes('press the number'),
            message.toLowerCase().includes('completed tasks for account'),
            message.toLowerCase().includes('the script collected'),
            message.toLowerCase().includes('no points to earn')
        ], // Add or customize keywords for log messages here
        error: [
            message.toLowerCase().includes('error')
        ], // Add or customize keywords for error messages here
        warn: [
            message.toLowerCase().includes('aborting'),
            message.toLowerCase().includes('didn\'t gain')
        ] // Add or customize keywords for warning messages here
    }

    // Check if the current log type and message meet the NTFY conditions
    if (type in ntfyConditions && ntfyConditions[type as keyof typeof ntfyConditions].some(condition => condition))
        await Ntfy(cleanStr, type)
    
    // Formatted string with chalk for terminal logging
    const str = `[${currentTime}] [PID: ${process.pid}] [${type.toUpperCase()}] ${chalkedPlatform} [${title}] ${message}`

    const applyChalk = color && typeof chalk[color] === 'function' ? chalk[color] as (msg: string) => string : null

    // Log based on the type
    switch (type) {
        case 'warn':
            applyChalk ? console.warn(applyChalk(str)) : console.warn(str)
            break

        case 'error':
            applyChalk ? console.error(applyChalk(str)) : console.error(str)
            break

        default:
            applyChalk ? console.log(applyChalk(str)) : console.log(str)
            break
    }
}
