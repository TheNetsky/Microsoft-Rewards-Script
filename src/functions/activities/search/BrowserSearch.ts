import type { Page } from 'patchright'

import { URLs } from '../../../constants/urls'
import { SearchQueryQueue } from '../../SearchQueryQueue'
import { BaseActivity } from '../BaseActivity'
import { BonusTracker } from './BonusTracker'
import { SearchProgress } from './SearchProgress'
import type { SearchTracker } from '../../../interface/Search'
import type { MissingSearchPoints } from '../../../interface/Points'
import type { MicrosoftRewardsBot } from '../../../index'

const REFRESH_EVERY = 10
const MAX_QUERY_ATTEMPTS = 5

const POINTS_MAX_SEARCHES = 100
const POINTS_STAGNANT_LIMIT = 10

const SEARCH_BOX = '#sb_form_q'
const RESULT_LINK = '#b_results .b_algo h2'

interface SessionStats {
    totalGained: number
    performed: number
    stagnant: number
}

export class Search extends BaseActivity {
    private searchCount = 0

    public async doSearch(page: Page, isMobile: boolean): Promise<number> {
        const startBalance = Number(this.bot.userData.currentPoints ?? 0)
        this.bot.logger.info(isMobile, 'SEARCH-BING', `Starting Bing searches | currentBalance=${startBalance}`)

        const tracker = new PointsTracker(this.bot, isMobile)
        try {
            const stats = await this.runSearchSession(page, isMobile, tracker)

            if (stats.performed >= tracker.maxSearches && !tracker.done()) {
                this.bot.logger.warn(
                    isMobile,
                    tracker.context,
                    `Hit the ${tracker.maxSearches}-search ceiling with points still missing | ${tracker.progress()}`
                )
            }

            this.bot.logger.info(
                isMobile,
                tracker.context,
                `Completed Bing searches | pointsGained=${stats.totalGained} | currentBalance=${this.bot.userData.currentPoints} | previousBalance=${startBalance} | searches=${stats.performed} | ${tracker.progress()}`
            )
            return stats.totalGained
        } finally {
            await page.goto(URLs.bing.origin).catch(() => {})
        }
    }

    public async doBonusSearches(page: Page): Promise<number> {
        const isMobile = this.bot.isMobile
        const tracker = new BonusTracker(this.bot, isMobile)

        const stats = await this.runSearchSession(page, isMobile, tracker)

        if (!tracker.started) return 0

        const done = tracker.done() && !tracker.offerLost
        const reason = done
            ? 'offer complete'
            : tracker.offerLost
              ? 'offer no longer present'
              : stats.performed >= tracker.maxSearches
                ? 'reached maxBonusSearches'
                : stats.stagnant >= tracker.stagnantLimit
                  ? `${tracker.stagnantLimit} idle searches`
                  : 'query pool exhausted'

        this.bot.logger.info(
            isMobile,
            tracker.context,
            `Bonus farming ${done ? 'complete' : 'stopped'} (${reason}) | pointsGained=${stats.totalGained} | currentBalance=${this.bot.userData.currentPoints} | ${tracker.progress()} | searches=${stats.performed}`,
            done || stats.totalGained > 0 ? 'green' : undefined
        )
        return stats.totalGained
    }

    private async runSearchSession(page: Page, isMobile: boolean, tracker: SearchTracker): Promise<SessionStats> {
        const stats: SessionStats = { totalGained: 0, performed: 0, stagnant: 0 }

        try {
            const ready = await tracker.prepare()
            if (!ready) return stats

            const queryQueue = new SearchQueryQueue(this.bot)
            const topicCount = await queryQueue.prepare()
            if (!topicCount) {
                this.bot.logger.warn(isMobile, tracker.context, 'No main search topics available, skipping')
                return stats
            }
            this.bot.logger.info(
                isMobile,
                tracker.context,
                `Query queue ready | mainTopics=${topicCount} | clusterSearch=${this.bot.config.searchSettings.clusterSearch}`
            )

            await this.bot.browser.func.synchronizeActiveBrowserCookies('SEARCH-COOKIE-SEED', true)
            await page.goto(URLs.bing.origin)
            await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {})
            await this.bot.browser.utils.tryDismissAllMessages(page)

            while (!tracker.done() && stats.performed < tracker.maxSearches && stats.stagnant < tracker.stagnantLimit) {
                const query = await queryQueue.next()
                if (!query) {
                    this.bot.logger.warn(isMobile, tracker.context, 'Query queue exhausted, stopping')
                    break
                }

                await this.bot.browser.func.synchronizeActiveBrowserCookies('SEARCH-COOKIE-SEED', true)
                await this.bingSearch(page, query, isMobile)
                stats.performed++

                await this.bot.browser.func.synchronizeActiveBrowserCookies('SEARCH-COOKIE-CAPTURE')
                const gained = await tracker.measure()
                if (gained > 0) {
                    stats.stagnant = 0
                    stats.totalGained += gained
                    this.bot.logger.info(
                        isMobile,
                        tracker.context,
                        `pointsGained=${gained} | currentBalance=${this.bot.userData.currentPoints} | query="${query}" | ${tracker.progress()}`,
                        'green'
                    )
                } else {
                    stats.stagnant++
                    this.bot.logger.info(
                        isMobile,
                        tracker.context,
                        `no points ${stats.stagnant}/${tracker.stagnantLimit} | query="${query}" | ${tracker.progress()}`
                    )
                }
            }

            return stats
        } catch (error) {
            this.bot.logger.error(
                isMobile,
                tracker.context,
                `Search session error | ${error instanceof Error ? error.message : String(error)}`
            )
            return stats
        }
    }
    private async bingSearch(page: Page, query: string, isMobile: boolean): Promise<void> {
        this.searchCount++

        if (this.searchCount % REFRESH_EVERY === 0) {
            await page.goto(URLs.bing.origin)
            await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {})
            await this.bot.browser.utils.tryDismissAllMessages(page)
        }

        for (let attempt = 1; attempt <= MAX_QUERY_ATTEMPTS; attempt++) {
            try {
                const searchBox = page.locator(SEARCH_BOX)

                await page.evaluate(() => window.scrollTo({ left: 0, top: 0, behavior: 'auto' }))
                await page.keyboard.press('Home')
                await searchBox.waitFor({ state: 'visible', timeout: 15000 })

                await this.bot.utils.wait(1000)
                await this.bot.browser.utils.ghostClick(page, SEARCH_BOX, { clickCount: 3 })
                await searchBox.fill('')

                await page.keyboard.type(query, { delay: this.bot.utils.randomDelay(45, 90) })
                await page.keyboard.press('Enter')
                await this.bot.utils.wait(3000)

                if (this.bot.config.searchSettings.scrollRandomResults) {
                    await this.bot.utils.wait(2000)
                    await this.randomScroll(page, isMobile)
                }
                if (this.bot.config.searchSettings.clickRandomResults) {
                    await this.bot.utils.wait(2000)
                    await this.clickRandomLink(page, isMobile)
                }

                await this.bot.utils.wait(
                    this.bot.utils.randomDelay(
                        this.bot.config.searchSettings.searchDelay.min,
                        this.bot.config.searchSettings.searchDelay.max
                    )
                )

                return
            } catch (error) {
                this.bot.logger.warn(
                    isMobile,
                    'SEARCH-BING',
                    `Search attempt ${attempt}/${MAX_QUERY_ATTEMPTS} failed | query="${query}" | ${error instanceof Error ? error.message : String(error)}`
                )
                if (attempt === MAX_QUERY_ATTEMPTS) throw error
                await this.bot.utils.wait(2000)
            }
        }
    }

    private async randomScroll(page: Page, isMobile: boolean) {
        try {
            await page.evaluate(() => {
                const maxScroll = Math.max(1, document.body.scrollHeight - window.innerHeight)
                window.scrollTo({ left: 0, top: Math.floor(Math.random() * maxScroll), behavior: 'auto' })
            })
        } catch (error) {
            this.bot.logger.error(
                isMobile,
                'SEARCH-RANDOM-SCROLL',
                `Failed during random scroll | ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async clickRandomLink(page: Page, isMobile: boolean) {
        try {
            const searchPageUrl = page.url()
            await this.bot.browser.utils.ghostClick(page, RESULT_LINK)
            await this.bot.utils.wait(this.bot.config.searchSettings.searchResultVisitTime)

            if (isMobile) {
                await page.goto(searchPageUrl)
            } else {
                const newTab = await this.bot.browser.utils.getLatestTab(page)
                await this.bot.browser.utils.closeTabs(newTab)
            }
        } catch (error) {
            this.bot.logger.error(
                isMobile,
                'SEARCH-RANDOM-CLICK',
                `Failed during random click | ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }
}

class PointsTracker implements SearchTracker {
    public readonly context = 'SEARCH-BING'
    public readonly maxSearches = POINTS_MAX_SEARCHES
    public readonly stagnantLimit = POINTS_STAGNANT_LIMIT

    private missing: MissingSearchPoints = { mobilePoints: 0, desktopPoints: 0, edgePoints: 0, totalPoints: 0 }
    private readonly runOnZeroPoints: boolean
    private readonly searchProgress: SearchProgress

    constructor(
        private bot: MicrosoftRewardsBot,
        private isMobile: boolean
    ) {
        this.runOnZeroPoints = this.bot.config.searchSettings.runOnZeroPoints ?? false
        this.searchProgress = new SearchProgress(this.bot)
    }

    async prepare(): Promise<boolean> {
        this.missing = await this.searchProgress.getMissing(this.isMobile)
        this.bot.logger.info(
            this.isMobile,
            this.context,
            `Search points remaining | edge=${this.missing.edgePoints} | desktop=${this.missing.desktopPoints} | mobile=${this.missing.mobilePoints}`
        )

        if (this.missing.totalPoints <= 0) {
            if (!this.runOnZeroPoints) {
                this.bot.logger.info(
                    this.isMobile,
                    this.context,
                    'No search points to earn, skipping (runOnZeroPoints is disabled)'
                )
                return false
            }
            this.bot.logger.info(
                this.isMobile,
                this.context,
                'No search points reported, but runOnZeroPoints is enabled, searching anyway'
            )
        }
        return true
    }

    async measure(): Promise<number> {
        const updated = await this.searchProgress.getMissing(this.isMobile)
        const gained = Math.max(0, this.missing.totalPoints - updated.totalPoints)
        this.missing = updated

        if (gained > 0) {
            this.bot.userData.currentPoints = Number(this.bot.userData.currentPoints ?? 0) + gained
            this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + gained
        }
        return gained
    }

    done(): boolean {
        return !this.runOnZeroPoints && this.missing.totalPoints <= 0
    }

    progress(): string {
        return `remaining=${this.missing.totalPoints}`
    }
}
