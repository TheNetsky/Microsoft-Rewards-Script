import chalk from 'chalk';
import { Webhook } from './Webhook';
import { Ntfy } from './Ntfy';

export function log(isMobile: boolean | 'main', title: string, message: string, type: 'log' | 'warn' | 'error' = 'log', color?: keyof typeof chalk): void {
    const currentTime = new Date().toLocaleString();
    const platformText = isMobile === 'main' ? 'MAIN' : isMobile ? 'MOBILE' : 'DESKTOP';
    const chalkedPlatform = isMobile === 'main' ? chalk.bgCyan('MAIN') : isMobile ? chalk.bgBlue('MOBILE') : chalk.bgMagenta('DESKTOP');

    // Clean string for Webhook and NTFY (no chalk formatting)
    const cleanStr = `[${currentTime}] [PID: ${process.pid}] [${type.toUpperCase()}] ${platformText} [${title}] ${message}`;

    // Send to Webhook if enabled
    Webhook(cleanStr);

    // Send to NTFY only for specific logs
    if (type === 'warn' || type === 'error' || 
        message.toLowerCase().includes('completed tasks for') || 
        message.toLowerCase().includes('press the number') || 
        message.includes('2FA')) {
        Ntfy(cleanStr);
    }

    // Formatted string with chalk for terminal logging
    const str = `[${currentTime}] [PID: ${process.pid}] [${type.toUpperCase()}] ${chalkedPlatform} [${title}] ${message}`;

    const applyChalk = color && typeof chalk[color] === 'function' ? chalk[color] as (msg: string) => string : null;

    // Log based on type
    switch (type) {
        case 'warn':
            applyChalk ? console.warn(applyChalk(str)) : console.warn(str);
            break;

        case 'error':
            applyChalk ? console.error(applyChalk(str)) : console.error(str);
            break;

        default:
            applyChalk ? console.log(applyChalk(str)) : console.log(str);
            break;
    }
}
