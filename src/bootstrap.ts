import { checkNodeVersion } from './util/Validator'
import { MicrosoftRewardsBot } from './bot/MicrosoftRewardsBot'
import { registerProcessLifecycle } from './bot/ProcessLifecycle'
import { flushAllWebhooks } from './bot/WebhookLifecycle'

export async function main(): Promise<void> {
    checkNodeVersion()

    const rewardsBot = new MicrosoftRewardsBot()
    registerProcessLifecycle(rewardsBot)

    try {
        await rewardsBot.initialize()
        await rewardsBot.run()
    } catch (error) {
        rewardsBot.logger.error('main', 'MAIN-ERROR', error as Error)
    }
}

if (require.main === module) {
    void main().catch(async error => {
        await handleStartupFailure(error)
    })
}

async function handleStartupFailure(error: unknown): Promise<void> {
    const tmpBot = new MicrosoftRewardsBot()
    tmpBot.logger.error('main', 'MAIN-ERROR', error as Error)
    await flushAllWebhooks()
    process.exit(1)
}
