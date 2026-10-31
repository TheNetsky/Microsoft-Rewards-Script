import { waitBeforeSearch } from '../../shared/search/SearchDelay'
import { activityFailure, activityResult } from '../../shared/ActivityResult'
import { browserTimeout } from '../../../browser/BrowserTiming'
import { BrowserTaskPage } from '../../../browser/BrowserTaskPage'
import { isBrowserPageCrashed, onBrowserPageCrash } from '../../../browser/BrowserPageHealth'
import { closeBrowserPage } from '../../../browser/BrowserPageRequests'
import { humanScroll } from '../../../browser/HumanScroll'
import type { Page } from 'patchright'

import { BrowserRewardNavigator } from '../actions/BrowserRewardNavigator'
import { SearchQueryQueue } from '../../shared/query/SearchQueryQueue'
import { formatSearchQuery } from '../../shared/query/QueryContext'
import { BaseActivity } from '../../shared/activities/BaseActivity'
import { BonusTracker } from '../../shared/search/BonusTracker'
import { SearchProgress } from '../../shared/search/SearchProgress'
import { BingSearchPage } from './BingSearchPage'
import type { SearchTracker } from '../../shared/search/SearchTypes'
import type { MissingSearchPoints } from '../../types/Points'
import type { BotContext } from '../../../core/BotContext'

const REFRESH_EVERY_SEARCHES = 10
const MEASURE_EVERY_SEARCHES = 4

const POINTS_MAX_SEARCHES = 100
const POINTS_STAGNANT_LIMIT = 10

const RESULT_LINK = '#b_results .b_algo h2 a[href]:visible'
const RESULT_POOL_SIZE = 6
const RESULT_CLICK_ATTEMPTS = 2

interface SessionStats {
    totalGained: number | null
    performed: number
    stagnant: number
}

export class BrowserSearch extends BaseActivity {
    private searchCount = 0
    private readonly bing = new BingSearchPage(this.bot)

    async search(page: Page, isMobile: boolean): Promise<number | null> {
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

            this.bot.logger[tracker.done() || (stats.totalGained ?? 0) > 0 ? 'success' : 'info'](
                isMobile,
                tracker.context,
                `${tracker.done() ? 'Completed' : 'Stopped'} Bing searches | pointsGained=${stats.totalGained ?? 'unknown'} | currentBalance=${this.bot.userData.currentPoints} | previousBalance=${startBalance} | searches=${stats.performed} | ${tracker.progress()}`
            )
            const completed = tracker.quotaComplete() || (tracker.zeroPointRun && stats.performed > 0)
            this.bot.recordActivity(
                'search',
                activityResult(
                    completed ? 'confirmed' : 'unconfirmed',
                    tracker.zeroPointRun && completed
                        ? 'bounded-zero-point-run'
                        : completed
                          ? 'quota-complete'
                          : 'quota-incomplete',
                    undefined,
                    stats.totalGained
                )
            )
            return stats.totalGained
        } catch (error) {
            this.bot.recordActivity('search', activityFailure(error))
            throw error
        }
    }

    async searchBonus(page: Page): Promise<number | null> {
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

        this.bot.logger[done || (stats.totalGained ?? 0) > 0 ? 'success' : 'info'](
            isMobile,
            tracker.context,
            `Bonus farming ${done ? 'complete' : 'stopped'} (${reason}) | pointsGained=${stats.totalGained ?? 'unknown'} | currentBalance=${this.bot.userData.currentPoints} | ${tracker.progress()} | searches=${stats.performed}`
        )
        this.bot.recordActivity(
            'bonus-search',
            activityResult(done ? 'confirmed' : 'unconfirmed', reason, undefined, stats.totalGained)
        )
        return stats.totalGained
    }

    private async runSearchSession(page: Page, isMobile: boolean, tracker: SearchTracker): Promise<SessionStats> {
        const stats: SessionStats = { totalGained: 0, performed: 0, stagnant: 0 }
        const source = page
        let task: BrowserTaskPage | undefined
        let stopCrashLog: (() => void) | undefined

        const createSearchPage = async (): Promise<Page> => {
            this.bot.signal.throwIfAborted()
            await task?.close()
            stopCrashLog?.()
            this.bot.signal.throwIfAborted()
            task = await BrowserTaskPage.create(source)
            page = task.page
            stopCrashLog = onBrowserPageCrash(page, () =>
                this.bot.logger.warn(
                    isMobile,
                    tracker.context,
                    `Bing search tab crashed; a fresh tab is required before continuing | url=${page.url()}`
                )
            )
            await this.bot.sessionState.synchronize('SEARCH-COOKIE-SEED')
            await this.bing.open(page)
            await this.bot.browser.utils.dismissMessages(page)
            return page
        }
        const replaceCrashedPage = async (): Promise<Page> => {
            const replacement = await createSearchPage()
            this.bot.logger.info(isMobile, tracker.context, 'Replaced crashed Bing tab; continuing searches')
            return replacement
        }

        try {
            const ready = await tracker.prepare()
            if (!ready) return stats

            const queryQueue = new SearchQueryQueue(this.bot)
            const topicCount = await queryQueue.prepare()
            if (!topicCount) {
                this.bot.logger.warn(isMobile, tracker.context, 'No main search topics available, skipping')
                return stats
            }

            await createSearchPage()

            let nextMeasureAt = MEASURE_EVERY_SEARCHES

            while (!tracker.done() && stats.performed < tracker.maxSearches && stats.stagnant < tracker.stagnantLimit) {
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
                    `Searching | search=${stats.performed + 1} | ${formatSearchQuery(selected)} | progressCheckEvery=${MEASURE_EVERY_SEARCHES}`
                )

                await this.bot.sessionState.synchronize('SEARCH-COOKIE-SEED')
                page = await this.bingSearch(page, query, isMobile, replaceCrashedPage)
                stats.performed++

                await this.bot.sessionState.synchronize('SEARCH-COOKIE-CAPTURE')

                const isLastSearch =
                    stats.performed >= tracker.maxSearches ||
                    tracker.done() ||
                    stats.stagnant + 1 >= tracker.stagnantLimit
                const shouldMeasure = stats.performed >= nextMeasureAt || isLastSearch

                if (shouldMeasure) {
                    const batchGained = await tracker.measure()
                    stats.totalGained = tracker.pointsGained
                    nextMeasureAt = stats.performed + MEASURE_EVERY_SEARCHES

                    if (batchGained !== null && batchGained > 0) {
                        stats.stagnant = 0
                        this.bot.logger.success(
                            isMobile,
                            tracker.context,
                            `batch pointsGained=${batchGained} | currentBalance=${this.bot.userData.currentPoints} | lastQuery="${query}" | ${tracker.progress()}`
                        )
                    } else {
                        stats.stagnant++
                        this.bot.logger.info(
                            isMobile,
                            tracker.context,
                            `batch pointsGained=${batchGained ?? 'unknown'} | no confirmed progress ${stats.stagnant}/${tracker.stagnantLimit} | lastQuery="${query}" | ${tracker.progress()}`
                        )
                    }
                } else {
                    this.bot.logger.debug(
                        isMobile,
                        tracker.context,
                        `search ${stats.performed} done, next measure at ${nextMeasureAt} | query="${query}"`
                    )
                }
            }

            await tracker.measure()
            stats.totalGained = tracker.pointsGained
            return stats
        } catch (error) {
            this.bot.logger.error(
                isMobile,
                tracker.context,
                `Search session error | ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        } finally {
            try {
                await task?.close()
            } finally {
                stopCrashLog?.()
            }
        }
    }

    private async bingSearch(
        page: Page,
        query: string,
        isMobile: boolean,
        replaceCrashedPage: () => Promise<Page>
    ): Promise<Page> {
        if (isBrowserPageCrashed(page)) page = await replaceCrashedPage()
        this.searchCount++

        if (this.searchCount >= REFRESH_EVERY_SEARCHES) {
            await this.bing.open(page)
            await this.bot.browser.utils.dismissMessages(page)
            this.searchCount = 0
        }

        page = await this.bing.submit(page, query, 'SEARCH-BING', isMobile, undefined, replaceCrashedPage)
        await this.bot.utils.wait(2500)

        if (!isBrowserPageCrashed(page) && this.bot.config.searchSettings.scrollRandomResults) {
            await this.bot.utils.wait(1500)
            await this.randomScroll(page, isMobile)
        }
        if (!isBrowserPageCrashed(page) && this.bot.config.searchSettings.clickRandomResults) {
            await this.bot.utils.wait(1500)
            await this.clickRandomLink(page, isMobile)
        }

        await waitBeforeSearch(this.bot, isMobile)
        return page
    }

    private async randomScroll(page: Page, isMobile: boolean) {
        if (isBrowserPageCrashed(page)) return
        try {
            await humanScroll(page, { random: true }, { timeout: browserTimeout(this.bot), signal: this.bot.signal })
        } catch (error) {
            this.bot.signal.throwIfAborted()
            this.bot.logger.warn(
                isMobile,
                'SEARCH-RANDOM-SCROLL',
                `Skipped optional results scroll | ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async clickRandomLink(page: Page, isMobile: boolean) {
        if (isBrowserPageCrashed(page)) return
        const searchPageUrl = page.url()
        let closeClick: (() => Promise<void>) | undefined
        const visit = new AbortController()
        const visitSignal = AbortSignal.any([this.bot.signal, visit.signal])
        const crashLogs = new Map<Page, () => void>()
        const popups = new Set<Page>()
        const onPopup = (popup: Page): void => {
            popups.add(popup)
            watch(popup)
        }
        const watch = (resultPage: Page): void => {
            if (crashLogs.has(resultPage)) return
            crashLogs.set(
                resultPage,
                onBrowserPageCrash(resultPage, () => {
                    this.bot.logger.warn(
                        isMobile,
                        'SEARCH-RANDOM-CLICK',
                        `Search-result tab crashed; skipping optional visit | url=${resultPage.url()}`
                    )
                    visit.abort(new Error('Search-result tab crashed'))
                })
            )
            resultPage.on('popup', onPopup)
        }
        watch(page)
        try {
            const navigator = new BrowserRewardNavigator(this.bot)
            const tried = new Set<number>()
            let lastFailure: unknown
            for (let attempt = 1; attempt <= RESULT_CLICK_ATTEMPTS; attempt++) {
                this.bot.signal.throwIfAborted()
                if (page.isClosed()) return
                await page.keyboard.press('Escape').catch(() => undefined)
                await this.bot.browser.utils.dismissMessages(page)
                const candidates = page.locator(RESULT_LINK)
                const pool = Math.min(RESULT_POOL_SIZE, await candidates.count())
                const available = Array.from({ length: pool }, (_, index) => index).filter(index => !tried.has(index))
                if (!available.length) break
                const index = Math.floor(Math.random() * available.length)
                const targetIndex = available[Math.random() < 0.35 ? Math.min(index, 1) : index]!
                tried.add(targetIndex)
                try {
                    const clicked = await navigator.click(page, candidates.nth(targetIndex), undefined, {
                        timeout: Math.min(5000, browserTimeout(this.bot, 'optional'))
                    })
                    closeClick = clicked.close
                    await this.bot.utils.wait(
                        this.bot.utils.randomDelay(
                            this.bot.config.searchSettings.searchResultVisitTime,
                            this.bot.config.searchSettings.searchResultVisitTime
                        ),
                        visitSignal
                    )
                    return
                } catch (error) {
                    this.bot.signal.throwIfAborted()
                    lastFailure = error
                    this.bot.logger.debug(
                        isMobile,
                        'SEARCH-RANDOM-CLICK',
                        `Optional result click failed | attempt=${attempt}/${RESULT_CLICK_ATTEMPTS} | ${error instanceof Error ? error.message : String(error)}`
                    )

                    if (
                        visit.signal.aborted ||
                        page.isClosed() ||
                        page.url() !== searchPageUrl ||
                        popups.size ||
                        tried.size >= pool
                    )
                        break
                }
            }
            if (lastFailure) throw lastFailure
        } catch (error) {
            this.bot.signal.throwIfAborted()
            if (!visit.signal.aborted)
                this.bot.logger.warn(
                    isMobile,
                    'SEARCH-RANDOM-CLICK',
                    `Skipped optional result visit | ${error instanceof Error ? error.message.split(/\r?\n/, 1)[0] : String(error)}`
                )
        } finally {
            try {
                await closeClick?.()
            } finally {
                await Promise.allSettled([...popups].map(closeBrowserPage))
                for (const [resultPage, stop] of crashLogs) {
                    resultPage.off('popup', onPopup)
                    stop()
                }
                if (
                    !this.bot.signal.aborted &&
                    !page.isClosed() &&
                    !isBrowserPageCrashed(page) &&
                    page.url() !== searchPageUrl
                ) {
                    await page
                        .goto(searchPageUrl, {
                            waitUntil: 'domcontentloaded',
                            timeout: browserTimeout(this.bot, 'navigation')
                        })
                        .catch(() => undefined)
                }
            }
        }
    }
}

class PointsTracker implements SearchTracker {
    readonly context = 'SEARCH-BING'
    readonly maxSearches = POINTS_MAX_SEARCHES
    readonly stagnantLimit = POINTS_STAGNANT_LIMIT

    private missing: MissingSearchPoints = { mobilePoints: 0, desktopPoints: 0, edgePoints: 0, totalPoints: 0 }
    pointsGained: number | null = 0
    private baseline?: MissingSearchPoints
    private measuredTotal = 0
    zeroPointRun = false
    private readonly runOnZeroPoints: boolean
    private readonly searchProgress: SearchProgress

    constructor(
        private bot: BotContext,
        private isMobile: boolean
    ) {
        this.runOnZeroPoints = this.bot.config.searchSettings.runOnZeroPoints ?? false
        this.searchProgress = new SearchProgress(this.bot)
    }

    async prepare(): Promise<boolean> {
        this.missing = await this.searchProgress.getMissing(this.isMobile)
        this.baseline = this.missing
        if (this.missing.available === false) throw new Error('Search quota unavailable')
        this.bot.logger.info(
            this.isMobile,
            this.context,
            `Search points remaining | edge=${this.missing.edgePoints} | desktop=${this.missing.desktopPoints} | mobile=${this.missing.mobilePoints}`
        )

        this.zeroPointRun = this.missing.totalPoints <= 0 && this.runOnZeroPoints
        if (this.missing.totalPoints <= 0) {
            if (!this.runOnZeroPoints) {
                this.bot.logger.debug(
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

    async measure(): Promise<number | null> {
        try {
            const updated = await this.searchProgress.getMissing(this.isMobile)
            const total = this.baseline ? this.searchProgress.gained(this.baseline, updated) : null
            this.missing = updated
            this.pointsGained = total
            if (total === null || total < this.measuredTotal) {
                this.pointsGained = null
                return null
            }
            const gained = total - this.measuredTotal
            this.measuredTotal = total
            return gained
        } catch (error) {
            this.bot.signal.throwIfAborted()
            this.pointsGained = null
            this.bot.logger.debug(this.isMobile, this.context, `Search measurement unavailable | ${String(error)}`)
            return null
        }
    }

    done(): boolean {
        return !this.zeroPointRun && this.quotaComplete()
    }

    quotaComplete(): boolean {
        return this.missing.available !== false && this.missing.totalPoints <= 0
    }

    progress(): string {
        return `remaining=${this.missing.totalPoints}`
    }
}
