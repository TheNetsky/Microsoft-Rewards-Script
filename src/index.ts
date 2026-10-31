import cluster from 'node:cluster'
import { createBot } from './core/createBot'
import { loadConfig } from './config/Load'
import { checkNodeVersion } from './config/Validator'
import { flushRunResources, installProcessLifecycle } from './core/ProcessLifecycle'
import { logSystemMessage } from './logging/LogEvent'

async function main(): Promise<void> {
    checkNodeVersion()
    const bot = createBot(loadConfig())
    installProcessLifecycle(bot.context)
    try {
        await bot.initialize()
        await bot.run()
    } finally {
        if (cluster.isPrimary) {
            await bot.context.sessions.closeAll()
            await flushRunResources()
            if (process.connected) process.disconnect()
        }
    }
}

if (require.main === module) {
    main().catch(async (error: unknown) => {
        logSystemMessage('error', 'MAIN-ERROR', error instanceof Error ? error.message : String(error))
        await flushRunResources()
        process.exitCode = 1
        if (process.connected) process.disconnect()
    })
}
