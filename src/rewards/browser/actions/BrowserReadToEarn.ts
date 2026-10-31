import type { Locator, Page } from 'patchright'
import { BrowserRewardNavigator } from './BrowserRewardNavigator'
import { humanScroll } from '../../../browser/HumanScroll'
import { BrowserTaskPage } from '../../../browser/BrowserTaskPage'
import { browserTimeout } from '../../../browser/BrowserTiming'
import { ApiReadToEarn } from '../../api/actions/ApiReadToEarn'
import { appOfferId, findAppPromotion, isAppPromotionComplete } from '../../app/AppPromotion'
import type { Promotion } from '../../app/types/AppDashboardData'
import { activityFailure, activityResult, type ActivityResult } from '../../shared/ActivityResult'
import { BaseActivity } from '../../shared/activities/BaseActivity'
import { pointValue } from '../../shared/PointAccounting'
import { logReadToEarnCredit, logReadToEarnRetry } from '../../../logging/ReadToEarnLog'

const MAX_BROWSER_READS_PER_RUN = 20
const MAX_FEED_SCROLLS = 8
const MAX_UNVERIFIED_BROWSER_READS = 2
const MSN_ORIGIN = 'https://www.msn.com'
const FEED_CARD_SELECTOR = 'cs-responsive-card[role="article"]:not([media-type="video"])'
const FEED_HEADING_SELECTOR = 'a#heading.heading[href]'

type FeedArticle = {
    heading: Locator
    key: string
    title: string
}

export class BrowserReadToEarn extends BaseActivity {
    async run(promotion: Promotion): Promise<ActivityResult> {
        const offerId = appOfferId(promotion)
        if (!this.bot.accessTokens.mobile) return activityResult('unconfirmed', 'app-token-unavailable', offerId)

        let dashboard = await this.bot.appPlatform.getDashboard()
        let current = findAppPromotion(dashboard.response.promotions, promotion)
        if (!current) return activityResult('unconfirmed', 'offer-not-found', offerId)
        if (isAppPromotionComplete(current)) return activityResult('skipped', 'already-complete', offerId)

        const startProgress = pointValue(current.attributes.pointprogress)
        let browserPoints = 0
        let browserPointsKnown = true
        let browserReads = 0
        let unverifiedReads = 0
        const source = this.bot.requirePage(true)
        const task = await BrowserTaskPage.create(source)
        const seenArticles = new Set<string>()

        try {
            await this.openFeed(task.page)

            for (let read = 1; read <= MAX_BROWSER_READS_PER_RUN; read++) {
                this.bot.signal.throwIfAborted()
                const before = current
                const beforeBalance = dashboard.response.balance
                const beforeProgress = pointValue(before.attributes.pointprogress)

                const article = await this.findFeedArticle(task.page, seenArticles)
                if (!article) {
                    this.bot.logger.info(
                        true,
                        'READ-TO-EARN',
                        'No unused MSN feed article card was available; falling back to the app API'
                    )
                    return await this.fallback(promotion, browserReads, browserPoints, browserPointsKnown)
                }

                seenArticles.add(article.key)
                this.bot.logger.info(
                    true,
                    'READ-TO-EARN',
                    `Reading MSN feed article in browser | transport=browser | read=${read}` +
                        ` | progress=${beforeProgress ?? 'unknown'} | title=${this.safeTitle(article.title)}`
                )

                try {
                    await this.readArticle(task.page, article.heading)
                } catch (error) {
                    this.bot.signal.throwIfAborted()
                    this.bot.logger.info(
                        true,
                        'READ-TO-EARN',
                        'MSN feed article could not be read; trying the app API instead'
                    )
                    this.bot.logger.debug(true, 'READ-TO-EARN', error instanceof Error ? error : String(error))
                    return await this.fallback(promotion, browserReads, browserPoints, browserPointsKnown)
                }

                const verified = await this.bot.appPlatform.verifyActivity(before, {}, this.bot.appIdentity.channel, {
                    maxAttempts: 4,
                    delayMs: 2000,
                    beforeBalance,
                    onRetry: (attempt, maxAttempts) => logReadToEarnRetry(this.bot, read, attempt, maxAttempts)
                })
                if (verified.pointsKnown === false) browserPointsKnown = false
                else browserPoints += verified.pointsGained
                logReadToEarnCredit(this.bot, read, verified)

                let refreshed: Promotion | undefined
                try {
                    dashboard = await this.bot.appPlatform.getDashboard()
                    this.bot.userData.currentPoints = dashboard.response.balance
                    refreshed = findAppPromotion(dashboard.response.promotions, before)
                } catch (error) {
                    this.bot.signal.throwIfAborted()
                    this.bot.logger.debug(
                        true,
                        'READ-TO-EARN',
                        `Could not refresh Read to Earn immediately after browser read` +
                            ` | message=${error instanceof Error ? error.message : String(error)}`
                    )
                }

                const afterProgress = refreshed ? pointValue(refreshed.attributes.pointprogress) : null
                const progressChanged =
                    beforeProgress !== null && afterProgress !== null && afterProgress > beforeProgress
                const progressed = verified.status === 'confirmed' || progressChanged

                if (!progressed) {
                    unverifiedReads++
                    this.bot.logger.info(
                        true,
                        'READ-TO-EARN',
                        `MSN browser read credit is not confirmed; ${unverifiedReads < MAX_UNVERIFIED_BROWSER_READS ? 'trying another article' : 'trying the app API'}` +
                            ` | read=${read} | attempts=${unverifiedReads}/${MAX_UNVERIFIED_BROWSER_READS}` +
                            ` | reason=${verified.reason}`
                    )
                    if (unverifiedReads >= MAX_UNVERIFIED_BROWSER_READS) {
                        return await this.fallback(promotion, browserReads, browserPoints, browserPointsKnown)
                    }
                    await this.ensureFeed(task.page)
                    continue
                }

                unverifiedReads = 0
                browserReads++
                if (refreshed) current = refreshed

                this.bot.logger.debug(
                    true,
                    'READ-TO-EARN',
                    `Browser read verified | read=${read}` +
                        ` | progress=${beforeProgress ?? 'unknown'}->${afterProgress ?? 'unknown'}` +
                        ` | pointsGained=${verified.pointsKnown === false ? 'unknown' : verified.pointsGained}`
                )

                if (refreshed && isAppPromotionComplete(refreshed)) {
                    const result = activityResult(
                        'confirmed',
                        'read-to-earn-browser-complete',
                        offerId,
                        browserPointsKnown ? browserPoints : null
                    )
                    this.logSummary(result, browserReads, startProgress, afterProgress, false)
                    return result
                }

                if (!refreshed) {
                    this.bot.logger.info(
                        true,
                        'READ-TO-EARN',
                        'Browser read was verified but the offer could not be refreshed; using API fallback to reconcile state'
                    )
                    return await this.fallback(promotion, browserReads, browserPoints, browserPointsKnown)
                }

                await this.ensureFeed(task.page)
            }

            return await this.fallback(promotion, browserReads, browserPoints, browserPointsKnown)
        } catch (error) {
            this.bot.signal.throwIfAborted()
            this.bot.logger.info(true, 'READ-TO-EARN', 'Browser Read to Earn unavailable; trying the app API instead')
            this.bot.logger.debug(true, 'READ-TO-EARN', error instanceof Error ? error : String(error))
            return await this.fallback(promotion, browserReads, browserPoints, browserPointsKnown, error)
        } finally {
            await task.close()
        }
    }

    private async fallback(
        promotion: Promotion,
        browserReads: number,
        browserPoints: number,
        browserPointsKnown: boolean,
        browserError?: unknown
    ): Promise<ActivityResult> {
        this.bot.logger.info(
            true,
            'READ-TO-EARN',
            `Using Read to Earn API fallback | browserReads=${browserReads}` +
                (browserError
                    ? ` | browserReason=${browserError instanceof Error ? browserError.message : String(browserError)}`
                    : '')
        )

        let apiResult: ActivityResult
        try {
            apiResult = await new ApiReadToEarn(this.bot).run(promotion)
        } catch (error) {
            this.bot.signal.throwIfAborted()
            apiResult = activityFailure(error, appOfferId(promotion))
        }

        const pointsKnown = browserPointsKnown && apiResult.pointsKnown !== false
        const combined: ActivityResult = {
            ...apiResult,
            reason: `browser-fallback-${apiResult.reason}`,
            pointsGained: pointsKnown ? browserPoints + apiResult.pointsGained : 0,
            pointsKnown
        }
        this.logSummary(combined, browserReads, null, null, true)
        return combined
    }

    private async openFeed(page: Page): Promise<void> {
        const locale = this.normalizedLocale()
        const urls = [...new Set([`${MSN_ORIGIN}/${locale}`, `${MSN_ORIGIN}/en-us`, `${MSN_ORIGIN}/`])]
        let lastError: unknown

        for (const url of urls) {
            try {
                const response = await page.goto(url, {
                    waitUntil: 'domcontentloaded',
                    timeout: browserTimeout(this.bot, 'navigation')
                })
                if (response && !response.ok()) throw new Error(`MSN returned status ${response.status()}`)
                await this.bot.browser.utils.dismissMessages(page)
                await page
                    .locator(FEED_CARD_SELECTOR)
                    .first()
                    .waitFor({ state: 'attached', timeout: browserTimeout(this.bot, 'optional') })
                if (await this.hasFeedArticle(page)) {
                    this.bot.logger.debug(true, 'READ-TO-EARN', `MSN feed ready | url=${page.url()}`)
                    return
                }
                throw new Error('MSN homepage contained no rendered article cards')
            } catch (error) {
                lastError = error
            }
        }

        throw lastError instanceof Error ? lastError : new Error('Could not open MSN feed')
    }

    private async ensureFeed(page: Page): Promise<void> {
        if (!page.isClosed() && this.isMsnPage(page.url()) && (await this.hasFeedArticle(page))) return
        await this.openFeed(page)
    }

    private async hasFeedArticle(page: Page): Promise<boolean> {
        const cards = page.locator(FEED_CARD_SELECTOR)
        const count = Math.min(await cards.count(), 12)
        for (let index = 0; index < count; index++) {
            const heading = cards.nth(index).locator(FEED_HEADING_SELECTOR).first()
            if (await heading.isVisible().catch(() => false)) return true
        }
        return false
    }

    private async findFeedArticle(page: Page, seenArticles: ReadonlySet<string>): Promise<FeedArticle | null> {
        for (let scroll = 0; scroll <= MAX_FEED_SCROLLS; scroll++) {
            const cards = page.locator(FEED_CARD_SELECTOR)
            const count = await cards.count()

            for (let index = 0; index < count; index++) {
                const card = cards.nth(index)
                const heading = card.locator(FEED_HEADING_SELECTOR).first()
                if (!(await heading.isVisible().catch(() => false))) continue

                const href = (await heading.getAttribute('href'))?.trim() ?? ''
                const id = (await card.getAttribute('id'))?.trim() ?? ''
                const title =
                    (await card.getAttribute('title'))?.trim() ||
                    (await heading.getAttribute('aria-label'))?.trim() ||
                    (await heading.textContent())?.trim() ||
                    'MSN article'
                const key = id || this.normalizeArticleKey(href, page.url()) || title
                if (seenArticles.has(key)) continue

                return { heading, key, title }
            }

            if (scroll === MAX_FEED_SCROLLS) break
            await humanScroll(
                page,
                { distance: this.bot.utils.randomDelay(650, 1250) },
                { timeout: browserTimeout(this.bot), signal: this.bot.signal }
            )
            await this.bot.utils.wait(this.bot.utils.randomDelay(450, 850))
        }

        return null
    }

    private async readArticle(feedPage: Page, heading: Locator): Promise<void> {
        const beforeUrl = feedPage.url()
        const clicked = await new BrowserRewardNavigator(this.bot).click(feedPage, heading)
        const page = clicked.page
        try {
            if (!clicked.openedPopup && page.url() === beforeUrl) {
                await page
                    .waitForURL(url => url.toString() !== beforeUrl, { timeout: browserTimeout(this.bot, 'optional') })
                    .catch(() => undefined)
            }
            await page.waitForLoadState('domcontentloaded', { timeout: browserTimeout(this.bot, 'navigation') })
            await this.bot.browser.utils.dismissMessages(page)
            await page
                .locator('article, main')
                .first()
                .waitFor({ state: 'attached', timeout: browserTimeout(this.bot, 'optional') })
                .catch(() => undefined)

            const dwell = this.bot.utils.randomDelay(
                this.bot.config.searchSettings.readDelay.min,
                this.bot.config.searchSettings.readDelay.max
            )
            const steps = 4
            const waitPerStep = Math.max(750, Math.floor(dwell / steps))
            this.bot.logger.info(
                this.bot.isMobile,
                'READ-DELAY',
                `Reading article | activity=read-to-earn | waitMs=${waitPerStep * steps} | scrollSteps=${steps}`
            )
            for (let step = 0; step < steps; step++) {
                this.bot.signal.throwIfAborted()
                await this.bot.utils.wait(waitPerStep)
                await humanScroll(
                    page,
                    { distance: this.bot.utils.randomDelay(450, 950) },
                    { timeout: browserTimeout(this.bot), signal: this.bot.signal }
                )
            }
        } finally {
            await clicked.close()
            if (!feedPage.isClosed() && feedPage.url() !== beforeUrl) {
                await feedPage
                    .goBack({ waitUntil: 'domcontentloaded', timeout: browserTimeout(this.bot, 'navigation') })
                    .catch(() => undefined)
                await this.bot.browser.utils.dismissMessages(feedPage).catch(() => undefined)
            }
        }
    }

    private normalizedLocale(): string {
        const locale = this.bot.accountLocale.locale.trim().toLowerCase()
        return /^[a-z]{2}-[a-z]{2}$/.test(locale) ? locale : 'en-us'
    }

    private isMsnPage(raw: string): boolean {
        try {
            return /(^|\.)msn\.com$/i.test(new URL(raw).hostname)
        } catch {
            return false
        }
    }

    private normalizeArticleKey(raw: string, base: string): string {
        if (!raw) return ''
        try {
            const url = new URL(raw, base)
            url.hash = ''
            url.search = ''
            return url.toString()
        } catch {
            return raw
        }
    }

    private safeTitle(raw: string): string {
        return raw.replace(/\s+/g, ' ').trim().slice(0, 120) || 'MSN article'
    }

    private logSummary(
        result: ActivityResult,
        browserReads: number,
        startProgress: number | null,
        finalProgress: number | null,
        fallback: boolean
    ): void {
        const message =
            `Read to Earn ${result.status} | reason=${result.reason}` +
            ` | browserReads=${browserReads} | fallback=${fallback}` +
            (startProgress === null && finalProgress === null
                ? ''
                : ` | progress=${startProgress ?? 'unknown'}->${finalProgress ?? 'unknown'}`) +
            ` | pointsGained=${result.pointsKnown === false ? 'unknown' : result.pointsGained}`
        this.bot.logger.debug(true, 'READ-TO-EARN', message)
    }
}
