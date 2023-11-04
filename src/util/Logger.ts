import { Webhook } from './Webhook'

export function log(title: string, message: string, type?: 'log' | 'warn' | 'error') {
    const currentTime = new Date().toLocaleString()

    let str = ''

    switch (type) {
        case 'warn':
            str = `[${currentTime}] [PID: ${process.pid}] [WARN] [${title}] ${message}`
            console.warn(str)
            break

        case 'error':
            str = `[${currentTime}] [PID: ${process.pid}] [ERROR] [${title}] ${message}`
            console.error(str)
            break

        default:
            str = `[${currentTime}] [PID: ${process.pid}] [LOG] [${title}] ${message}`
            console.log(str)
            break
    }

    if (str) Webhook(str)
}