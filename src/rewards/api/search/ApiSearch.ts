import { waitBeforeSearch } from '../../shared/search/SearchDelay'
import { activityFailure, activityResult } from '../../shared/ActivityResult'
import { SearchQueryQueue } from '../../shared/query/SearchQueryQueue'
import { formatSearchQuery } from '../../shared/query/QueryContext'
import { BaseActivity } from '../../shared/activities/BaseActivity'
import { BonusTracker } from '../../shared/search/BonusTracker'
import { SearchProgress } from '../../shared/search/SearchProgress'
import { BingSearchApi } from './BingSearchApi'

const STAGNANT_LIMIT = 10
const MAX_SEARCHES = 60
const DASHBOARD_REFRESH_EVERY = 5

export class ApiSearch extends BaseActivity {
    private readonly searchApi = new BingSearchApi(this.bot)
    private readonly searchProgress = new SearchProgress(this.bot)

    async search(isMobile: boolean): Promise<number | null> {
        const startBalance = Number(this.bot.userData.currentPoints ?? 0)

        this.bot.logger.info(isMobile, 'SEARCH-BING', `Starting Bing searches | currentBalance=${startBalance}`)

        try {
            const missing = await this.searchProgress.getMissing(isMobile)
            if (missing.available === false) throw new Error('Search quota unavailable')
            this.bot.logger.info(
                isMobile,
                'SEARCH-BING',
                `Search points remaining | edge=${missing.edgePoints} | desktop=${missing.desktopPoints} | mobile=${missing.mobilePoints}`
            )
            const zeroPointRun = missing.totalPoints <= 0 && this.bot.config.searchSettings.runOnZeroPoints
            if (missing.totalPoints <= 0 && !zeroPointRun) {
                this.bot.recordActivity('search', activityResult('skipped', 'already-complete'))
                this.bot.logger.debug(isMobile, 'SEARCH-BING', 'No search points to earn, skipping')
                return 0
            }
            let remainingPoints = missing.totalPoints
            let previousQuota = missing

            const queryQueue = new SearchQueryQueue(this.bot)
            const topicCount = await queryQueue.prepare()
            if (!topicCount) {
                this.bot.recordActivity('search', activityResult('unconfirmed', 'query-source-unavailable'))
                this.bot.logger.warn(isMobile, 'SEARCH-BING', 'No main search topics available, skipping')
                return 0
            }

            let stagnant = 0
            let performed = 0
            let lastEarned: number | null = null
            let searchesSinceMeasurement = 0

            while (performed < MAX_SEARCHES) {
                this.bot.signal.throwIfAborted()
                const selected = await queryQueue.next()
                if (!selected) {
                    this.bot.logger.warn(isMobile, 'SEARCH-BING', 'Query queue exhausted, stopping')
                    break
                }
                const query = selected.text

                this.bot.logger.info(
                    isMobile,
                    'SEARCH-BING',
                    `Searching | search=${performed + 1} | ${formatSearchQuery(selected)} | remaining=${remainingPoints}`
                )

                const res = await this.searchApi.report(query)
                performed++
                searchesSinceMeasurement++

                if (!res.ig) {
                    this.bot.logger.warn(isMobile, 'SEARCH-BING', `No IG for query="${query}" - skipping`)
                    continue
                }

                if (res.balance != null) this.bot.userData.currentPoints = res.balance

                const earned = res.searchPointsEarned
                const limit = res.searchPointsLimit
                const responseCapReached = earned != null && limit != null && limit > 0 && earned >= limit
                const cap = earned != null && limit != null ? `${earned}/${limit}` : 'n/a'

                let gained: number | null = null
                const responseProgress = earned != null && lastEarned != null ? Math.max(0, earned - lastEarned) : 0
                if (earned != null) lastEarned = earned

                let dashboardProgress: number | null = null
                let dashboardChecked = false
                let measuredSearches = 0
                const shouldRefreshDashboard =
                    performed === 1 ||
                    performed % DASHBOARD_REFRESH_EVERY === 0 ||
                    earned == null ||
                    limit == null ||
                    responseProgress <= 0 ||
                    responseCapReached

                if (shouldRefreshDashboard) {
                    try {
                        const updated = await this.searchProgress.getMissing(isMobile)
                        if (updated.available === false)
                            throw new Error('Search counter unavailable; progress cannot be confirmed')
                        dashboardProgress = this.searchProgress.gained(previousQuota, updated)
                        gained = dashboardProgress
                        previousQuota = updated
                        remainingPoints = updated.totalPoints
                        dashboardChecked = dashboardProgress !== null
                        measuredSearches = searchesSinceMeasurement
                        searchesSinceMeasurement = 0
                    } catch (error) {
                        this.bot.signal.throwIfAborted()
                        this.bot.logger.debug(
                            isMobile,
                            'SEARCH-BING',
                            `Could not refresh the ${isMobile ? 'mobile' : 'desktop'} search quota | ${
                                error instanceof Error ? error.message : String(error)
                            }`
                        )
                    }
                }

                const searchProgress =
                    dashboardProgress === null ? responseProgress : Math.max(dashboardProgress, responseProgress)
                const capReached = dashboardChecked ? remainingPoints <= 0 : responseCapReached

                if (searchProgress > 0) {
                    stagnant = 0
                    this.bot.logger.success(
                        isMobile,
                        'SEARCH-BING',
                        `${measuredSearches > 1 ? 'batch ' : ''}pointsGained=${gained ?? 'unknown'}` +
                            ` | currentBalance=${this.bot.userData.currentPoints} | query="${query}"` +
                            ` | searchesMeasured=${measuredSearches} | searchCounterIncrease=${responseProgress}` +
                            ` | remaining=${remainingPoints} | searchPts=${cap}`
                    )
                } else {
                    stagnant++
                    this.bot.logger.debug(
                        isMobile,
                        'SEARCH-BING',
                        `No confirmed search progress ${stagnant}/${STAGNANT_LIMIT} | query="${query}"` +
                            ` | remaining=${remainingPoints} | searchPts=${cap}`
                    )
                }

                if (capReached && !zeroPointRun) {
                    this.bot.logger.debug(
                        isMobile,
                        'SEARCH-BING',
                        `${isMobile ? 'Mobile' : 'Desktop'} search quota complete` +
                            ` | remaining=${remainingPoints} | responseSearchPts=${cap}`
                    )
                    break
                }

                if (stagnant >= STAGNANT_LIMIT) {
                    this.bot.logger.warn(
                        isMobile,
                        'SEARCH-BING',
                        `No confirmed progress for ${STAGNANT_LIMIT} searches in a row, stopping`
                    )
                    break
                }

                await waitBeforeSearch(this.bot, isMobile)
            }

            const finalQuota = await this.searchProgress.getMissing(isMobile)
            const completed =
                finalQuota.available !== false && (finalQuota.totalPoints <= 0 || (zeroPointRun && performed > 0))
            const totalGained = this.searchProgress.gained(missing, finalQuota)
            this.bot.recordActivity(
                'search',
                activityResult(
                    completed ? 'confirmed' : 'unconfirmed',
                    zeroPointRun && performed > 0
                        ? 'bounded-zero-point-run'
                        : completed
                          ? 'quota-complete'
                          : 'quota-incomplete',
                    undefined,
                    totalGained
                )
            )
            this.bot.logger[completed || (totalGained ?? 0) > 0 ? 'success' : 'info'](
                isMobile,
                'SEARCH-BING',
                `${completed ? 'Completed' : 'Stopped'} Bing searches | pointsGained=${totalGained ?? 'unknown'} | currentBalance=${this.bot.userData.currentPoints} | previousBalance=${startBalance} | searches=${performed}`
            )
            return totalGained
        } catch (error) {
            this.bot.recordActivity('search', activityFailure(error))
            this.bot.signal.throwIfAborted()
            this.bot.logger.error(
                isMobile,
                'SEARCH-BING',
                `Error in doSearch | ${error instanceof Error ? error.message : String(error)}`
            )
            return null
        }
    }

    async searchBonus(): Promise<number | null> {
        const isMobile = this.bot.isMobile
        const tracker = new BonusTracker(this.bot, isMobile)

        const ready = await tracker.prepare()
        if (!ready || !tracker.started) return 0

        let performed = 0
        let stagnant = 0

        try {
            const queryQueue = new SearchQueryQueue(this.bot)
            const topicCount = await queryQueue.prepare()
            if (!topicCount) {
                this.bot.logger.warn(isMobile, tracker.context, 'No main search topics available, skipping')
                return 0
            }

            while (!tracker.done() && performed < tracker.maxSearches && stagnant < tracker.stagnantLimit) {
                this.bot.signal.throwIfAborted()
                const selected = await queryQueue.next()
                if (!selected) {
                    this.bot.logger.warn(isMobile, tracker.context, 'Query queue exhausted, stopping')
                    break
                }
                const query = selected.text

                this.bot.logger.info(
                    isMobile,
                    tracker.context,
                    `Searching | search=${performed + 1} | ${formatSearchQuery(selected)} | ${tracker.progress()}`
                )

                const res = await this.searchApi.report(query)
                performed++

                if (!res.ig) {
                    this.bot.logger.warn(isMobile, tracker.context, `No IG for query="${query}" - skipping`)
                    continue
                }

                const gained = await tracker.measure()
                if (gained !== null && gained > 0) {
                    stagnant = 0
                    this.bot.logger.success(
                        isMobile,
                        tracker.context,
                        `pointsGained=${gained} | currentBalance=${this.bot.userData.currentPoints} | query="${query}" | ${tracker.progress()}`
                    )
                } else {
                    stagnant++
                    this.bot.logger.info(
                        isMobile,
                        tracker.context,
                        `pointsGained=${gained ?? 'unknown'} | no confirmed progress ${stagnant}/${tracker.stagnantLimit} | query="${query}" | ${tracker.progress()}`
                    )
                }

                await waitBeforeSearch(this.bot, isMobile)
            }
        } catch (error) {
            this.bot.logger.error(
                isMobile,
                tracker.context,
                `Bonus session error | ${error instanceof Error ? error.message : String(error)}`
            )
        }

        this.bot.signal.throwIfAborted()
        await tracker.measure()
        const totalGained = tracker.pointsGained
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

        this.bot.logger[done || (totalGained ?? 0) > 0 ? 'success' : 'info'](
            isMobile,
            tracker.context,
            `Bonus farming ${done ? 'complete' : 'stopped'} (${reason}) | pointsGained=${totalGained ?? 'unknown'} | currentBalance=${this.bot.userData.currentPoints} | ${tracker.progress()} | searches=${performed}`
        )
        this.bot.recordActivity(
            'bonus-search',
            activityResult(done ? 'confirmed' : 'unconfirmed', reason, undefined, totalGained)
        )
        return totalGained
    }
}
