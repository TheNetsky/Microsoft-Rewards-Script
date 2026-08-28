import { SearchQueryQueue } from '../../SearchQueryQueue'
import { BaseActivity } from '../BaseActivity'
import { BonusTracker } from '../search/BonusTracker'
import { SearchProgress } from '../search/SearchProgress'
import { BingSearchApi } from './BingSearchApi'

const STAGNANT_LIMIT = 10
const MAX_SEARCHES = 60
const DASHBOARD_REFRESH_EVERY = 5

export class ApiSearch extends BaseActivity {
    private readonly searchApi = new BingSearchApi(this.bot)
    private readonly searchProgress = new SearchProgress(this.bot)

    public async doSearch(isMobile: boolean): Promise<number> {
        const startBalance = Number(this.bot.userData.currentPoints ?? 0)
        let totalGained = 0

        this.bot.logger.info(isMobile, 'SEARCH-BING', `开始 Bing 搜索 | 当前余额=${startBalance}`)

        try {
            const missing = await this.searchProgress.getMissing(isMobile)
            this.bot.logger.info(
                isMobile,
                'SEARCH-BING',
                `剩余搜索积分 | edge=${missing.edgePoints} | desktop=${missing.desktopPoints} | mobile=${missing.mobilePoints}`
            )
            if (missing.totalPoints <= 0) {
                this.bot.logger.info(isMobile, 'SEARCH-BING', '没有可赚取的搜索积分，跳过')
                return 0
            }
            let remainingPoints = missing.totalPoints

            const queryQueue = new SearchQueryQueue(this.bot)
            const topicCount = await queryQueue.prepare()
            if (!topicCount) {
                this.bot.logger.warn(isMobile, 'SEARCH-BING', '没有可用的主搜索主题，跳过')
                return 0
            }
            this.bot.logger.info(
                isMobile,
                'SEARCH-BING',
                `查询队列就绪 | mainTopics=${topicCount} | clusterSearch=${this.bot.config.searchSettings.clusterSearch}`
            )

            let stagnant = 0
            let performed = 0
            let lastEarned: number | null = null

            while (performed < MAX_SEARCHES) {
                const query = await queryQueue.next()
                if (!query) {
                    this.bot.logger.warn(isMobile, 'SEARCH-BING', '查询队列已耗尽，停止')
                    break
                }

                const res = await this.searchApi.report(query)
                performed++

                if (!res.ig) {
                    this.bot.logger.warn(isMobile, 'SEARCH-BING', `查询 "${query}" 无 IG - 跳过`)
                    continue
                }

                if (res.balance != null) this.bot.userData.currentPoints = res.balance

                const earned = res.searchPointsEarned
                const limit = res.searchPointsLimit
                const responseCapReached = earned != null && limit != null && limit > 0 && earned >= limit
                const cap = earned != null && limit != null ? `${earned}/${limit}` : 'n/a'

                const gained = res.gained ?? 0
                const responseProgress = earned != null && lastEarned != null ? earned - lastEarned : gained
                if (earned != null) lastEarned = earned

                let dashboardProgress: number | null = null
                let dashboardChecked = false
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
                        dashboardProgress = Math.max(0, remainingPoints - updated.totalPoints)
                        remainingPoints = updated.totalPoints
                        dashboardChecked = true
                    } catch (error) {
                        this.bot.logger.debug(
                            isMobile,
                            'SEARCH-BING',
                            `无法刷新${isMobile ? '移动端' : '桌面端'}搜索配额 | ${
                                error instanceof Error ? error.message : String(error)
                            }`
                        )
                    }
                }

                const searchProgress =
                    dashboardProgress === null ? responseProgress : Math.max(dashboardProgress, responseProgress)
                const capReached = dashboardChecked ? remainingPoints <= 0 : responseCapReached

                if (gained > 0) {
                    totalGained += gained
                    this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + gained
                }

                if (searchProgress > 0) {
                    stagnant = 0
                    this.bot.logger.info(
                        isMobile,
                        'SEARCH-BING',
                        `获得积分=${gained} | 当前余额=${res.balance} | 查询="${query}"` +
                            ` | 剩余=${remainingPoints} | 搜索积分=${cap}`,
                        'green'
                    )
                } else {
                    stagnant++
                    this.bot.logger.info(
                        isMobile,
                        'SEARCH-BING',
                        `未获得积分 ${stagnant}/${STAGNANT_LIMIT} | 查询="${query}"` +
                            ` | 剩余=${remainingPoints} | 搜索积分=${cap}`
                    )
                }

                if (capReached) {
                    this.bot.logger.info(
                        isMobile,
                        'SEARCH-BING',
                        `${isMobile ? '移动端' : '桌面端'}搜索配额已完成` +
                            ` | 剩余=${remainingPoints} | 响应搜索积分=${cap}`,
                        'green'
                    )
                    break
                }

                if (stagnant >= STAGNANT_LIMIT) {
                    this.bot.logger.warn(
                        isMobile,
                        'SEARCH-BING',
                        `连续 ${STAGNANT_LIMIT} 次搜索未得分，中止`
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
                `Bing 搜索完成 | 获得积分=${totalGained} | 当前余额=${this.bot.userData.currentPoints} | 原余额=${startBalance} | 搜索次数=${performed}`
            )
            return totalGained
        } catch (error) {
            this.bot.logger.error(
                isMobile,
                'SEARCH-BING',
                `doSearch 出错 | ${error instanceof Error ? error.message : String(error)}`
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
                this.bot.logger.warn(isMobile, tracker.context, '没有可用的主搜索主题，跳过')
                return 0
            }
            this.bot.logger.info(
                isMobile,
                tracker.context,
                `查询队列就绪 | mainTopics=${topicCount} | clusterSearch=${this.bot.config.searchSettings.clusterSearch}`
            )

            while (!tracker.done() && performed < tracker.maxSearches && stagnant < tracker.stagnantLimit) {
                const query = await queryQueue.next()
                if (!query) {
                    this.bot.logger.warn(isMobile, tracker.context, '查询队列已耗尽，停止')
                    break
                }

                const res = await this.searchApi.report(query)
                performed++

                if (!res.ig) {
                    this.bot.logger.warn(isMobile, tracker.context, `查询 "${query}" 无 IG - 跳过`)
                    continue
                }

                const gained = await tracker.measure()
                if (gained > 0) {
                    stagnant = 0
                    totalGained += gained
                    this.bot.logger.info(
                        isMobile,
                        tracker.context,
                        `获得积分=${gained} | 当前余额=${this.bot.userData.currentPoints} | 查询="${query}" | ${tracker.progress()}`,
                        'green'
                    )
                } else {
                    stagnant++
                    this.bot.logger.info(
                        isMobile,
                        tracker.context,
                        `未得分 ${stagnant}/${tracker.stagnantLimit} | 查询="${query}" | ${tracker.progress()}`
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
                `加成搜索会话出错 | ${error instanceof Error ? error.message : String(error)}`
            )
        }

        const done = tracker.done() && !tracker.offerLost
        const reason = done
            ? '活动完成'
            : tracker.offerLost
              ? '活动已不存在'
              : performed >= tracker.maxSearches
                ? '达到最大加成搜索次数'
                : stagnant >= tracker.stagnantLimit
                  ? `连续 ${tracker.stagnantLimit} 次无积分`
                  : '查询池已耗尽'

        this.bot.logger.info(
            isMobile,
            tracker.context,
            `加成搜索刷分 ${done ? '完成' : '中止'} (${reason}) | 获得积分=${totalGained} | 当前余额=${this.bot.userData.currentPoints} | ${tracker.progress()} | 搜索次数=${performed}`,
            done || totalGained > 0 ? 'green' : undefined
        )
        return totalGained
    }
}
