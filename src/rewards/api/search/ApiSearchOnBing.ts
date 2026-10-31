import { OfferVerifier } from '../../shared/OfferVerifier'
import { activityResult, activityFailure, type ActivityResult } from '../../shared/ActivityResult'
import { activateSearchOnBing } from '../actions/ActivateSearchOnBing'
import { BaseActivity } from '../../shared/activities/BaseActivity'
import {
    findSearchOnBingOffer,
    remainingSearchOnBingAttempts,
    runSearchOnBingQueries
} from '../../shared/search/SearchOnBingShared'
import { getSearchOnBingQueries, searchOnBingCategory } from '../../shared/search/SearchOnBingQueries'
import { getWebPromotions } from '../../shared/Promotion'
import { isTerminalHttpError } from '../../../network/HttpError'

import type { BasePromotion, RewardsDashboard } from '../../types/RewardsState'
import { BingSearchApi } from './BingSearchApi'

export class ApiSearchOnBing extends BaseActivity {
    private readonly searchApi = new BingSearchApi(this.bot)

    private oldBalance = 0

    async run(promotion: BasePromotion): Promise<ActivityResult> {
        const offerId = promotion.offerId
        this.oldBalance = Number(this.bot.userData.currentPoints ?? 0)

        this.bot.logger.info(
            this.bot.isMobile,
            'SEARCH-ON-BING',
            `Starting SearchOnBing | offerId=${offerId} | title="${promotion.title}" | currentBalance=${this.oldBalance}`
        )

        const verifier = new OfferVerifier(this.bot, offerId)
        if (await verifier.capture()) return activityResult('skipped', 'already-complete', offerId)
        try {
            if (!remainingSearchOnBingAttempts(this.bot, offerId)) {
                return await verifier.verify(activityResult('unconfirmed', 'search-attempt-limit-reached', offerId))
            }
            const queries = await getSearchOnBingQueries(this.bot, promotion)
            if (!queries.length)
                return await verifier.verify(activityResult('unconfirmed', 'search-query-unavailable', offerId))
            if (!(await activateSearchOnBing(this.bot, promotion))) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'SEARCH-ON-BING',
                    `Search activity couldn't be activated, aborting | offerId=${offerId}`
                )
                return await verifier.verify(activityResult('unconfirmed', 'activation-not-confirmed', offerId))
            }

            const success = await this.searchBing(queries, promotion)

            const result = await verifier.verify(
                activityResult(
                    success ? 'confirmed' : 'unconfirmed',
                    success ? 'offer-complete' : 'offer-not-confirmed',
                    offerId
                )
            )
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-ON-BING',
                `SearchOnBing verified | offerId=${offerId} | status=${result.status}` +
                    ` | pointsGained=${result.pointsKnown ? result.pointsGained : 'unknown'}` +
                    ` | currentBalance=${this.bot.userData.currentPoints} | previousBalance=${this.oldBalance}`
            )
            return result
        } catch (error) {
            this.bot.signal.throwIfAborted()
            if (isTerminalHttpError(error)) throw error
            this.bot.logger.error(
                this.bot.isMobile,
                'SEARCH-ON-BING',
                `Error in doSearchOnBing | offerId=${offerId} | message=${error instanceof Error ? error.message : String(error)}`
            )
            return await verifier.verify(activityFailure(error, offerId))
        }
    }

    private async searchBing(queries: string[], promotion: BasePromotion): Promise<boolean> {
        const offerId = promotion.offerId

        const cgDashboard = (await this.bot.rewards.getDashboardData()).dashboard
        const cg = this.buildCategoryGroup(cgDashboard, offerId)
        this.bot.logger.debug(this.bot.isMobile, 'SEARCH-ON-BING-SEARCH', `Category group | cg=${cg || '(none)'}`)

        return runSearchOnBingQueries(this.bot, promotion, queries, this.oldBalance, {
            search: async query => {
                const { ig } = await this.searchApi.report(query, { cg: cg || undefined, retries: 0 })
                if (!ig) {
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'SEARCH-ON-BING-SEARCH',
                        `No IG returned for query="${query}" - skipping this query`
                    )
                    return null
                }

                await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 7000))

                const dashboard = (await this.bot.rewards.getDashboardData()).dashboard
                return {
                    balance: dashboard.userStatus.availablePoints,
                    offer: findSearchOnBingOffer(dashboard, offerId)
                }
            }
        })
    }

    private buildCategoryGroup(dashboard: RewardsDashboard, targetOfferId: string): string {
        const categories = new Set<string>()
        const target = searchOnBingCategory(targetOfferId)
        if (target) categories.add(target)
        for (const offer of getWebPromotions(dashboard)) {
            const cat = searchOnBingCategory(offer)
            if (cat) categories.add(cat)
        }
        return [...categories].join(',')
    }
}
