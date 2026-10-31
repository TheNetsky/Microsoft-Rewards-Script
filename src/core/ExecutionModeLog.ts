import { describeExecutionPlan } from '../config/ExecutionPlan'
import type { BotContext } from './BotContext'

export function logExecutionMode(bot: BotContext): void {
    const plan = describeExecutionPlan(bot.config)
    bot.logger.debug('main', 'RUN-PLAN', JSON.stringify(plan))
    const exp = bot.config.experimental
    const browserMode = bot.config.rewardsMode === 'browser'

    if (browserMode) {
        bot.logger.special(
            'main',
            'REWARDS-MODE',
            'Browser mode enabled - starting desktop-first, trying Daily Set and More Rewards in the flyout before /earn fallbacks, and using rendered controls for web activities.'
        )

        const appApiExceptions = [
            bot.config.workers.doDailyCheckIn && 'doDailyCheckIn',
            bot.config.workers.doAppPromotions && 'doAppPromotions'
        ].filter(Boolean) as string[]
        if (appApiExceptions.length) {
            bot.logger.debug(
                'main',
                'REWARDS-MODE',
                `App-only API exceptions enabled in browser mode: ${appApiExceptions.join(', ')}. ` +
                    'These workers still obtain an app access token and use the Microsoft Rewards app-platform API.'
            )
        }

        if (bot.config.workers.doVisualSearch) {
            bot.logger.debug(
                'main',
                'REWARDS-MODE',
                'doVisualSearch will use the rendered Rewards activation control and Bing Visual Search UI.'
            )
        }
    }

    if (bot.config.workers.doClaimBonusPoints) {
        bot.logger.debug('main', 'REWARDS-MODE', 'doClaimBonusPoints always claims through the API in both modes.')
    }

    if (exp.edgeBrowsing) {
        bot.logger.debug(
            'main',
            'EXPERIMENTAL',
            'edgeBrowsing enabled - runs only on the desktop session, in the background after desktop sign-in, in both Rewards modes.'
        )
    }

    if (browserMode && exp.browserSearchApiReport) {
        bot.logger.special(
            'main',
            'EXPERIMENTAL',
            "browserSearchApiReport enabled: checks today's Bing Search Streak after the desktop search phase and sends one API search only when completion is not confirmed, including when desktop searches are skipped."
        )
    }

    if (!browserMode) {
        bot.logger.special(
            'main',
            'REWARDS-MODE',
            'API mode uses browsers only for sign-in and cookie capture; all activities, searches and Visual Search continue over HTTP.'
        )
        bot.logger.debug(
            'main',
            'REWARDS-MODE',
            `API mode | Desktop: ${plan.desktopSession} | Mobile: ${plan.mobileSession}`
        )
    }
}
