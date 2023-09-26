import { Webhook } from './Webhook'

export function log(title: string, message: string, type?: 'log' | 'warn' | 'error') {
    const currentTime = new Date().toISOString()

    let str = ''

    switch (type) {
        case 'warn':
            str = `[${currentTime}] [WARN] [${title}] ${message}`
            console.warn(str)
            break

        case 'error':
            str = `[${currentTime}] [ERROR] [${title}] ${message}`
            console.error(str)
            break

        default:
            str = `[${currentTime}] [LOG] [${title}] ${message}`
            console.log(str)
            break
    }

    if (str) Webhook(str)
}