import { randomBytes } from 'crypto'

import { URLs } from '../constants/urls'
import { BING_APP_USER_AGENT } from '../constants/userAgents'
import type { BrowserContext, Cookie, Page } from 'patchright'
import type { HttpRequestConfig } from '../util/Http'

import type { MicrosoftRewardsBot } from '../index'
import type { PageSnapshot, ParsedOffer } from './ReactFunc'
import { clearStorageState, loadSession, saveStorageState } from '../util/SessionStore'
import { isBrowserClosedError } from '../util/Utils'

import type { Counters, DashboardData } from './../interface/DashboardData'
import type { AppUserData } from '../interface/AppUserData'
import type { AppEarnablePoints, BrowserEarnablePoints, MissingSearchPoints } from '../interface/Points'
import type { AppDashboardData } from '../interface/AppDashBoardData'

// Fallback seed only. bcid is derived from the image BYTES, so a fixed seed produces the same blob each time
// Bing treats same search as a repeat search and credits nothing.
const VISUAL_SEARCH_IMAGE_URL = 'https://th.bing.com/th?id=OMR.VisualSearch.VNext.BackgroundImage.png&pid=Rewards'

// Bing's own wallpaper archive, used to rotate the seed. idx 0-7 covers the last 8 days
const VISUAL_SEARCH_ARCHIVE_SIZE = 8

export default class BrowserFunc {
    private bot: MicrosoftRewardsBot

    private bingJars = new Map<string, Map<string, string>>()
    private rewardsDeploymentId = ''

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    async getDashboardData(cookies?: Cookie[]): Promise<DashboardData> {
        try {
            const page = this.getActivePage()
            const fingerprintHeaders = { ...(this.bot.fingerprint?.headers ?? {}) }
            delete fingerprintHeaders['Cookie']
            delete fingerprintHeaders['cookie']

            if (page && !cookies) {
                const response = await page.request.get(URLs.rewards.userInfoApi, {
                    headers: {
                        ...fingerprintHeaders,
                        Referer: URLs.rewards.referer,
                        Origin: URLs.rewards.origin
                    },
                    timeout: 20000
                })

                if (!response.ok()) throw new Error(`Request failed with status code ${response.status()}`)

                await this.syncActiveCookies(page, 'GET-DASHBOARD-DATA')
                return (await response.json()) as DashboardData
            }

            const response = await this.bot.http.request<DashboardData>({
                url: URLs.rewards.userInfoApi,
                method: 'GET',
                headers: {
                    ...fingerprintHeaders,
                    Cookie: this.buildCookieHeader(await this.getRequestCookies(cookies, URLs.rewards.userInfoApi)),
                    Referer: URLs.rewards.referer,
                    Origin: URLs.rewards.origin
                }
            })

            await this.applyResponseCookies(URLs.rewards.userInfoApi, response.headers['set-cookie'])

            if (response.data) return response.data
            throw new Error('Dashboard data missing from API response')
        } catch (error) {
            throw this.bot.logger.error(
                this.bot.isMobile,
                'GET-DASHBOARD-DATA',
                `Failed to get dashboard data: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    async getAppDashboardData(): Promise<AppDashboardData> {
        try {
            const request: HttpRequestConfig = {
                url: URLs.platform.me('SAIOS'),
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${this.bot.accessToken}`,
                    'User-Agent': BING_APP_USER_AGENT
                }
            }

            const response = await this.bot.http.request(request)
            return response.data as AppDashboardData
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'GET-APP-DASHBOARD-DATA',
                `Error fetching dashboard data: ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }

    async getSearchPoints(): Promise<Counters> {
        const dashboardData = await this.getDashboardData() // Always fetch newest data

        return dashboardData.dashboard.userStatus.counters
    }

    missingSearchPoints(counters: Counters, isMobile: boolean): MissingSearchPoints {
        const mobileData = counters.mobileSearch?.[0]
        const desktopData = counters.pcSearch?.[0]
        const edgeData = counters.pcSearch?.[1]

        const mobilePoints = mobileData ? Math.max(0, mobileData.pointProgressMax - mobileData.pointProgress) : 0
        const desktopPoints = desktopData ? Math.max(0, desktopData.pointProgressMax - desktopData.pointProgress) : 0
        const edgePoints = edgeData ? Math.max(0, edgeData.pointProgressMax - edgeData.pointProgress) : 0

        const totalPoints = isMobile ? mobilePoints : desktopPoints + edgePoints

        return { mobilePoints, desktopPoints, edgePoints, totalPoints }
    }

    async getBrowserEarnablePoints(): Promise<BrowserEarnablePoints> {
        try {
            const data = await this.getDashboardData()

            const desktopSearchPoints =
                data.dashboard.userStatus.counters.pcSearch?.reduce(
                    (sum: number, x: { pointProgressMax: number; pointProgress: number }) =>
                        sum + (x.pointProgressMax - x.pointProgress),
                    0
                ) ?? 0

            const mobileSearchPoints =
                data.dashboard.userStatus.counters.mobileSearch?.reduce(
                    (sum: number, x: { pointProgressMax: number; pointProgress: number }) =>
                        sum + (x.pointProgressMax - x.pointProgress),
                    0
                ) ?? 0

            const todayDate = this.bot.utils.getFormattedDate()
            const dailySetPoints =
                data.dashboard.dailySetPromotions[todayDate]?.reduce(
                    (sum: number, x: { pointProgressMax: number; pointProgress: number }) =>
                        sum + (x.pointProgressMax - x.pointProgress),
                    0
                ) ?? 0

            const morePromotionsPoints =
                data.dashboard.morePromotions?.reduce((sum, x) => {
                    if (x.promotionType === 'urlreward' && x.exclusiveLockedFeatureStatus !== 'locked') {
                        return sum + (x.pointProgressMax - x.pointProgress)
                    }
                    return sum
                }, 0) ?? 0

            const totalEarnablePoints = desktopSearchPoints + mobileSearchPoints + dailySetPoints + morePromotionsPoints

            return {
                dailySetPoints,
                morePromotionsPoints,
                desktopSearchPoints,
                mobileSearchPoints,
                totalEarnablePoints
            }
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'GET-BROWSER-EARNABLE-POINTS',
                `An error occurred: ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }

    async getAppEarnablePoints(): Promise<AppEarnablePoints> {
        try {
            const eligibleOffers = ['ENUS_readarticle3_30points', 'Gamification_Sapphire_DailyCheckIn']

            const request: HttpRequestConfig = {
                url: URLs.platform.me('SAAndroid'),
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${this.bot.accessToken}`,
                    'X-Rewards-Country': this.bot.userData.geoLocale,
                    'X-Rewards-Language': 'en',
                    'X-Rewards-ismobile': 'true'
                }
            }

            const response = await this.bot.http.request<AppUserData>(request)
            const userData: AppUserData = response.data
            const eligibleActivities = userData.response.promotions.filter(x =>
                eligibleOffers.includes(x.attributes.offerid ?? '')
            )

            let readToEarn = 0
            let checkIn = 0

            for (const item of eligibleActivities) {
                const attrs = item.attributes

                if (attrs.type === 'msnreadearn') {
                    const pointMax = parseInt(attrs.pointmax ?? '0')
                    const pointProgress = parseInt(attrs.pointprogress ?? '0')
                    readToEarn = Math.max(0, pointMax - pointProgress)
                } else if (attrs.type === 'checkin') {
                    const progress = parseInt(attrs.progress ?? '0')
                    const checkInDay = progress % 7
                    const lastUpdated = new Date(attrs.last_updated ?? '')
                    const today = new Date()

                    if (checkInDay < 6 && today.getDate() !== lastUpdated.getDate()) {
                        checkIn = parseInt(attrs[`day_${checkInDay + 1}_points`] ?? '0')
                    }
                }
            }

            const totalEarnablePoints = readToEarn + checkIn

            return {
                readToEarn,
                checkIn,
                totalEarnablePoints
            }
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'GET-APP-EARNABLE-POINTS',
                `An error occurred: ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }

    async getCurrentPoints(): Promise<number> {
        try {
            const data = await this.getDashboardData()

            return data.dashboard.userStatus.availablePoints
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'GET-CURRENT-POINTS',
                `An error occurred: ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }

    async bootstrap(page: Page): Promise<void> {
        try {
            // /earn is the offers page
            await page.goto(URLs.rewards.earn, { waitUntil: 'domcontentloaded' })

            const earnDom = await page.content()
            const earnRaw = await this.fetchBootstrapHtml(page, URLs.rewards.earn, '/earn')

            this.rewardsDeploymentId = this.bot.browser.react.buildId(earnRaw || earnDom) ?? ''

            this.bot.nextRouterStateTree = this.bot.browser.react.routerStateTree('earn')

            // pull /dashboard HTML to capture chunks that /earn doesn't show
            const dashboardHtml = await this.fetchBootstrapHtml(page, URLs.rewards.dashboard, '/dashboard')

            const sources = [earnRaw, earnDom, dashboardHtml].filter(Boolean)
            this.bot.reactSnapshot = this.bot.browser.react.snapshotPage(sources)

            // discovered from chunks referenced by either page
            this.bot.nextActions = await this.resolveActionIds(page, sources)

            const dashboardRendered = /<section\b[^>]*\bid=["']dailyset["']/i.test(sources.join('\n'))
            if (!dashboardRendered) {
                throw new Error(
                    'Rewards dashboard did not render (no section#dailyset) - likely a login/redirect issue, aborting'
                )
            }

            if (!this.bot.reactSnapshot.offers.length) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'BOOTSTRAP',
                    'No offers parsed - page may not have rendered the RSC payload (check login/redirect)'
                )
            }

            if (!Object.keys(this.bot.nextActions).length) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'BOOTSTRAP',
                    'No action ids discovered - server-action calls will fail (bundle may have stripped names)'
                )
            }

            this.bot.logger.info(
                this.bot.isMobile,
                'BOOTSTRAP',
                `Context ready | actions=${Object.keys(this.bot.nextActions).length} | reportable=${this.bot.reactSnapshot.reportable.length} | available=${this.bot.reactSnapshot.account.availablePoints}`
            )

            this.bot.logger.info(
                this.bot.isMobile,
                'BUILD',
                `Rewards build | id=${this.rewardsDeploymentId || 'unknown'}`,
                'cyan'
            )
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'BOOTSTRAP',
                `Failed acquiring context | error=${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }

    private async fetchBootstrapHtml(page: Page, url: string, route: string): Promise<string> {
        try {
            const res = await page.request.get(url, { timeout: 20000 })
            if (res.ok()) return await res.text()

            this.bot.logger.warn(
                this.bot.isMobile,
                'BOOTSTRAP',
                `Failed to fetch ${route} HTML | status=${res.status()} - snapshot and action discovery may be incomplete`
            )
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'BOOTSTRAP',
                `Failed to fetch ${route} HTML | error=${error instanceof Error ? error.message : String(error)} - snapshot and action discovery may be incomplete`
            )
        }

        return ''
    }

    private async resolveActionIds(page: Page, htmls: string[]): Promise<Record<string, string>> {
        const result: Record<string, string> = {}

        try {
            const initialChunks = new Set<string>()
            const chunkRegex = /(?:\/_next\/)?(static\/chunks\/[\w\-./()]+?\.js)/g
            for (const html of htmls) {
                if (!html) continue
                for (const match of html.matchAll(chunkRegex)) {
                    initialChunks.add('/_next/' + match[1]!)
                }
            }

            if (initialChunks.size === 0) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'BOOTSTRAP',
                    'No initial chunks discovered in HTML - chunk reference shape may have changed'
                )
            }

            this.bot.logger.debug(this.bot.isMobile, 'BOOTSTRAP', `Fetching ${initialChunks.size} initial JS chunks`)
            const jsByPath = await this.fetchJsChunks(page, [...initialChunks])

            // dynamically-imported chunks, server actions inside popover
            const dynamicPaths: string[] = []
            for (const js of jsByPath.values()) {
                for (const path of this.extractDynamicChunkPaths(js)) {
                    if (!jsByPath.has(path) && !dynamicPaths.includes(path)) {
                        dynamicPaths.push(path)
                    }
                }
            }

            if (dynamicPaths.length) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'BOOTSTRAP',
                    `Fetching ${dynamicPaths.length} dynamic chunks discovered via webpack manifest`
                )
                const moreJs = await this.fetchJsChunks(page, dynamicPaths)
                for (const [path, js] of moreJs) jsByPath.set(path, js)
            }

            for (const [path, js] of jsByPath) {
                const filename = path.split('/').pop() ?? path
                const ids = this.bot.browser.react.extractActionIds(js)
                const names = Object.keys(ids.byName)

                if (names.length) {
                    Object.assign(result, ids.byName)
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'BOOTSTRAP',
                        `Found ${names.length} action id(s) in ${filename}: [${names.join(', ')}]`
                    )
                } else {
                    this.bot.logger.debug(this.bot.isMobile, 'BOOTSTRAP', `No server-action ids found in ${filename}`)
                }

                const namedSet = new Set(Object.values(ids.byName))
                const unnamed = ids.all.filter(id => !namedSet.has(id))
                if (unnamed.length) {
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'BOOTSTRAP',
                        `Found ${unnamed.length} unnamed action id(s) in ${filename}: [${unnamed.join(', ')}]`
                    )
                }
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'BOOTSTRAP',
                `Discovered ${Object.keys(result).length} action ids: [${Object.keys(result).join(', ')}]`
            )
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'BOOTSTRAP',
                `Failed resolving action ids | error=${error instanceof Error ? error.message : String(error)}`
            )
        }

        return result
    }

    private async fetchJsChunks(page: Page, paths: string[]): Promise<Map<string, string>> {
        const result = new Map<string, string>()

        await Promise.all(
            paths.map(async path => {
                try {
                    const res = await page.request.get(URLs.rewards.path(path))
                    if (res.ok()) {
                        result.set(path, await res.text())
                    }
                } catch (error) {
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'BOOTSTRAP',
                        `Chunk fetch failed | path=${path} | ${error instanceof Error ? error.message : String(error)}`
                    )
                }
            })
        )

        return result
    }

    private extractDynamicChunkPaths(js: string): string[] {
        const seen = new Set<string>()

        const builder = /static\/chunks\/"\s*\+\s*\w+\s*\+\s*"([-.])"\s*\+\s*\{([\s\S]*?)\}\s*\[/g
        for (const match of js.matchAll(builder)) {
            const sep = match[1]!
            for (const [, id, hash] of match[2]!.matchAll(/(\d+)\s*:\s*"([a-f0-9]+)"/g)) {
                seen.add(`/_next/static/chunks/${id}${sep}${hash}.js`)
            }
        }

        // If the builder shape changes, scan id:hash pairs globally
        if (!seen.size) {
            for (const [, id, hash] of js.matchAll(/\b(\d{2,6}):"([a-f0-9]{12,})"/g)) {
                seen.add(`/_next/static/chunks/${id}-${hash}.js`)
                seen.add(`/_next/static/chunks/${id}.${hash}.js`)
            }
        }

        return [...seen]
    }

    async closeBrowser(browser: BrowserContext, email: string, persistSession = true) {
        const rootBrowser = browser.browser?.() || null

        try {
            if (persistSession) {
                const storageState = await browser.storageState()
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'CLOSE-BROWSER',
                    `Saving session | cookies=${storageState.cookies.length} | origins=${storageState.origins.length}`
                )
                saveStorageState(this.bot.config.sessionPath, email, this.bot.isMobile, storageState)
            }
        } catch (error) {
            if (isBrowserClosedError(error)) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'CLOSE-BROWSER',
                    `Session not saved (browser already closing): ${error instanceof Error ? error.message : String(error)}`
                )
            } else {
                this.bot.logger.error(this.bot.isMobile, 'CLOSE-BROWSER', `Failed to save session: ${error}`)
            }
        } finally {
            try {
                await browser.close()

                if (rootBrowser) {
                    await rootBrowser.close().catch(() => {})
                }

                this.bot.logger.info(this.bot.isMobile, 'CLOSE-BROWSER', 'All browser resources closed.')
            } catch (error) {
                if (isBrowserClosedError(error)) {
                    this.bot.logger.debug(this.bot.isMobile, 'CLOSE-BROWSER', 'Browser was already closed.')
                } else {
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'CLOSE-BROWSER',
                        'Shutdown encountered an error, but process exiting.'
                    )
                }
            }
        }
    }

    private getActivePage(): Page | null {
        const page = this.bot.isMobile ? this.bot.mainMobilePage : this.bot.mainDesktopPage
        return page && !page.isClosed() ? page : null
    }

    async getRewardsPageHtml(url: string, route: string): Promise<string | null> {
        const page = this.getActivePage()
        if (!page) return await this.fetchRewardsHtml(url, route)

        try {
            const response = await page.request.get(url, { timeout: 20000 })
            if (response.ok()) {
                await this.syncActiveCookies(page, 'REWARDS-PAGE')
                return await response.text()
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'REWARDS-PAGE',
                `Failed to fetch ${route} | status=${response.status()}`
            )
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'REWARDS-PAGE',
                `Browser fetch failed for ${route} | ${error instanceof Error ? error.message : String(error)}`
            )
        }

        return await this.fetchRewardsHtml(url, route)
    }

    private async getRequestCookies(explicitCookies?: Cookie[], targetUrl?: string): Promise<Cookie[]> {
        if (explicitCookies) return targetUrl ? this.filterCookiesForUrl(explicitCookies, targetUrl) : explicitCookies

        const cachedCookies = this.bot.isMobile ? this.bot.cookies.mobile : this.bot.cookies.desktop
        const page = this.getActivePage()

        if (!page) return targetUrl ? this.filterCookiesForUrl(cachedCookies, targetUrl) : cachedCookies

        try {
            const context = page.context()
            const liveCookies = await context.cookies()
            if (!liveCookies.length)
                return targetUrl ? this.filterCookiesForUrl(cachedCookies, targetUrl) : cachedCookies

            this.updateCookieCache(liveCookies, 'COOKIE-SYNC')
            return targetUrl ? await context.cookies(targetUrl) : liveCookies
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'COOKIE-SYNC',
                `Using cached cookies because the active browser context could not be read | error=${error instanceof Error ? error.message : String(error)}`
            )
            return targetUrl ? this.filterCookiesForUrl(cachedCookies, targetUrl) : cachedCookies
        }
    }

    async checkpointActiveSession(source = 'SESSION-CHECKPOINT'): Promise<boolean> {
        const page = this.getActivePage()
        if (!page) {
            this.bot.logger.debug(
                this.bot.isMobile,
                source,
                'Could not checkpoint session because no active browser page is available'
            )
            return false
        }

        try {
            await this.syncActiveCookies(page, source, true)
            return true
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                source,
                `Could not checkpoint active session | error=${error instanceof Error ? error.message : String(error)}`
            )
            return false
        }
    }

    async clearActiveSessionState(page: Page, email: string, source = 'SESSION-RESET'): Promise<void> {
        const context = page.context()
        const previousState = await context.storageState().catch(() => ({ cookies: [], origins: [] }))

        await context.clearCookies()

        // Clear origin-bound browser storage as well. This makes the recovery path
        // equivalent to deleting the saved session, without replacing the fingerprint.
        try {
            await page.evaluate(() => {
                localStorage.clear()
                sessionStorage.clear()
            })
        } catch {}

        let clearedOrigins = 0
        try {
            const client = await context.newCDPSession(page)
            for (const entry of previousState.origins) {
                await client
                    .send('Storage.clearDataForOrigin', {
                        origin: entry.origin,
                        storageTypes: 'local_storage,indexeddb,websql,service_workers,cache_storage'
                    })
                    .catch(() => {})
                clearedOrigins++
            }
            await client.detach().catch(() => {})
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                source,
                `Origin-storage cleanup was only partially available | error=${error instanceof Error ? error.message : String(error)}`
            )
        }

        clearStorageState(this.bot.config.sessionPath, email, this.bot.isMobile)
        if (this.bot.isMobile) this.bot.cookies.mobile = []
        else this.bot.cookies.desktop = []
        this.resetHttpJars()

        this.bot.logger.debug(
            this.bot.isMobile,
            source,
            `Cleared active session state | cookies=${previousState.cookies.length} | origins=${clearedOrigins}`
        )
    }

    private updateCookieCache(liveCookies: Cookie[], source: string): boolean {
        const cachedCookies = this.bot.isMobile ? this.bot.cookies.mobile : this.bot.cookies.desktop
        const cookieState = (cookie: Cookie) =>
            JSON.stringify({
                value: cookie.value,
                expires: cookie.expires,
                httpOnly: cookie.httpOnly,
                secure: cookie.secure,
                sameSite: cookie.sameSite
            })
        const cachedByKey = new Map(
            cachedCookies.map(cookie => [`${cookie.domain}|${cookie.path}|${cookie.name}`, cookieState(cookie)])
        )
        const changed =
            cachedCookies.length !== liveCookies.length ||
            liveCookies.some(
                cookie => cachedByKey.get(`${cookie.domain}|${cookie.path}|${cookie.name}`) !== cookieState(cookie)
            )

        if (this.bot.isMobile) this.bot.cookies.mobile = liveCookies
        else this.bot.cookies.desktop = liveCookies

        if (changed) {
            this.bot.logger.debug(
                this.bot.isMobile,
                source,
                `Refreshed cookie cache | previous=${cachedCookies.length} | current=${liveCookies.length}`
            )
        }

        return changed
    }

    private async syncActiveCookies(page: Page, source: string, forcePersist = false): Promise<void> {
        try {
            const context = page.context()
            const liveCookies = await context.cookies()
            const changed = this.updateCookieCache(liveCookies, source)
            if (!changed && !forcePersist) return

            const email = this.bot.currentAccountEmail
            if (!email) return

            const storageState = await context.storageState()
            saveStorageState(this.bot.config.sessionPath, email, this.bot.isMobile, storageState)
            this.bot.logger.debug(
                this.bot.isMobile,
                source,
                `Persisted live browser session | cookies=${storageState.cookies.length} | origins=${storageState.origins.length}`
            )
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                source,
                `Could not persist refreshed cookies | error=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private filterCookiesForUrl(cookies: Cookie[], targetUrl: string): Cookie[] {
        const url = new URL(targetUrl)
        const host = url.hostname.toLowerCase()
        const requestPath = url.pathname || '/'
        const now = Date.now() / 1000

        return cookies
            .filter(cookie => {
                if (cookie.expires !== -1 && cookie.expires <= now) return false
                if (cookie.secure && url.protocol !== 'https:') return false

                const domain = cookie.domain.replace(/^\./, '').toLowerCase()
                if (host !== domain && !host.endsWith(`.${domain}`)) return false

                const cookiePath = cookie.path || '/'
                if (!requestPath.startsWith(cookiePath)) return false
                if (
                    requestPath.length > cookiePath.length &&
                    !cookiePath.endsWith('/') &&
                    requestPath.charAt(cookiePath.length) !== '/'
                )
                    return false

                return true
            })
            .sort((a, b) => (b.path?.length ?? 0) - (a.path?.length ?? 0))
    }

    private async applyResponseCookies(requestUrl: string, setCookieHeader?: string[] | string): Promise<void> {
        if (!setCookieHeader) return

        const rawCookies = Array.isArray(setCookieHeader)
            ? setCookieHeader
            : this.splitCombinedSetCookieHeader(setCookieHeader)
        if (!rawCookies.length) return

        const current = this.bot.isMobile ? this.bot.cookies.mobile : this.bot.cookies.desktop
        const updated = [...current]
        let changed = false

        for (const raw of rawCookies) {
            const parsed = this.parseSetCookie(raw, requestUrl)
            if (!parsed) continue

            const keyMatches = (cookie: Cookie) =>
                cookie.name === parsed.cookie.name &&
                cookie.domain === parsed.cookie.domain &&
                cookie.path === parsed.cookie.path
            const index = updated.findIndex(keyMatches)

            if (parsed.remove) {
                if (index >= 0) {
                    updated.splice(index, 1)
                    changed = true
                }
                continue
            }

            if (index >= 0) {
                if (JSON.stringify(updated[index]) !== JSON.stringify(parsed.cookie)) {
                    updated[index] = parsed.cookie
                    changed = true
                }
            } else {
                updated.push(parsed.cookie)
                changed = true
            }
        }

        if (!changed) return

        this.updateCookieCache(updated, 'COOKIE-SYNC')

        const email = this.bot.currentAccountEmail
        if (!email) return

        const saved = loadSession(this.bot.config.sessionPath, email, this.bot.isMobile)
        saveStorageState(this.bot.config.sessionPath, email, this.bot.isMobile, {
            cookies: updated,
            origins: saved?.storageState?.origins ?? []
        })
        this.bot.logger.debug(
            this.bot.isMobile,
            'COOKIE-SYNC',
            `Applied ${rawCookies.length} response cookie(s) and persisted the updated session`
        )
    }

    private parseSetCookie(raw: string, requestUrl: string): { cookie: Cookie; remove: boolean } | null {
        const parts = raw.split(';').map(part => part.trim())
        const first = parts.shift()
        if (!first) return null

        const equals = first.indexOf('=')
        if (equals <= 0) return null

        const request = new URL(requestUrl)
        const name = first.slice(0, equals).trim()
        const value = first.slice(equals + 1)
        let domain = request.hostname
        let cookiePath = this.defaultCookiePath(request.pathname)
        let expires = -1
        let secure = false
        let httpOnly = false
        let sameSite: Cookie['sameSite'] = 'Lax'
        let remove = false

        for (const attribute of parts) {
            const separator = attribute.indexOf('=')
            const attributeName = (separator < 0 ? attribute : attribute.slice(0, separator)).trim().toLowerCase()
            const attributeValue = separator < 0 ? '' : attribute.slice(separator + 1).trim()

            if (attributeName === 'domain' && attributeValue) domain = attributeValue.toLowerCase()
            else if (attributeName === 'path' && attributeValue) cookiePath = attributeValue
            else if (attributeName === 'secure') secure = true
            else if (attributeName === 'httponly') httpOnly = true
            else if (attributeName === 'expires' && attributeValue) {
                const parsed = Date.parse(attributeValue)
                if (Number.isFinite(parsed)) expires = parsed / 1000
            } else if (attributeName === 'max-age' && attributeValue) {
                const seconds = Number(attributeValue)
                if (Number.isFinite(seconds)) {
                    if (seconds <= 0) remove = true
                    else expires = Date.now() / 1000 + seconds
                }
            } else if (attributeName === 'samesite') {
                const normalized = attributeValue.toLowerCase()
                if (normalized === 'strict') sameSite = 'Strict'
                else if (normalized === 'none') sameSite = 'None'
                else sameSite = 'Lax'
            }
        }

        if (expires !== -1 && expires <= Date.now() / 1000) remove = true

        return {
            cookie: { name, value, domain, path: cookiePath, expires, httpOnly, secure, sameSite },
            remove
        }
    }

    private defaultCookiePath(pathname: string): string {
        if (!pathname || !pathname.startsWith('/') || pathname === '/') return '/'
        const lastSlash = pathname.lastIndexOf('/')
        return lastSlash <= 0 ? '/' : pathname.slice(0, lastSlash)
    }

    private splitCombinedSetCookieHeader(header: string): string[] {
        return header
            .split(/,(?=\s*[^;,=\s]+=[^;,]*)/g)
            .map(value => value.trim())
            .filter(Boolean)
    }

    buildCookieHeader(cookies: Cookie[], allowedDomains?: string[]): string {
        return cookies
            .filter(cookie => {
                if (!allowedDomains?.length) return true
                return allowedDomains.some(domain => cookie.domain.toLowerCase().endsWith(domain.toLowerCase()))
            })
            .map(cookie => `${cookie.name}=${cookie.value}`)
            .join('; ')
    }

    // Fire a nextjs RSC server action shared by UrlReward / ClaimReward / ClaimBonusPoints
    async reportServerAction(
        actionId: string,
        body: unknown[],
        opts?: { url?: string; referer?: string; routerStateTree?: string }
    ): Promise<{ status: number; acknowledged: boolean }> {
        const url = opts?.url ?? URLs.rewards.earn
        const referer = opts?.referer ?? url
        const routerStateTree = opts?.routerStateTree ?? this.bot.nextRouterStateTree

        const fingerprintHeaders = { ...this.bot.fingerprint.headers }
        delete fingerprintHeaders['Cookie']
        delete fingerprintHeaders['cookie']

        const headers = {
            ...fingerprintHeaders,
            Referer: referer,
            Origin: URLs.rewards.origin,
            Accept: 'text/x-component',
            'Content-Type': 'text/plain;charset=UTF-8',
            'Next-Action': actionId,
            'Next-Router-State-Tree': routerStateTree,
            ...(this.rewardsDeploymentId ? { 'X-Deployment-Id': this.rewardsDeploymentId } : {})
        }

        const page = this.getActivePage()
        if (page) {
            const response = await page.request.post(url, {
                headers,
                data: JSON.stringify(body),
                timeout: 20000
            })
            const responseBody = await response.text()
            await this.syncActiveCookies(page, 'SERVER-ACTION')

            return {
                status: response.status(),
                acknowledged: this.bot.utils.serverActionAcknowledged(responseBody)
            }
        }

        const response = await this.bot.http.request({
            url,
            method: 'POST',
            headers: {
                ...headers,
                Cookie: this.buildCookieHeader(await this.getRequestCookies(undefined, url))
            },
            data: JSON.stringify(body)
        })
        await this.applyResponseCookies(url, response.headers['set-cookie'])

        return {
            status: response.status,
            acknowledged: this.bot.utils.serverActionAcknowledged(response.data)
        }
    }

    async reportSearchActivity(
        query: string,
        opts?: { cvid?: string; cg?: string }
    ): Promise<{
        ig: string | null
        balance: number | null
        previousBalance: number | null
        gained: number | null
        searchPointsEarned: number | null
        searchPointsLimit: number | null
    }> {
        const cvid = opts?.cvid ?? randomBytes(16).toString('hex')
        const searchUrl = URLs.bing.search(query, cvid)
        const jar = this.getBingJar()

        const base = { ...(this.bot.fingerprint?.headers ?? {}) }
        delete base['Cookie']
        delete base['cookie']

        const empty = {
            ig: null,
            balance: null,
            previousBalance: null,
            searchPointsEarned: null,
            searchPointsLimit: null
        }

        const searchRes = await this.bot.http.request({
            url: searchUrl,
            method: 'GET',
            headers: {
                ...base,
                Cookie: this.jarToHeader(jar),
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1'
            }
        })
        this.mergeSetCookies(jar, searchRes.headers?.['set-cookie'] as string[] | string | undefined)

        const ig =
            typeof searchRes.data === 'string'
                ? ((searchRes.data.match(/\bIG:"([A-F0-9]{32})"/i) ??
                      searchRes.data.match(/[?&]IG=([A-F0-9]{32})\b/i))?.[1] ?? null)
                : null
        if (!ig) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'SEARCH-REPORT',
                `No IG for "${query}" - SERP not served as expected`
            )
            return { ...empty, gained: null }
        }

        const params = new URLSearchParams({ IG: ig, IID: 'SERP.5064', q: query, FORM: 'ANNTA1', cvid, ajaxreq: '1' })

        const reportUrl = `${URLs.bing.origin}/rewardsapp/reportActivity?${params.toString()}${opts?.cg ? `&cg=${opts.cg}` : ''}`

        const reportRes = await this.bot.http.request({
            url: reportUrl,
            method: 'POST',
            headers: {
                ...base,
                Cookie: this.jarToHeader(jar),
                Accept: '*/*',
                'Content-Type': 'application/x-www-form-urlencoded',
                Referer: searchUrl,
                Origin: URLs.bing.origin,
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                'X-Requested-With': 'XMLHttpRequest'
            },
            data: `url=${encodeURIComponent(searchUrl)}&V=web`
        })
        this.mergeSetCookies(jar, reportRes.headers?.['set-cookie'] as string[] | string | undefined)

        const parsed = this.parseReportResponse(reportRes.data)
        const gained =
            parsed.balance != null && parsed.previousBalance != null ? parsed.balance - parsed.previousBalance : null

        this.bot.logger.debug(
            this.bot.isMobile,
            'SEARCH-REPORT',
            `Reported "${query}" | ig=${ig} | pointsGained=${gained ?? 'n/a'} | currentBalance=${parsed.balance ?? 'n/a'} | searchPts=${parsed.searchPointsEarned ?? 'n/a'}/${parsed.searchPointsLimit ?? 'n/a'}`
        )

        return { ig, ...parsed, gained }
    }

    async reportVisualSearchActivity(visual: { bcid: string; query: string; serpUrl: string }): Promise<{
        ig: string | null
        balance: number | null
        previousBalance: number | null
        gained: number | null
        searchPointsEarned: number | null
        searchPointsLimit: number | null
    }> {
        const { bcid, query, serpUrl } = visual
        const empty = {
            ig: null,
            balance: null,
            previousBalance: null,
            searchPointsEarned: null,
            searchPointsLimit: null
        }

        const sourcePage = this.bot.mainDesktopPage
        if (!sourcePage || sourcePage.isClosed()) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH-REPORT',
                'Desktop page is unavailable - cannot run the visual-search browser flow'
            )
            return { ...empty, gained: null }
        }

        let visualPage: Page | null = null
        try {
            visualPage = await sourcePage.context().newPage()
            const reportResponsePromise = visualPage
                .waitForResponse(
                    response => {
                        if (response.request().method() !== 'POST') return false
                        try {
                            const responseUrl = new URL(response.url())
                            return (
                                responseUrl.origin === URLs.bing.origin &&
                                responseUrl.pathname.toLowerCase() === '/rewardsapp/reportactivity' &&
                                responseUrl.searchParams.get('bcid') === bcid
                            )
                        } catch {
                            return false
                        }
                    },
                    { timeout: 20000 }
                )
                .catch(() => null)

            await visualPage.goto(serpUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
            const reportResponse = await reportResponsePromise
            if (!reportResponse) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'VISUAL-SEARCH-REPORT',
                    `Bing did not issue reportActivity for "${query}" | bcid=${bcid.slice(0, 12)}`
                )
                return { ...empty, gained: null }
            }

            const responseUrl = new URL(reportResponse.url())
            const ig = responseUrl.searchParams.get('IG')
            const parsed = this.parseReportResponse(await reportResponse.text())
            const gained =
                parsed.balance != null && parsed.previousBalance != null
                    ? parsed.balance - parsed.previousBalance
                    : null

            this.bot.logger.debug(
                this.bot.isMobile,
                'VISUAL-SEARCH-REPORT',
                `Browser reported "${query}" | status=${reportResponse.status()} | ig=${ig ?? 'n/a'} | bcid=${bcid.slice(0, 12)} | pointsGained=${gained ?? 'n/a'} | currentBalance=${parsed.balance ?? 'n/a'} | searchPts=${parsed.searchPointsEarned ?? 'n/a'}/${parsed.searchPointsLimit ?? 'n/a'}`
            )

            return { ig, ...parsed, gained }
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH-REPORT',
                `Browser flow failed for "${query}" | ${error instanceof Error ? error.message : String(error)}`
            )
            return { ...empty, gained: null }
        } finally {
            await visualPage?.close().catch(() => {})
        }
    }

    async acquireVisualSearch(imageUrl?: string): Promise<{ bcid: string; query: string; serpUrl: string } | null> {
        try {
            const page = this.bot.mainDesktopPage
            if (!page || page.isClosed()) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'VISUAL-SEARCH-BCID',
                    'Desktop page is unavailable - cannot acquire a visual search'
                )
                return null
            }

            const seed = imageUrl ?? (await this.resolveVisualSearchImage(page))

            const base = { ...(this.bot.fingerprint?.headers ?? {}) }
            delete base['Cookie']
            delete base['cookie']

            const enc = encodeURIComponent(seed)
            const url =
                `${URLs.bing.origin}/images/kblob` + `?iss=sbi&form=SBIHMP&sbisrc=UrlPaste&vsimg=${enc}&imgurl=${enc}`

            const boundary = `----WebKitFormBoundary${randomBytes(8).toString('hex')}`
            const body = this.buildMultipart(boundary, [
                { name: 'cbir', value: 'sbi' },
                { name: 'imageBin', value: '' },
                { name: 'imgurl', value: '' }
            ])

            const res = await page.request.post(url, {
                headers: {
                    ...base,
                    Accept: 'application/json',
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    Referer: `${URLs.bing.origin}/visualsearch`,
                    Origin: URLs.bing.origin,
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin'
                },
                data: body,
                timeout: 20000
            })

            const responseData = await res.text()
            const redirectUrl = this.parseKblobRedirect(responseData)
            if (!redirectUrl) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'VISUAL-SEARCH-BCID',
                    `kblob returned no redirectUrl | status=${res.status()} - the endpoint/shape may have changed`
                )
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'VISUAL-SEARCH-BCID',
                    `kblob response: ${responseData.slice(0, 400)}`
                )
                return null
            }

            const redirect = new URL(redirectUrl, URLs.bing.origin)
            const bcid = redirect.searchParams.get('bcid')
            if (!bcid) {
                this.bot.logger.warn(this.bot.isMobile, 'VISUAL-SEARCH-BCID', `redirect had no bcid | ${redirectUrl}`)
                return null
            }

            const query = redirect.searchParams.get('q') ?? ''
            const serpUrl = redirect.toString()

            this.bot.logger.info(
                this.bot.isMobile,
                'VISUAL-SEARCH-BCID',
                `Acquired bcid=${bcid.slice(0, 14)} | q="${query}" | status=${res.status()} | seed=${seed.slice(0, 80)}`,
                'green'
            )
            return { bcid, query, serpUrl }
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH-BCID',
                `Failed to acquire visual search | ${error instanceof Error ? error.message : String(error)}`
            )
            return null
        }
    }

    private async resolveVisualSearchImage(page: Page): Promise<string> {
        const idx = Math.floor(Math.random() * VISUAL_SEARCH_ARCHIVE_SIZE)

        try {
            const res = await page.request.get(
                `${URLs.bing.origin}/HPImageArchive.aspx?format=js&idx=${idx}&n=1&mkt=en-US`,
                { timeout: 10000 }
            )

            if (res.ok()) {
                const payload = (await res.json()) as { images?: { url?: unknown }[] }
                const url = payload?.images?.[0]?.url
                if (typeof url === 'string' && url) {
                    return new URL(url, URLs.bing.origin).toString()
                }
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'VISUAL-SEARCH-BCID',
                `HPImageArchive returned no usable url | idx=${idx} | status=${res.status()} - using the static seed`
            )
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'VISUAL-SEARCH-BCID',
                `HPImageArchive lookup failed | ${error instanceof Error ? error.message : String(error)} - using the static seed`
            )
        }

        return VISUAL_SEARCH_IMAGE_URL
    }

    async refreshEarnSnapshot(): Promise<PageSnapshot | null> {
        const page = this.bot.isMobile ? this.bot.mainMobilePage : this.bot.mainDesktopPage
        const usePage = !!page && !page.isClosed()

        const fetchSnapshotPage = async (url: string, route: string): Promise<string | null> => {
            if (!usePage) return await this.fetchRewardsHtml(url, route)
            return await this.getRewardsPageHtml(url, route)
        }

        const pages = await Promise.all([
            fetchSnapshotPage(URLs.rewards.earn, '/earn'),
            fetchSnapshotPage(URLs.rewards.dashboard, '/dashboard')
        ])
        const availablePages = pages.filter((html): html is string => html !== null)

        return availablePages.length ? this.bot.browser.react.snapshotPage(availablePages) : null
    }

    private async fetchRewardsHtml(url: string, route: string): Promise<string | null> {
        try {
            const headers = { ...(this.bot.fingerprint?.headers ?? {}) }
            delete headers['Cookie']
            delete headers['cookie']

            const response = await this.bot.http.request<string>({
                url,
                method: 'GET',
                headers: {
                    ...headers,
                    Cookie: this.buildCookieHeader(await this.getRequestCookies(undefined, url)),
                    Referer: URLs.rewards.referer,
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                responseType: 'text'
            })

            await this.applyResponseCookies(url, response.headers['set-cookie'])
            return typeof response.data === 'string' ? response.data : null
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'EARN-SNAPSHOT',
                `Failed to fetch ${route} over http | ${error instanceof Error ? error.message : String(error)}`
            )
            return null
        }
    }

    async ensureOffer(offerId: string): Promise<ParsedOffer | null> {
        const cached = this.bot.reactSnapshot?.offers.find(o => o.offerId === offerId)
        if (cached) return cached

        this.bot.logger.debug(
            this.bot.isMobile,
            'EARN-SNAPSHOT',
            `${offerId} absent from the cached snapshot (offers=${this.bot.reactSnapshot?.offers.length ?? 0}) - refetching /earn and /dashboard`
        )

        const refreshed = await this.refreshEarnSnapshot()
        if (!refreshed) return null

        if (!this.bot.reactSnapshot || refreshed.offers.length >= this.bot.reactSnapshot.offers.length) {
            this.bot.reactSnapshot = refreshed
        }

        const live = refreshed.offers.find(o => o.offerId === offerId) ?? null

        this.bot.logger.debug(
            this.bot.isMobile,
            'EARN-SNAPSHOT',
            `Refetched /earn and /dashboard | offers=${refreshed.offers.length} | ${offerId} found=${!!live}`
        )

        return live
    }

    resetHttpJars(): void {
        this.bingJars.clear()
    }

    private getBingJar(): Map<string, string> {
        const src = this.bot.isMobile ? this.bot.cookies.mobile : this.bot.cookies.desktop
        const key = `${src.find(c => c.name === '_U')?.value ?? ''}|${this.bot.isMobile}`
        let jar = this.bingJars.get(key)
        if (!jar) {
            jar = new Map<string, string>()
            for (const c of src) {
                const domain = c.domain.replace(/^\./, '')
                if (domain === 'bing.com' || domain.endsWith('.bing.com')) jar.set(c.name, c.value)
            }
            this.bingJars.set(key, jar)
        }
        return jar
    }

    private mergeSetCookies(jar: Map<string, string>, setCookie?: string[] | string): void {
        if (!setCookie) return
        for (const raw of Array.isArray(setCookie) ? setCookie : [setCookie]) {
            const pair = raw.split(';', 1)[0] ?? ''
            const eq = pair.indexOf('=')
            if (eq <= 0) continue
            const name = pair.slice(0, eq).trim()
            const value = pair.slice(eq + 1).trim()
            if (!name) continue
            if (value === '' || /expires=Thu,\s*01\s*Jan\s*1970/i.test(raw) || /\bmax-age=0\b/i.test(raw))
                jar.delete(name)
            else jar.set(name, value)
        }
    }

    private jarToHeader(jar: Map<string, string>): string {
        return [...jar.entries()].map(([n, v]) => `${n}=${v}`).join('; ')
    }

    private parseReportResponse(data: unknown): {
        balance: number | null
        previousBalance: number | null
        searchPointsEarned: number | null
        searchPointsLimit: number | null
    } {
        const empty = { balance: null, previousBalance: null, searchPointsEarned: null, searchPointsLimit: null }
        if (typeof data !== 'string') return empty
        const m = data.match(/ModernRewards\.ReportActivity\((\{[\s\S]*?\})\)\s*;/)
        if (!m) return empty
        try {
            const s = JSON.parse(m[1] ?? '{}').RewardsSessionData ?? {}
            const num = (v: unknown) => (typeof v === 'number' ? v : null)
            return {
                balance: num(s.Balance),
                previousBalance: num(s.PreviousBalance),
                searchPointsEarned: num(s.DailySearchPointsEarned),
                searchPointsLimit: num(s.DailySearchPointsLimit)
            }
        } catch {
            return empty
        }
    }

    private buildMultipart(boundary: string, fields: { name: string; value: string }[]): Buffer {
        const parts: Buffer[] = []
        for (const f of fields) {
            parts.push(
                Buffer.from(
                    `--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"\r\n\r\n${f.value}\r\n`,
                    'utf8'
                )
            )
        }
        parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'))
        return Buffer.concat(parts)
    }

    private parseKblobRedirect(data: unknown): string | null {
        try {
            const obj = typeof data === 'string' ? JSON.parse(data) : data
            const url = (obj as { redirectUrl?: unknown })?.redirectUrl
            if (typeof url === 'string' && url.includes('bcid=')) return url
        } catch {}

        if (typeof data === 'string') {
            const m = data.match(/"redirectUrl"\s*:\s*"([^"]+)"/)
            const raw = m?.[1]
            if (raw && raw.includes('bcid=')) return raw.replace(/\\u002f/gi, '/').replace(/\\\//g, '/')
        }
        return null
    }
}
