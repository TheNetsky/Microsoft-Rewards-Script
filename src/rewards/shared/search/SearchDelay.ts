import type { BotContext } from '../../../core/BotContext'

type SearchDelayContext = Pick<BotContext, 'config' | 'logger' | 'signal' | 'utils'>

export async function waitBeforeSearch(bot: SearchDelayContext, isMobile: boolean, activity = 'search'): Promise<void> {
    bot.signal.throwIfAborted()
    const { min, max } = bot.config.searchSettings.searchDelay
    const waitMs = bot.utils.randomDelay(min, max)
    bot.logger.debug(isMobile, 'SEARCH-DELAY', `Search delay checked | activity=${activity} | waitMs=${waitMs}`)
    if (waitMs <= 0) return
    bot.logger.info(isMobile, 'SEARCH-DELAY', `Waiting before next search | activity=${activity} | waitMs=${waitMs}`)
    await bot.utils.wait(waitMs)
    bot.signal.throwIfAborted()
}
