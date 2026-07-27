import { SearchQueryQueue } from '../../SearchQueryQueue'
import { Workers } from '../../Workers'
import { BonusTracker } from '../SearchBonus'

const STAGNANT_LIMIT = 10
const MAX_SEARCHES = 60

export class Search extends Workers {
    public async doSearch(isMobile: boolean): Promise<number> {
        const startBalance = Number(this.bot.userData.currentPoints ?? 0)
        let totalGained = 0

        this.bot.logger.info(isMobile, 'SEARCH-BING', `Starting Bing searches | currentBalance=${startBalance}`)

        try {
            const missing = this.bot.browser.func.missingSearchPoints(
                await this.bot.browser.func.getSearchPoints(),
                isMobile
            )
            this.bot.logger.info(
                isMobile,
                'SEARCH-BING',
                `Search points remaining | edge=${missing.edgePoints} | desktop=${missing.desktopPoints} | mobile=${missing.mobilePoints}`
            )
            if (missing.totalPoints <= 0) {
                this.bot.logger.info(isMobile, 'SEARCH-BING', 'No search points to earn, skipping')
                return 0
            }

            const queryQueue = new SearchQueryQueue(this.bot)
            const topicCount = await queryQueue.prepare()
            if (!topicCount) {
                this.bot.logger.warn(isMobile, 'SEARCH-BING', 'No main search topics available, skipping')
                return 0
            }
            this.bot.logger.info(
                isMobile,
                'SEARCH-BING',
                `Query queue ready | mainTopics=${topicCount} | clusterSearch=${this.bot.config.searchSettings.clusterSearch}`
            )

            let stagnant = 0
            let performed = 0
            let lastEarned: number | null = null

            while (performed < MAX_SEARCHES) {
                const query = await queryQueue.next()
                if (!query) {
                    this.bot.logger.warn(isMobile, 'SEARCH-BING', 'Query queue exhausted, stopping')
                    break
                }

                const res = await this.bot.browser.func.reportSearchActivity(query)
                performed++

                if (!res.ig) {
                    this.bot.logger.warn(isMobile, 'SEARCH-BING', `No IG for query="${query}" - skipping`)
                    continue
                }

                if (res.balance != null) this.bot.userData.currentPoints = res.balance

                const earned = res.searchPointsEarned
                const limit = res.searchPointsLimit
                const capReached = earned != null && limit != null && limit > 0 && earned >= limit
                const cap = earned != null && limit != null ? `${earned}/${limit}` : 'n/a'

                const gained = res.gained ?? 0
                const searchProgress = earned != null && lastEarned != null ? earned - lastEarned : gained
                if (earned != null) lastEarned = earned

                if (gained > 0) {
                    totalGained += gained
                    this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + gained
                }

                if (searchProgress > 0) {
                    stagnant = 0
                    this.bot.logger.info(
                        isMobile,
                        'SEARCH-BING',
                        `pointsGained=${gained} | currentBalance=${res.balance} | query="${query}" | searchPts=${cap}`,
                        'green'
                    )
                } else {
                    stagnant++
                    this.bot.logger.info(
                        isMobile,
                        'SEARCH-BING',
                        `No points gained ${stagnant}/${STAGNANT_LIMIT} | query="${query}" | searchPts=${cap}`
                    )
                }

                if (capReached) {
                    this.bot.logger.info(
                        isMobile,
                        'SEARCH-BING',
                        `Search point cap reached (${cap}), stopping`,
                        'green'
                    )
                    break
                }

                if (stagnant >= STAGNANT_LIMIT) {
                    this.bot.logger.warn(
                        isMobile,
                        'SEARCH-BING',
                        `No points for ${STAGNANT_LIMIT} searches in a row, aborting`
                    )
                    break
                }

                await this.bot.utils.wait(
                    this.bot.utils.randomDelay(
                        this.bot.config.searchSettings.searchDelay.min,
                        this.bot.config.searchSettings.searchDelay.max
                    )
                )
            }

            this.bot.logger.info(
                isMobile,
                'SEARCH-BING',
                `Completed Bing searches | pointsGained=${totalGained} | currentBalance=${this.bot.userData.currentPoints} | previousBalance=${startBalance} | searches=${performed}`
            )
            return totalGained
        } catch (error) {
            this.bot.logger.error(
                isMobile,
                'SEARCH-BING',
                `Error in doSearch | ${error instanceof Error ? error.message : String(error)}`
            )
            return totalGained
        }
    }

    public async doBonusSearches(): Promise<number> {
        const isMobile = this.bot.isMobile
        const tracker = new BonusTracker(this.bot, isMobile)

        const ready = await tracker.prepare()
        if (!ready || !tracker.started) return 0

        let totalGained = 0
        let performed = 0
        let stagnant = 0

        try {
            const queryQueue = new SearchQueryQueue(this.bot)
            const topicCount = await queryQueue.prepare()
            if (!topicCount) {
                this.bot.logger.warn(isMobile, tracker.context, 'No main search topics available, skipping')
                return 0
            }
            this.bot.logger.info(
                isMobile,
                tracker.context,
                `Query queue ready | mainTopics=${topicCount} | clusterSearch=${this.bot.config.searchSettings.clusterSearch}`
            )

            while (!tracker.done() && performed < tracker.maxSearches && stagnant < tracker.stagnantLimit) {
                const query = await queryQueue.next()
                if (!query) {
                    this.bot.logger.warn(isMobile, tracker.context, 'Query queue exhausted, stopping')
                    break
                }

                const res = await this.bot.browser.func.reportSearchActivity(query)
                performed++

                if (!res.ig) {
                    this.bot.logger.warn(isMobile, tracker.context, `No IG for query="${query}" - skipping`)
                    continue
                }

                const gained = await tracker.measure()
                if (gained > 0) {
                    stagnant = 0
                    totalGained += gained
                    this.bot.logger.info(
                        isMobile,
                        tracker.context,
                        `pointsGained=${gained} | currentBalance=${this.bot.userData.currentPoints} | query="${query}" | ${tracker.progress()}`,
                        'green'
                    )
                } else {
                    stagnant++
                    this.bot.logger.info(
                        isMobile,
                        tracker.context,
                        `no points ${stagnant}/${tracker.stagnantLimit} | query="${query}" | ${tracker.progress()}`
                    )
                }

                await this.bot.utils.wait(
                    this.bot.utils.randomDelay(
                        this.bot.config.searchSettings.searchDelay.min,
                        this.bot.config.searchSettings.searchDelay.max
                    )
                )
            }
        } catch (error) {
            this.bot.logger.error(
                isMobile,
                tracker.context,
                `Bonus session error | ${error instanceof Error ? error.message : String(error)}`
            )
        }

        const done = tracker.done() && !tracker.offerLost
        const reason = done
            ? 'offer complete'
            : tracker.offerLost
              ? 'offer no longer present'
              : performed >= tracker.maxSearches
                ? 'reached maxBonusSearches'
                : stagnant >= tracker.stagnantLimit
                  ? `${tracker.stagnantLimit} idle searches`
                  : 'query pool exhausted'

        this.bot.logger.info(
            isMobile,
            tracker.context,
            `Bonus farming ${done ? 'complete' : 'stopped'} (${reason}) | pointsGained=${totalGained} | currentBalance=${this.bot.userData.currentPoints} | ${tracker.progress()} | searches=${performed}`,
            done || totalGained > 0 ? 'green' : undefined
        )
        return totalGained
    }
}
