import type { BotContext } from '../../core/BotContext'
import type { BasePromotion } from '../types/RewardsState'
import type { PromotionSource } from '../types/PromotionContext'
import { withActivityBalance } from './ActivityBalance'

type PacingContext = Pick<
    BotContext,
    'accountState' | 'config' | 'isMobile' | 'logger' | 'signal' | 'utils' | 'userData'
>

export async function runTaskWithDelay<T>(
    bot: PacingContext,
    operation: () => Promise<T>,
    activity?: { source: PromotionSource; promotion: Pick<BasePromotion, 'title' | 'offerId'> } | string
): Promise<T> {
    const platform = bot.isMobile ? 'mobile' : 'desktop'
    const context =
        typeof activity === 'string'
            ? `activity=${activity}`
            : activity
              ? `activity=${activity.source} | offerId=${activity.promotion.offerId} | title=${JSON.stringify(activity.promotion.title)}`
              : 'activity=task'
    bot.signal.throwIfAborted()
    const remaining = Math.max(0, (bot.accountState.taskReadyAt.get(platform) ?? 0) - Date.now())
    bot.logger.debug(bot.isMobile, 'TASK-DELAY', `Task delay checked | ${context} | waitMs=${remaining}`)
    if (remaining > 0) {
        bot.logger.info(bot.isMobile, 'TASK-DELAY', `Waiting before next task | ${context} | waitMs=${remaining}`)
        await bot.utils.wait(remaining)
    }
    bot.signal.throwIfAborted()

    let result: T | undefined
    try {
        result = await withActivityBalance(bot, operation)
        return result
    } finally {
        const skipped = result && typeof result === 'object' && 'status' in result && result.status === 'skipped'
        if (!skipped) {
            const { min, max } = bot.config.taskDelay
            const delay = bot.utils.randomDelay(min, max)
            const readyAt = Date.now() + delay
            bot.accountState.taskReadyAt.set(platform, readyAt)
            bot.logger.debug(
                bot.isMobile,
                'TASK-DELAY',
                `Task delay scheduled | ${context} | delayMs=${delay} | readyAt=${new Date(readyAt).toISOString()}`
            )
        } else {
            bot.logger.debug(bot.isMobile, 'TASK-DELAY', `Task delay unchanged | ${context} | reason=task-skipped`)
        }
    }
}
