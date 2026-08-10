import { BaseActivity } from '../BaseActivity'
import { activateSearchOnBing, findSearchOnBingOffer, getSearchOnBingQueries } from '../search/SearchOnBingShared'

import type { BasePromotion, Dashboard } from '../../../interface/DashboardData'
import { BingSearchApi } from './BingSearchApi'

export class ApiSearchOnBing extends BaseActivity {
    private readonly searchApi = new BingSearchApi(this.bot)

    private gainedPoints = 0
    private success = false
    private oldBalance = 0

    public async doSearchOnBing(promotion: BasePromotion) {
        const offerId = promotion.offerId
        this.oldBalance = Number(this.bot.userData.currentPoints ?? 0)
        this.gainedPoints = 0
        this.success = false

        this.bot.logger.info(
            this.bot.isMobile,
            'SEARCH-ON-BING',
            `Starting SearchOnBing | offerId=${offerId} | title="${promotion.title}" | currentBalance=${this.oldBalance}`
        )

        try {
            if (!(await activateSearchOnBing(this.bot, promotion))) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'SEARCH-ON-BING',
                    `Search activity couldn't be activated, aborting | offerId=${offerId}`
                )
                return
            }

            const queries = await getSearchOnBingQueries(this.bot, promotion)
            await this.searchBing(queries, promotion)

            if (this.success) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'SEARCH-ON-BING',
                    `Completed SearchOnBing | offerId=${offerId} | pointsGained=${this.gainedPoints} | currentBalance=${this.bot.userData.currentPoints} | previousBalance=${this.oldBalance}`,
                    'green'
                )
            } else {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'SEARCH-ON-BING',
                    `Failed SearchOnBing | offerId=${offerId} | pointsGained=${this.gainedPoints} | currentBalance=${this.bot.userData.currentPoints} | previousBalance=${this.oldBalance}`
                )
            }
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'SEARCH-ON-BING',
                `Error in doSearchOnBing | offerId=${offerId} | message=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async searchBing(queries: string[], promotion: BasePromotion) {
        queries = [...new Set(queries)]
        const offerId = promotion.offerId

        const cgDashboard = (await this.bot.browser.func.getDashboardData()).dashboard
        const cg = this.buildCategoryGroup(cgDashboard, offerId)
        this.bot.logger.debug(this.bot.isMobile, 'SEARCH-ON-BING-SEARCH', `Category group | cg=${cg || '(none)'}`)

        this.bot.logger.debug(
            this.bot.isMobile,
            'SEARCH-ON-BING-SEARCH',
            `Starting search loop | queriesCount=${queries.length} | targetPoints=${promotion.pointProgressMax} | currentBalance=${this.oldBalance}`
        )

        let lastBalance = this.oldBalance
        let i = 0

        for (const query of queries) {
            try {
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-ON-BING-SEARCH', `Processing query | query="${query}"`)

                const { ig } = await this.searchApi.report(query, cg ? { cg } : undefined)
                if (!ig) {
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'SEARCH-ON-BING-SEARCH',
                        `No IG returned for query="${query}" - skipping this query`
                    )
                    continue
                }

                await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 7000))

                const dashboard = (await this.bot.browser.func.getDashboardData()).dashboard
                const newBalance = dashboard.userStatus.availablePoints
                const offer = findSearchOnBingOffer(dashboard, offerId)

                const delta = newBalance - lastBalance
                if (delta > 0) {
                    this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + delta
                    lastBalance = newBalance
                }
                this.bot.userData.currentPoints = newBalance
                this.gainedPoints = newBalance - this.oldBalance

                const offerProgress = offer ? `${offer.pointProgress}/${offer.pointProgressMax}` : 'unknown'
                const offerComplete =
                    !!offer &&
                    (offer.complete || (offer.pointProgressMax > 0 && offer.pointProgress >= offer.pointProgressMax))

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SEARCH-ON-BING-SEARCH',
                    `Progress check | query="${query}" | offerProgress=${offerProgress} | offerComplete=${offerComplete} | currentBalance=${newBalance}`
                )

                if (offerComplete) {
                    this.success = true
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'SEARCH-ON-BING-SEARCH',
                        `SearchOnBing activity completed | pointsGained=${this.gainedPoints} | currentBalance=${newBalance} | query="${query}" | offerProgress=${offerProgress}`,
                        'green'
                    )
                    return
                }

                this.bot.logger.warn(
                    this.bot.isMobile,
                    'SEARCH-ON-BING-SEARCH',
                    `${++i}/${queries.length} | activity not complete | offerProgress=${offerProgress} | query="${query}"`
                )
            } catch (error) {
                this.bot.logger.error(
                    this.bot.isMobile,
                    'SEARCH-ON-BING-SEARCH',
                    `Error during search loop | query="${query}" | message=${error instanceof Error ? error.message : String(error)}`
                )
            } finally {
                await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 15000))
            }
        }

        this.bot.logger.warn(
            this.bot.isMobile,
            'SEARCH-ON-BING-SEARCH',
            `Finished all queries without completing the activity | queriesTried=${queries.length} | offerId=${offerId} | pointsGained=${this.gainedPoints} | currentBalance=${this.bot.userData.currentPoints} | previousBalance=${this.oldBalance}`
        )
    }

    private buildCategoryGroup(dashboard: Dashboard, targetOfferId: string): string {
        const pools = [
            ...Object.values(dashboard.dailySetPromotions ?? {}).flat(),
            ...(dashboard.morePromotions ?? []),
            ...(dashboard.promotionalItems ?? []),
            ...(dashboard.promotionalItem ? [dashboard.promotionalItem] : [])
        ]
        const categoryOf = (id: string): string | null => {
            const m = id.match(/(?:^|_)([a-z0-9]+)_exploreonbing/i)
            return m?.[1]?.toLowerCase() ?? null
        }
        const categories = new Set<string>()
        const target = categoryOf(targetOfferId)
        if (target) categories.add(target)
        for (const offer of pools) {
            const cat = categoryOf(offer.offerId ?? '')
            if (cat) categories.add(cat)
        }
        return [...categories].join(',')
    }
}
