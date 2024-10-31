import chalk from 'chalk'

import { Webhook } from './Webhook'

export function log(isMobile: boolean | 'main', title: string, message: string, type: 'log' | 'warn' | 'error' = 'log', color?: keyof typeof chalk): void {
    const currentTime = new Date().toLocaleString()
    const platformText = isMobile === 'main' ? 'MAIN' : isMobile ? 'MOBILE' : 'DESKTOP'
    const chalkedPlatform = isMobile === 'main' ? chalk.bgCyan('MAIN') : isMobile ? chalk.bgBlue('MOBILE') : chalk.bgMagenta('DESKTOP')

    // Clean string for the Webhook (no chalk)
    const cleanStr = `[${currentTime}] [PID: ${process.pid}] [${type.toUpperCase()}] ${platformText} [${title}] ${message}`

    // Send the clean string to the Webhook
    Webhook(cleanStr)

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