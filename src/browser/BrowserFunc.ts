import { URLs } from '../constants/urls'
import { BING_APP_USER_AGENT } from '../constants/userAgents'
import type { BrowserContext, Cookie, Page } from 'patchright'
import type { HttpRequestConfig } from '../util/Http'

import type { MicrosoftRewardsBot } from '../index'
import type { PageSnapshot, ParsedOffer } from './ReactFunc'
import { loadSession, saveStorageState } from '../util/SessionStore'
import { isBrowserClosedError } from '../util/Utils'

import type { DashboardData } from './../interface/DashboardData'
import type { AppUserData } from '../interface/AppUserData'
import type { AppEarnablePoints, BrowserEarnablePoints } from '../interface/Points'
import type { AppDashboardData } from '../interface/AppDashBoardData'

export default class BrowserFunc {
    private bot: MicrosoftRewardsBot

    private rewardsDeploymentId = ''

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    async getDashboardData(cookies?: Cookie[]): Promise<DashboardData> {
        try {
            const fingerprintHeaders = { ...(this.bot.fingerprint?.headers ?? {}) }
            delete fingerprintHeaders['Cookie']
            delete fingerprintHeaders['cookie']

            const response = await this.bot.http.request<DashboardData>({
                url: URLs.rewards.userInfoApi,
                method: 'GET',
                headers: {
                    ...fingerprintHeaders,
                    Cookie: this.buildCookieHeader(this.getCachedCookies(cookies, URLs.rewards.userInfoApi)),
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
                    'User-Agent': BING_APP_USER_AGENT,
                    'X-Rewards-Country': this.bot.userData.geoLocale,
                    'X-Rewards-Language': this.bot.userData.langCode,
                    'X-Rewards-IsMobile': 'true'
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
                    'X-Rewards-Language': this.bot.userData.langCode,
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
            const snapshot = this.bot.browser.react.snapshotPage(sources)
            this.bot.reactSnapshot = snapshot
            if (this.bot.isMobile) this.bot.reactSnapshots.mobile = snapshot
            else this.bot.reactSnapshots.desktop = snapshot

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
        const direct = await this.fetchRewardsHtml(url, route)
        if (direct !== null) return direct

        const page = this.getActivePage()
        if (!page) return null

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

        return null
    }

    private getCachedCookies(explicitCookies?: Cookie[], targetUrl?: string): Cookie[] {
        const cookies = explicitCookies ?? (this.bot.isMobile ? this.bot.cookies.mobile : this.bot.cookies.desktop)
        return targetUrl ? this.filterCookiesForUrl(cookies, targetUrl) : cookies
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

    async synchronizeActiveBrowserCookies(source: string, applyCached = false): Promise<boolean> {
        const page = this.getActivePage()
        if (!page) return false

        try {
            const context = page.context()
            if (applyCached) {
                const cached = this.getCachedCookies().filter(
                    cookie => cookie.expires === -1 || cookie.expires > Date.now() / 1000
                )
                if (cached.length) await context.addCookies(cached)
            }

            this.updateCookieCache(await context.cookies(), source)
            return true
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                source,
                `Could not synchronize active browser cookies | error=${error instanceof Error ? error.message : String(error)}`
            )
            return false
        }
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
    ): Promise<{ status: number; acknowledged: boolean; availablePoints: number | null }> {
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

        const response = await this.bot.http.request({
            url,
            method: 'POST',
            headers: {
                ...headers,
                Cookie: this.buildCookieHeader(this.getCachedCookies(undefined, url))
            },
            data: JSON.stringify(body)
        })
        await this.applyResponseCookies(url, response.headers['set-cookie'])

        return {
            status: response.status,
            acknowledged: this.bot.utils.serverActionAcknowledged(response.data),
            availablePoints: this.bot.browser.react.availablePointsFromPayload(response.data)
        }
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
                    Cookie: this.buildCookieHeader(this.getCachedCookies(undefined, url)),
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
}
