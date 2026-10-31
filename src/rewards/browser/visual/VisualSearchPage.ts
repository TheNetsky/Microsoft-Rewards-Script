import { ghostClick } from '../../../browser/GhostClick'
import { humanScroll } from '../../../browser/HumanScroll'
import { browserTimeout } from '../../../browser/BrowserTiming'
import { BrowserTaskPage } from '../../../browser/BrowserTaskPage'
import type { Locator, Page, Response } from 'patchright'

import { URLs } from '../../../constants/urls'
import type { BotContext } from '../../../core/BotContext'
import type { VisualSearchCandidate } from '../../types/VisualSearchTypes'
import { parseBingSearchReport, type BingSearchReport } from '../../shared/search/BingSearchReport'
import { parseVisualSearchCandidate } from '../../shared/visual/VisualSearchCandidate'
import { ActivitySkipError } from '../../shared/ActivityResult'

const STATIC_SEED_URL = 'https://www.bing.com/th?id=ONUT.O66CW8id1T61HwI6ZqAhLg&w=186&h=88&c=7&rs=2&qlt=80&pid=PopNow'
const DOM_SEED_LIMIT = 12
const BING_NEWS_FEED = `${URLs.bing.origin}/news`
const SUBMIT_GRACE_MS = 2500

interface CapturedActivityResponse {
    url: string
    status: number
    acknowledged: boolean
    body: string | null
}

export class VisualSearchPage {
    private bingTask: BrowserTaskPage | null = null

    private readonly capturedReports = new Map<string, BingSearchReport>()

    constructor(private readonly bot: BotContext) {}

    async dispose(): Promise<void> {
        await this.bingTask?.close().catch(() => undefined)
        this.bingTask = null
        this.capturedReports.clear()
    }

    async acquire(imageUrl?: string): Promise<VisualSearchCandidate | null> {
        try {
            const seed = imageUrl ?? (await this.getSeedUrls())[0] ?? STATIC_SEED_URL
            const page = await this.openBingPage(URLs.bing.origin)
            if (!page) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'VISUAL-SEARCH-BCID',
                    'Desktop page is unavailable - cannot use the rendered Visual Search control'
                )
                return null
            }

            await page.bringToFront()
            const input = await this.revealUrlInput(page)
            if (!input) return null

            const reportPromise = page
                .waitForResponse(response => this.isActivityResponse(response), { timeout: browserTimeout(this.bot) })
                .then(response => this.captureActivityResponse(response))
                .catch(() => null)
            const navigationPromise = page
                .waitForURL(url => parseVisualSearchCandidate(url.toString()) !== null, {
                    waitUntil: 'domcontentloaded',
                    timeout: browserTimeout(this.bot, 'navigation')
                })
                .then(() => true)
                .catch(() => false)

            this.bot.logger.debug(
                this.bot.isMobile,
                'VISUAL-SEARCH-BCID',
                `Trying rendered Bing thumbnail seed | seed=${seed.slice(0, 120)}`
            )

            await ghostClick(page, input, browserTimeout(this.bot), this.bot.signal)
            await input.fill(seed, { timeout: browserTimeout(this.bot) })
            await page.waitForTimeout(this.bot.utils.randomDelay(700, 1200))

            const enteredSeed = await input.inputValue({ timeout: browserTimeout(this.bot) }).catch(() => '')
            if (!enteredSeed.trim()) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'VISUAL-SEARCH-BCID',
                    'Rendered image-URL field was empty after filling it'
                )
                return null
            }

            const submitted = await this.submitVisualSearch(page, input, navigationPromise)
            if (!submitted) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'VISUAL-SEARCH-BCID',
                    'The rendered image-URL field did not submit a Visual Search result'
                )
                return null
            }

            const navigated = await navigationPromise
            if (!navigated) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'VISUAL-SEARCH-BCID',
                    'Visual Search submission did not reach a result page before the navigation timeout'
                )
                return null
            }

            const candidate = parseVisualSearchCandidate(page.url())
            if (!candidate) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'VISUAL-SEARCH-BCID',
                    `Visual Search result had no bcid | url=${page.url()}`
                )
                return null
            }

            const reportResponse = await reportPromise
            if (reportResponse) {
                const reportedBcid = new URL(reportResponse.url).searchParams.get('bcid')
                if (!reportedBcid || reportedBcid === candidate.bcid) {
                    this.capturedReports.set(candidate.bcid, this.parseActivityResponse(reportResponse, candidate))
                }
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'VISUAL-SEARCH-BCID',
                `Acquired bcid=${candidate.bcid.slice(0, 14)} | q="${candidate.query}"` +
                    ` | seed=${seed.slice(0, 80)} | transport=browser-ui`
            )
            return candidate
        } catch (error) {
            this.bot.signal.throwIfAborted()
            if (error instanceof ActivitySkipError) throw error
            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH-BCID',
                `Rendered Visual Search flow failed | ${error instanceof Error ? error.message : String(error)}`
            )
            return null
        }
    }

    async getSeedUrls(): Promise<string[]> {
        const page = await this.getBingPage()
        if (!page) return [STATIC_SEED_URL]

        const feedUrls = [URLs.bing.origin, BING_NEWS_FEED]
        const collected: string[] = []

        for (const feedUrl of feedUrls) {
            try {
                const response = await page
                    .goto(feedUrl, { waitUntil: 'domcontentloaded', timeout: browserTimeout(this.bot, 'navigation') })
                    .catch(() => null)
                if (!response || response.status() >= 400) continue

                await this.bot.browser.utils.dismissMessages(page).catch(() => undefined)
                await page
                    .locator('img[src], img[data-src], source[srcset]')
                    .first()
                    .waitFor({ state: 'attached', timeout: browserTimeout(this.bot) })
                    .catch(() => undefined)

                await this.collectThumbnails(page, feedUrl, collected)

                if (collected.length >= DOM_SEED_LIMIT) break

                const distance = await page.evaluate(() => Math.max(window.innerHeight * 2, 1200))
                await humanScroll(page, { distance }, { timeout: browserTimeout(this.bot), signal: this.bot.signal })
                await page.waitForTimeout(this.bot.utils.randomDelay(900, 1600))

                await this.collectThumbnails(page, feedUrl, collected)
            } catch (error) {
                this.bot.signal.throwIfAborted()
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'VISUAL-SEARCH-BCID',
                    `Could not read Bing feed thumbnails | url=${feedUrl} | ${error instanceof Error ? error.message : String(error)}`
                )
            }
        }

        if (collected.length) {
            const preferred = collected.filter(seed => seed.startsWith(`${URLs.bing.origin}/th?`))
            const fallback = collected.filter(seed => !seed.startsWith(`${URLs.bing.origin}/th?`))
            this.bot.utils.shuffleArray(preferred)
            this.bot.utils.shuffleArray(fallback)
            const selected = [...preferred, ...fallback].slice(0, DOM_SEED_LIMIT)
            this.bot.logger.debug(
                this.bot.isMobile,
                'VISUAL-SEARCH-BCID',
                `Prepared ${selected.length} seed(s) from rendered Bing feed thumbnails` +
                    ` | preferredBingThumbnails=${preferred.length} | transport=browser-ui`
            )
            return selected
        }

        this.bot.logger.warn(
            this.bot.isMobile,
            'VISUAL-SEARCH-BCID',
            'No rendered Bing feed thumbnail URL was available - using the static Visual Search seed'
        )
        return [STATIC_SEED_URL]
    }

    private async collectThumbnails(page: Page, baseUrl: string, collected: string[]): Promise<void> {
        const candidates = await page.locator('img[src], img[data-src], source[srcset]').evaluateAll(elements => {
            const values: string[] = []
            for (const element of elements) {
                if (element instanceof HTMLImageElement) {
                    if (element.currentSrc) values.push(element.currentSrc)
                    if (element.src) values.push(element.src)
                    const dataSrc = element.getAttribute('data-src')
                    if (dataSrc) values.push(dataSrc)
                }

                const srcset = element.getAttribute('srcset')
                if (srcset) {
                    for (const entry of srcset.split(',')) {
                        const candidate = entry.trim().split(/\s+/)[0]
                        if (candidate) values.push(candidate)
                    }
                }
            }
            return values
        })

        for (const raw of candidates) {
            const normalized = this.normalizeBingThumbnail(raw, baseUrl)
            if (normalized && !collected.includes(normalized)) collected.push(normalized)
        }
    }

    private normalizeBingThumbnail(raw: string, baseUrl: string): string | null {
        try {
            const url = new URL(raw, baseUrl)
            if (url.protocol !== 'https:') return null

            const host = url.hostname.toLowerCase()
            if (host !== 'www.bing.com' && host !== 'bing.com' && host !== 'th.bing.com') return null

            const hasThumbnailId = Boolean(url.searchParams.get('id'))
            const isThumbnailPath = url.pathname.toLowerCase() === '/th'
            if (!isThumbnailPath || !hasThumbnailId) return null

            url.protocol = 'https:'
            url.hostname = 'www.bing.com'
            return url.toString()
        } catch {
            return null
        }
    }

    takeCapturedReport(candidate: VisualSearchCandidate): BingSearchReport {
        const report = this.capturedReports.get(candidate.bcid)
        this.capturedReports.delete(candidate.bcid)

        if (report) return report

        this.bot.logger.warn(
            this.bot.isMobile,
            'VISUAL-SEARCH-REPORT',
            `Bing did not issue reportActivity during the rendered Visual Search | bcid=${candidate.bcid.slice(0, 12)}`
        )
        return parseBingSearchReport(null)
    }

    private async openBingPage(url: string): Promise<Page | null> {
        const page = await this.getBingPage()
        if (!page) return null

        const response = await page
            .goto(url, { waitUntil: 'domcontentloaded', timeout: browserTimeout(this.bot, 'navigation') })
            .catch(() => null)
        if (!response || response.status() >= 400) return null

        await this.bot.browser.utils.dismissMessages(page).catch(() => undefined)
        return page
    }

    private async getBingPage(): Promise<Page | null> {
        if (this.bingTask && !this.bingTask.page.isClosed()) return this.bingTask.page
        await this.bingTask?.close().catch(() => undefined)
        this.bingTask = null

        const sourcePage = this.bot.isMobile ? this.bot.mainMobilePage : this.bot.mainDesktopPage
        if (!sourcePage || sourcePage.isClosed()) return null

        this.bingTask = await BrowserTaskPage.create(sourcePage).catch(() => null)
        return this.bingTask?.page ?? null
    }

    private async revealUrlInput(page: Page): Promise<Locator | null> {
        await this.ensureCookieConsentDismissed(page)
        const input = page
            .locator(
                '#sb_imgpst:visible, input[placeholder*="paste image" i]:visible, input[placeholder*="image or url" i]:visible'
            )
            .first()
        if (await input.isVisible().catch(() => false)) return input

        const launcher = page
            .locator(
                '#sb_cam_island:visible, #sb_sbi:visible, [role="button"][aria-label*="search using an image" i]:visible'
            )
            .first()
        await launcher.waitFor({ state: 'visible', timeout: browserTimeout(this.bot) }).catch(() => undefined)
        if (!(await launcher.isVisible().catch(() => false))) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH-BCID',
                'Rendered "Search using an image" control was not found'
            )
            return null
        }

        const dialog = page.locator('#sb_sbiap:visible, #sb_sbidialog:visible').first()
        for (let attempt = 1; attempt <= 2; attempt++) {
            await ghostClick(page, launcher, browserTimeout(this.bot), this.bot.signal)

            await this.ensureCookieConsentDismissed(page, Math.min(browserTimeout(this.bot, 'optional'), 1000))
            await input
                .waitFor({
                    state: 'visible',
                    timeout: browserTimeout(this.bot, attempt === 1 ? 'optional' : 'action')
                })
                .catch(() => undefined)
            if (await input.isVisible().catch(() => false)) return input

            if (await dialog.isVisible().catch(() => false)) {
                await input.waitFor({ state: 'visible', timeout: browserTimeout(this.bot) }).catch(() => undefined)
                if (await input.isVisible().catch(() => false)) return input
                break
            }
            if (attempt === 1) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'VISUAL-SEARCH-BCID',
                    'Visual Search dialog did not open; retrying the camera button after initialization'
                )
            }
        }

        this.bot.logger.warn(
            this.bot.isMobile,
            'VISUAL-SEARCH-BCID',
            'Rendered image-URL field did not appear after clicking Visual Search'
        )
        return null
    }

    private async ensureCookieConsentDismissed(page: Page, waitMs = 0): Promise<void> {
        if (!(await this.bot.browser.utils.dismissCookieConsent(page, waitMs))) {
            throw new ActivitySkipError(
                'cookie-consent-blocked',
                'Cookie consent could not be dismissed; Visual Search controls remain covered'
            )
        }
    }

    private async submitVisualSearch(
        page: Page,
        input: Locator,
        navigationPromise: Promise<boolean>
    ): Promise<boolean> {
        this.bot.logger.debug(
            this.bot.isMobile,
            'VISUAL-SEARCH-BCID',
            'Submitting rendered Visual Search URL and waiting for Bing to open the result'
        )

        await input.press('Enter', { timeout: browserTimeout(this.bot) }).catch(() => undefined)
        const afterEnter = await Promise.race([
            navigationPromise,
            page.waitForTimeout(SUBMIT_GRACE_MS).then(() => false)
        ])
        if (afterEnter) return true

        const submit = page
            .locator(
                '#sb_sbiap button[type="submit"]:visible, #sb_sbidialog button[type="submit"]:visible,' +
                    ' #sb_sbiap input[type="submit"]:visible, #sb_sbidialog input[type="submit"]:visible,' +
                    ' #sb_sbiap [role="button"][aria-label*="search" i]:visible,' +
                    ' #sb_sbidialog [role="button"][aria-label*="search" i]:visible'
            )
            .first()
        if (await submit.isVisible().catch(() => false)) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'VISUAL-SEARCH-BCID',
                'Enter did not navigate yet; clicking the rendered Visual Search submit control'
            )
            await ghostClick(page, submit, browserTimeout(this.bot), this.bot.signal).catch(() => undefined)
        } else {
            this.bot.logger.debug(
                this.bot.isMobile,
                'VISUAL-SEARCH-BCID',
                'No separate Visual Search submit control was visible; waiting for the Enter submission'
            )
        }

        return await navigationPromise
    }

    private isActivityResponse(response: Response): boolean {
        if (response.request().method() !== 'POST') return false
        try {
            const url = new URL(response.url())
            return url.origin === URLs.bing.origin && url.pathname.toLowerCase() === '/rewardsapp/reportactivity'
        } catch {
            return false
        }
    }

    private async captureActivityResponse(response: Response): Promise<CapturedActivityResponse> {
        const captured: CapturedActivityResponse = {
            url: response.url(),
            status: response.status(),
            acknowledged: response.ok(),
            body: null
        }

        try {
            captured.body = await response.text()
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'VISUAL-SEARCH-REPORT',
                `reportActivity response body became unavailable after navigation; keeping the acknowledgement` +
                    ` | status=${captured.status} | ${error instanceof Error ? error.message : String(error)}`
            )
        }

        return captured
    }

    private parseActivityResponse(
        response: CapturedActivityResponse,
        candidate: VisualSearchCandidate
    ): BingSearchReport {
        const ig = new URL(response.url).searchParams.get('IG')
        const report = parseBingSearchReport(response.body, response.acknowledged, ig)

        this.bot.logger.debug(
            this.bot.isMobile,
            'VISUAL-SEARCH-REPORT',
            `Bing reported "${candidate.query}" | source=rendered-control | status=${response.status}` +
                ` | acknowledged=${response.acknowledged} | ig=${ig ?? 'n/a'} | bcid=${candidate.bcid.slice(0, 12)}` +
                ` | sessionBalanceDelta=${report.sessionBalanceDelta ?? 'unknown'} | currentBalance=${report.balance ?? 'n/a'}` +
                ` | searchPts=${report.searchPointsEarned ?? 'n/a'}/${report.searchPointsLimit ?? 'n/a'}`
        )

        return report
    }
}
