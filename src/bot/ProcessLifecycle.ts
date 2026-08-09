import type { MicrosoftRewardsBot } from './MicrosoftRewardsBot'
import { flushAllWebhooks } from './WebhookLifecycle'
import { isBrowserClosedError } from '../util/Utils'

export function registerProcessLifecycle(rewardsBot: MicrosoftRewardsBot): void {
    process.on('beforeExit', () => {
        void flushAllWebhooks()
    })

    process.on('SIGINT', async () => {
        rewardsBot.logger.warn('main', 'PROCESS', 'SIGINT received, flushing and exiting...')
        await flushAllWebhooks()
        process.exit(130)
    })

    process.on('SIGTERM', async () => {
        rewardsBot.logger.warn('main', 'PROCESS', 'SIGTERM received, flushing and exiting...')
        await flushAllWebhooks()
        process.exit(143)
    })

    process.on('uncaughtException', async error => {
        if (isBrowserClosedError(error)) {
            rewardsBot.logger.debug(
                'main',
                'UNCAUGHT-EXCEPTION',
                `Ignoring benign browser-closed error during teardown | ${error instanceof Error ? error.message : String(error)}`
            )
            return
        }
        rewardsBot.logger.error('main', 'UNCAUGHT-EXCEPTION', error)
        await flushAllWebhooks()
        process.exit(1)
    })

    process.on('unhandledRejection', async reason => {
        if (isBrowserClosedError(reason)) {
            rewardsBot.logger.debug(
                'main',
                'UNHANDLED-REJECTION',
                `Ignoring benign browser-closed rejection during teardown | ${reason instanceof Error ? reason.message : String(reason)}`
            )
            return
        }
        rewardsBot.logger.error('main', 'UNHANDLED-REJECTION', reason as Error)
        await flushAllWebhooks()
        process.exit(1)
    })
}
