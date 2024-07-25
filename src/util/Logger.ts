import { Webhook } from './Webhook'
import cluster from 'cluster'
import {loadConfig} from './Load'

let timer: NodeJS.Timeout | null = null

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

    if (cluster.isMaster) {
        // 如果是主进程，不设置定时器，直接返回
        return
    }
    if (timer) {
        clearTimeout(timer)
    }
    timer = setTimeout(() => {
        process.exit(1)
        // Set a timer. If it is not triggered for a period of time, it will end abnormally.
    }, loadConfig().restartTime)

}