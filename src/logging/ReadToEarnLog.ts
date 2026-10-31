import type { BotContext } from '../core/BotContext'
import type { ActivityResult } from '../rewards/types/ActivityResult'

type ReadLogContext = Pick<BotContext, 'isMobile' | 'logger' | 'userData'>

export function logReadToEarnCredit(bot: ReadLogContext, read: number, result: ActivityResult): void {
    if (result.pointsKnown === false || result.pointsGained <= 0) return
    bot.logger.success(
        bot.isMobile,
        'READ-TO-EARN',
        `Read to Earn points earned | read=${read} | pointsGained=${result.pointsGained}` +
            ` | currentBalance=${bot.userData.currentPoints}`
    )
}

export function logReadToEarnRetry(bot: ReadLogContext, read: number, attempt: number, maxAttempts: number): void {
    bot.logger.info(
        bot.isMobile,
        'READ-TO-EARN',
        `Read to Earn credit not confirmed yet; checking again | read=${read}` +
            ` | check=${attempt}/${maxAttempts} | nextCheck=${attempt + 1}/${maxAttempts}`
    )
}

export function readToEarnSkippedMessage(result: ActivityResult, checks: number): string {
    const credit = result.pointsKnown === false ? 'Credit could not be verified' : 'No points were earned'
    return `${credit} for the last read after ${checks} verification checks; skipping further reads`
}
