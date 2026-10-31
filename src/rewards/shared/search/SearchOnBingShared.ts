import { waitBeforeSearch } from './SearchDelay'

import type { BasePromotion, RewardsDashboard } from '../../types/RewardsState'
import type { BotContext } from '../../../core/BotContext'
import { getWebPromotions } from '../Promotion'
import { isPromotionComplete } from '../PromotionEligibility'

export function findSearchOnBingOffer(dashboard: RewardsDashboard, offerId: string): BasePromotion | undefined {
    return getWebPromotions(dashboard).find(offer => offer.offerId === offerId)
}

interface SearchOnBingOperations {
    search(query: string): Promise<{ balance: number; offer?: BasePromotion } | null>
    confirm?(): void
}

export function remainingSearchOnBingAttempts(bot: BotContext, offerId: string): number {
    return Math.max(
        0,
        bot.config.searchSettings.maxSearchOnBingAttempts -
            (bot.accountState.searchOnBingAttempts.get(offerId)?.size ?? 0)
    )
}

export async function runSearchOnBingQueries(
    bot: BotContext,
    promotion: BasePromotion,
    queries: string[],
    oldBalance: number,
    operations: SearchOnBingOperations
): Promise<boolean> {
    const offerId = promotion.offerId
    const limit = bot.config.searchSettings.maxSearchOnBingAttempts
    const attempted = bot.accountState.searchOnBingAttempts.get(offerId) ?? new Set<string>()
    bot.accountState.searchOnBingAttempts.set(offerId, attempted)
    queries = [...new Set(queries.map(query => query.trim()).filter(Boolean))]
        .filter(query => !attempted.has(query))
        .slice(0, remainingSearchOnBingAttempts(bot, offerId))
    if (!queries.length) {
        bot.logger.debug(
            bot.isMobile,
            'SEARCH-ON-BING',
            `No unused Explore on Bing attempts remain | attempts=${attempted.size}/${limit} | offerId=${offerId}`
        )
        return false
    }
    bot.logger.debug(
        bot.isMobile,
        'SEARCH-ON-BING-SEARCH',
        `Starting search loop | queriesCount=${queries.length} | attemptsUsed=${attempted.size} | maxAttempts=${limit}` +
            ` | targetPoints=${promotion.pointProgressMax} | currentBalance=${oldBalance}`
    )

    let completed = false
    for (const [index, query] of queries.entries()) {
        bot.signal.throwIfAborted()
        if (attempted.size >= limit) break
        if (attempted.has(query)) continue
        try {
            attempted.add(query)
            bot.logger.info(
                bot.isMobile,
                'SEARCH-ON-BING',
                `Searching Explore on Bing | search=${attempted.size}/${limit} | query=${JSON.stringify(query)}`
            )
            const progress = await operations.search(query)
            if (!progress) continue
            const { balance, offer } = progress
            bot.userData.currentPoints = balance
            const offerProgress = offer ? `${offer.pointProgress}/${offer.pointProgressMax}` : 'unknown'
            const offerComplete = isPromotionComplete(offer)
            bot.logger.debug(
                bot.isMobile,
                'SEARCH-ON-BING-SEARCH',
                `Progress check | query="${query}" | offerProgress=${offerProgress} | offerComplete=${offerComplete} | currentBalance=${balance}`
            )
            if (offerComplete) {
                operations.confirm?.()
                completed = true
                bot.logger.debug(
                    bot.isMobile,
                    'SEARCH-ON-BING-SEARCH',
                    `SearchOnBing activity completed | currentBalance=${balance} | query="${query}" | offerProgress=${offerProgress}`
                )
                return true
            }
            bot.logger.debug(
                bot.isMobile,
                'SEARCH-ON-BING-SEARCH',
                `${index + 1}/${queries.length} | activity not complete | offerProgress=${offerProgress} | query="${query}"`
            )
        } catch (error) {
            bot.signal.throwIfAborted()
            bot.logger.error(
                bot.isMobile,
                'SEARCH-ON-BING-SEARCH',
                `Error during search loop | query="${query}" | message=${error instanceof Error ? error.message : String(error)}`
            )
        } finally {
            if (!completed && index < queries.length - 1 && attempted.size < limit) {
                await waitBeforeSearch(bot, bot.isMobile, 'search-on-bing')
            }
        }
    }
    bot.logger.debug(
        bot.isMobile,
        'SEARCH-ON-BING-SEARCH',
        `Finished search attempts without completing the activity | queriesTried=${attempted.size} | maxAttempts=${limit}` +
            ` | offerId=${offerId} | currentBalance=${bot.userData.currentPoints} | previousBalance=${oldBalance}`
    )
    if (attempted.size >= limit) {
        bot.logger.warn(
            bot.isMobile,
            'SEARCH-ON-BING',
            `Explore on Bing remains incomplete after ${attempted.size}/${limit} attempts; leaving it for the next run` +
                ` | title=${JSON.stringify(promotion.title)}`
        )
    }
    return false
}
