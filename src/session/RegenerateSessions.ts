import { createBot } from '../core/createBot'
import { loadAccounts, loadConfig } from '../config/Load'
import { checkNodeVersion } from '../config/Validator'
import { flushRunResources, installProcessLifecycle } from '../core/ProcessLifecycle'
import { logSystemMessage } from '../logging/LogEvent'
import { resolveSessionOptions } from './SessionGeneration'
import { SessionGenerator } from './SessionGenerator'

function parseSessionGenerationArgs(args: string[]) {
    let platform: string | undefined
    let fresh = true
    for (let index = 0; index < args.length; index++) {
        const arg = args[index]
        if (arg === '--platform' && platform === undefined) {
            platform = args[++index]
            if (platform === undefined) throw new Error('--platform requires desktop, mobile, or both')
        } else if (arg === '--reuse') {
            fresh = false
        } else {
            throw new Error(`Unknown session-generation argument: ${arg}`)
        }
    }
    return resolveSessionOptions({ platform, fresh })
}

async function main(): Promise<void> {
    checkNodeVersion()
    const options = parseSessionGenerationArgs(process.argv.slice(2))
    const bot = createBot(loadConfig())
    installProcessLifecycle(bot.context)
    try {
        const result = await new SessionGenerator(bot.context).run(loadAccounts(), options)
        process.exitCode = result.failed ? 1 : 0
    } finally {
        await bot.context.sessions.closeAll()
        await flushRunResources()
        if (process.connected) process.disconnect()
    }
}

if (require.main === module) {
    main().catch(async (error: unknown) => {
        logSystemMessage('error', 'SESSIONS-ERROR', error instanceof Error ? error.message : String(error))
        await flushRunResources()
        process.exitCode = 1
        if (process.connected) process.disconnect()
    })
}
