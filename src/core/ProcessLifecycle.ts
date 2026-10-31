import cluster from 'node:cluster'
import { once } from 'node:events'
import type { BotContext } from './BotContext'
import { flushNotifications } from '../logging/Notifications'
import { closeSessionStore } from '../session/SessionStore'
import { flushDiagnostics } from '../util/ErrorDiagnostic'
import { isBrowserClosedError } from '../util/Utils'

export async function flushRunResources(timeoutMs = 5000): Promise<void> {
    await flushNotifications(timeoutMs)
    await flushDiagnostics()
    closeSessionStore()
    await Promise.all([
        new Promise<void>(resolve => process.stdout.write('', () => resolve())),
        new Promise<void>(resolve => process.stderr.write('', () => resolve()))
    ])
}

export function installProcessLifecycle(bot: BotContext): void {
    let shuttingDown = false
    const shutdown = async (code: number, reason: string): Promise<void> => {
        if (shuttingDown) return
        shuttingDown = true
        process.exitCode = code
        bot.cancellation.abort(new Error('Run cancelled'))
        const deadline = setTimeout(() => process.exit(code), 15000)
        deadline.unref()
        bot.logger.warn('main', 'PROCESS', `${reason}; closing sessions and flushing output`)
        const workers = cluster.isPrimary
            ? Object.values(cluster.workers ?? {}).filter(worker => worker && !worker.isDead())
            : []
        const workerExits = workers.map(worker => {
            const exited = once(worker!, 'exit').catch(() => undefined)
            worker!.send({ __control: 'stop' }, () => {})
            return exited
        })
        await flushDiagnostics()
        try {
            await bot.sessions.closeAll()
        } catch {
            /* Continue shutdown if a browser already disconnected. */
        }
        await flushRunResources()
        await Promise.allSettled(workerExits)
        process.exit(code)
    }
    process.once('beforeExit', () => {
        void flushRunResources()
    })
    process.on('SIGINT', () => {
        void shutdown(130, 'SIGINT received')
    })
    process.on('SIGTERM', () => {
        void shutdown(143, 'SIGTERM received')
    })
    process.on('message', message => {
        if (message && typeof message === 'object' && '__control' in message && message.__control === 'stop') {
            void shutdown(143, 'Control API requested stop')
        }
    })
    process.on('uncaughtException', error => {
        if (shuttingDown && isBrowserClosedError(error)) return
        bot.logger.error('main', 'UNCAUGHT-EXCEPTION', error)
        void shutdown(1, 'Uncaught exception')
    })
    process.on('unhandledRejection', reason => {
        if (shuttingDown && isBrowserClosedError(reason)) return
        bot.logger.error('main', 'UNHANDLED-REJECTION', reason instanceof Error ? reason : String(reason))
        void shutdown(1, 'Unhandled rejection')
    })
}
