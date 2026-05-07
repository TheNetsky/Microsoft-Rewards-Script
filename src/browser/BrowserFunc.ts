import type { BrowserContext, Cookie, Page } from 'patchright'
import type { AxiosRequestConfig, AxiosResponse } from 'axios'

import type { MicrosoftRewardsBot } from '../index'
import { saveSessionData } from '../util/Load'

import type { Counters, DashboardData } from './../interface/DashboardData'
import type { AppUserData } from '../interface/AppUserData'
import type { XboxDashboardData } from '../interface/XboxDashboardData'
import type { AppEarnablePoints, BrowserEarnablePoints, MissingSearchPoints } from '../interface/Points'
import type { AppDashboardData } from '../interface/AppDashBoardData'
import type { PanelFlyoutData } from '../interface/PanelFlyoutData'

export default class BrowserFunc {
    private bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    private formatError(error: unknown): string {
        return error instanceof Error ? error.message : String(error)
    }

    private extractDashboardJson(html: string): string | null {
        const marker = 'var dashboard ='
        const markerIndex = html.indexOf(marker)
        if (markerIndex === -1) {
            return null
        }

        const start = html.indexOf('{', markerIndex)
        if (start === -1) {
            return null
        }

        let depth = 0
        let inString = false
        let stringQuote = ''
        let escaped = false

        for (let i = start; i < html.length; i++) {
            const char = html[i]

            if (inString) {
                if (escaped) {
                    escaped = false
                } else if (char === '\\') {
                    escaped = true
                } else if (char === stringQuote) {
                    inString = false
                    stringQuote = ''
                }
                continue
            }

            if (char === '"' || char === "'") {
                inString = true
                stringQuote = char
                continue
            }

            if (char === '{') {
                depth++
            } else if (char === '}') {
                depth--
                if (depth === 0) {
                    return html.slice(start, i + 1)
                }
            }
        }

        return null
    }

    private isModernDashboardHtml(html: string): boolean {
        return html.includes('self.__next_f.push')
    }

    /**
     * Fetch user desktop dashboard data via getuserinfo API (primary) with HTML fallback.
     * Auto-detects modern dashboard and switches rewardsVersion accordingly.
     * @returns {DashboardData} Object of user bing rewards dashboard data
     */
    async getDashboardData(): Promise<DashboardData> {
        // Step 1: Always try the getuserinfo API first — works for both legacy and modern dashboards
        try {
            const request: AxiosRequestConfig = {
                url: 'https://rewards.bing.com/api/getuserinfo?type=1',
                method: 'GET',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {}),
                    Cookie: this.buildCookieHeader(this.bot.cookies.mobile, [
                        'bing.com',
                        'live.com',
                        'microsoftonline.com'
                    ]),
                    'Cache-Control': 'no-cache, no-store, max-age=0',
                    Pragma: 'no-cache',
                    Referer: 'https://rewards.bing.com/',
                    Origin: 'https://rewards.bing.com'
                }
            }

            const response = await this.bot.axios.request(request)
            if (response.data?.dashboard) {
                this.bot.logger.debug(this.bot.isMobile, 'GET-DASHBOARD-DATA', 'Dashboard data retrieved via getuserinfo API')
                return response.data.dashboard as DashboardData
            }
        } catch (apiError) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'GET-DASHBOARD-DATA',
                `getuserinfo API failed, falling back to HTML | error=${this.formatError(apiError)}`
            )
        }

        // Step 2: HTML fallback — fetch the rewards page and parse 'var dashboard ='
        try {
            const targetUrl = `${this.bot.config.baseURL}?_=${Date.now()}`
            let html = ''
            const page: Page | undefined = this.bot.isMobile ? this.bot.mainMobilePage : this.bot.mainDesktopPage

            if (!page || page.isClosed()) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'GET-DASHBOARD-DATA',
                    'Dashboard page unavailable, using HTTP HTML fallback'
                )

                const response = await this.bot.axios.request({
                    url: targetUrl,
                    method: 'GET',
                    headers: {
                        ...(this.bot.fingerprint?.headers ?? {}),
                        Cookie: this.buildCookieHeader(this.bot.cookies.mobile, [
                            'bing.com',
                            'live.com',
                            'microsoftonline.com'
                        ]),
                        'Cache-Control': 'no-cache, no-store, max-age=0',
                        Pragma: 'no-cache',
                        Referer: 'https://rewards.bing.com/',
                        Origin: 'https://rewards.bing.com'
                    }
                })
                html = typeof response.data === 'string' ? response.data : String(response.data ?? '')
            } else {
                try {
                    const response = await page.context().request.get(targetUrl, {
                        failOnStatusCode: false,
                        headers: {
                            'Cache-Control': 'no-cache, no-store, max-age=0',
                            Pragma: 'no-cache',
                            Referer: 'https://rewards.bing.com/'
                        }
                    })

                    if (!response.ok()) {
                        throw new Error(`Browser context request failed with status ${response.status()}`)
                    }

                    html = await response.text()
                } catch (contextRequestError) {
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'GET-DASHBOARD-DATA',
                        `Context request failed, trying page fetch fallback | error=${this.formatError(contextRequestError)}`
                    )

                    html = await page.evaluate(async ({ baseUrl, nonce }) => {
                        const response = await fetch(`${baseUrl}?_=${nonce}`, {
                            method: 'GET',
                            credentials: 'include',
                            cache: 'no-store',
                            headers: {
                                'Cache-Control': 'no-cache, no-store, max-age=0',
                                Pragma: 'no-cache'
                            }
                        })

                        if (!response.ok) {
                            throw new Error(`Page fetch failed with status ${response.status}`)
                        }

                        return await response.text()
                    }, { baseUrl: this.bot.config.baseURL, nonce: Date.now() })
                }
            }

            // Detect modern dashboard from HTML
            if (this.isModernDashboardHtml(html)) {
                this.bot.rewardsVersion = 'modern'
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'GET-DASHBOARD-DATA',
                    'Modern Rewards dashboard detected via HTML marker — getuserinfo API should have worked. Retrying API...'
                )

                // Retry getuserinfo once more now that we know it's modern
                const retryRequest: AxiosRequestConfig = {
                    url: 'https://rewards.bing.com/api/getuserinfo?type=1',
                    method: 'GET',
                    headers: {
                        ...(this.bot.fingerprint?.headers ?? {}),
                        Cookie: this.buildCookieHeader(this.bot.cookies.mobile, [
                            'bing.com',
                            'live.com',
                            'microsoftonline.com'
                        ]),
                        'Cache-Control': 'no-cache, no-store, max-age=0',
                        Pragma: 'no-cache',
                        Referer: 'https://rewards.bing.com/',
                        Origin: 'https://rewards.bing.com'
                    }
                }
                const retryResponse = await this.bot.axios.request(retryRequest)
                if (retryResponse.data?.dashboard) {
                    return retryResponse.data.dashboard as DashboardData
                }
                throw new Error('Modern dashboard detected but getuserinfo API returned no dashboard data')
            }

            const dashboardJson = this.extractDashboardJson(html)
            if (!dashboardJson) {
                throw new Error('Dashboard script marker not found in HTML and page is not modern dashboard')
            }

            return JSON.parse(dashboardJson) as DashboardData

        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'GET-DASHBOARD-DATA',
                `Failed to get dashboard data | mode=${this.bot.rewardsVersion === 'modern' ? 'modern-getuserinfo' : 'legacy-html'} | error=${this.formatError(error)}`
            )
            throw error
        }
    }

    /**
     * Fetch user panel flyout data
     * @returns {PanelFlyoutData} Object of user bing rewards panel flyout data
     */
    async getPanelFlyoutData(): Promise<PanelFlyoutData> {
        try {
            const request: AxiosRequestConfig = {
                url: 'https://www.bing.com/rewards/panelflyout/getuserinfo?channel=BingFlyout&partnerId=BingRewards',
                method: 'GET',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {}),
                    Cookie: this.buildCookieHeader(this.bot.cookies.mobile, [
                        'bing.com',
                        'live.com',
                        'microsoftonline.com'
                    ]),
                    Origin: 'https://www.bing.com'
                }
            }

            const response = await this.bot.axios.request(request)
            return response.data as PanelFlyoutData
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'GET-PANEL-FLYOUT-DATA',
                `Error fetching panel flyout data: ${this.formatError(error)}`
            )
            throw error
        }
    }

    /**
     * Fetch user app dashboard data
     * @returns {AppDashboardData} Object of user bing rewards dashboard data
     */
    async getAppDashboardData(): Promise<AppDashboardData> {
        try {
            const request: AxiosRequestConfig = {
                url: 'https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAIOS&options=613',
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${this.bot.accessToken}`,
                    'User-Agent':
                        'Bing/32.5.431027001 (com.microsoft.bing; build:431027001; iOS 17.6.1) Alamofire/5.10.2'
                }
            }

            const response = await this.bot.axios.request(request)
            return response.data as AppDashboardData
        } catch (error) {
            this.bot.logger.info(
                this.bot.isMobile,
                'GET-APP-DASHBOARD-DATA',
                `Error fetching dashboard data: ${this.formatError(error)}`
            )
            throw error
        }
    }

    /**
     * Fetch user xbox dashboard data
     * @returns {XboxDashboardData} Object of user bing rewards dashboard data
     */
    async getXBoxDashboardData(): Promise<XboxDashboardData> {
        try {
            const request: AxiosRequestConfig = {
                url: 'https://prod.rewardsplatform.microsoft.com/dapi/me?channel=xboxapp&options=6',
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${this.bot.accessToken}`,
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One X) AppleWebKit/537.36 (KHTML, like Gecko) Edge/18.19041'
                }
            }

            const response = await this.bot.axios.request(request)
            return response.data as XboxDashboardData
        } catch (error) {
            this.bot.logger.info(
                this.bot.isMobile,
                'GET-XBOX-DASHBOARD-DATA',
                `Error fetching dashboard data: ${this.formatError(error)}`
            )
            throw error
        }
    }

    /**
     * Get search point counters
     */
    async getSearchPoints(): Promise<Counters> {
        const dashboardData = await this.getDashboardData() // Always fetch newest data

        return dashboardData.userStatus.counters
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

    /**
     * Get total earnable points with web browser
     */
    async getBrowserEarnablePoints(): Promise<BrowserEarnablePoints> {
        try {
            const data = await this.getDashboardData()

            const desktopSearchPoints =
                data.userStatus.counters.pcSearch?.reduce(
                    (sum, x) => sum + (x.pointProgressMax - x.pointProgress),
                    0
                ) ?? 0

            const mobileSearchPoints =
                data.userStatus.counters.mobileSearch?.reduce(
                    (sum, x) => sum + (x.pointProgressMax - x.pointProgress),
                    0
                ) ?? 0

            const todayDate = this.bot.utils.getFormattedDate()
            const dailySetPoints =
                data.dailySetPromotions[todayDate]?.reduce(
                    (sum, x) => sum + (x.pointProgressMax - x.pointProgress),
                    0
                ) ?? 0

            const morePromotionsPoints =
                data.morePromotions?.reduce((sum, x) => {
                    if (
                        ['quiz', 'urlreward'].includes(x.promotionType) &&
                        x.exclusiveLockedFeatureStatus !== 'locked'
                    ) {
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
                `An error occurred: ${this.formatError(error)}`
            )
            throw error
        }
    }

    /**
     * Get total earnable points with mobile app
     */
    async getAppEarnablePoints(): Promise<AppEarnablePoints> {
        try {
            const eligibleOffers = ['ENUS_readarticle3_30points', 'Gamification_Sapphire_DailyCheckIn']

            const request: AxiosRequestConfig = {
                url: 'https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613',
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${this.bot.accessToken}`,
                    'X-Rewards-Country': this.bot.userData.geoLocale,
                    'X-Rewards-Language': 'en',
                    'X-Rewards-ismobile': 'true'
                }
            }

            const response = await this.bot.axios.request(request)
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
    /**
     * Get current point amount
     * @returns {number} Current total point amount
     */
    async getCurrentPoints(): Promise<number> {
        try {
            const data = await this.getDashboardData()

            if (!data || !data.userStatus) {
                this.bot.logger.error(
                    this.bot.isMobile,
                    'GET-CURRENT-POINTS',
                    `Invalid dashboard data structure: ${JSON.stringify(data, null, 2)}`
                )
                throw new Error(`Dashboard data missing userStatus: ${JSON.stringify(data)}`)
            }

            return data.userStatus.availablePoints
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'GET-CURRENT-POINTS',
                `An error occurred: ${this.formatError(error)}`
            )
            throw error
        }
    }

    async closeBrowser(browser: BrowserContext, email: string) {
        const browserWithRoot = browser as unknown as { browser?: () => { close: () => Promise<void> } | null }
        const rootBrowser = browserWithRoot.browser?.() || null

        const isClosedError = (e: unknown): boolean => {
            const msg = e instanceof Error ? e.message : String(e)
            return (
                msg.includes('Target page, context or browser has been closed') ||
                msg.includes('Target closed') ||
                msg.includes('Browser closed') ||
                msg.includes('Connection closed')
            )
        }

        try {
            // Try to save cookies — skip silently if context is already closed
            const cookies = await browser.cookies()
            this.bot.logger.debug(this.bot.isMobile, 'CLOSE-BROWSER', `Saving ${cookies.length} cookies.`)
            await saveSessionData(this.bot.config.sessionPath, cookies, email, this.bot.isMobile)

            await this.bot.utils.wait(2000)
        } catch (error) {
            if (isClosedError(error)) {
                // Context was already closed (e.g. by a previous cleanup call) — not an error
                this.bot.logger.debug(this.bot.isMobile, 'CLOSE-BROWSER', 'Session save skipped — browser context already closed.')
            } else {
                this.bot.logger.warn(this.bot.isMobile, 'CLOSE-BROWSER', `Failed to save session: ${error instanceof Error ? error.message : error}`)
            }
        } finally {
            try {
                await browser.close()

                if (rootBrowser) {
                    await rootBrowser.close().catch(() => {})
                }

                this.bot.logger.info(this.bot.isMobile, 'CLOSE-BROWSER', 'All browser resources closed.')
            } catch (closeError) {
                if (!isClosedError(closeError)) {
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'CLOSE-BROWSER',
                        'Shutdown encountered an error, but process exiting.'
                    )
                }
            }
        }
    }

    mergeCookies(response: AxiosResponse, currentCookieHeader: string = '', whitelist?: string[]): string {
        const cookieMap = new Map<string, string>(
            currentCookieHeader
                .split(';')
                .map(pair => pair.split('=').map(s => s.trim()))
                .filter(([name, value]) => name && value)
                .map(([name, value]) => [name, value] as [string, string])
        )

        const setCookieList = [response.headers['set-cookie']].flat().filter(Boolean) as string[]
        const cookiesByName = new Map(this.bot.cookies.mobile.map(c => [c.name, c]))

        for (const setCookie of setCookieList) {
            const [nameValue, ...attributes] = setCookie.split(';').map(s => s.trim())
            if (!nameValue) continue

            const [name, value] = nameValue.split('=').map(s => s.trim())

            if (!name) continue

            if (whitelist && !whitelist?.includes(name)) {
                continue
            }

            const attrs = this.parseAttributes(attributes)
            const existing = cookiesByName.get(name)

            if (!value) {
                if (existing) {
                    cookiesByName.delete(name)
                    this.bot.cookies.mobile = this.bot.cookies.mobile.filter(c => c.name !== name)
                }
                cookieMap.delete(name)
                continue
            }

            if (attrs.expires !== undefined && attrs.expires < Date.now() / 1000) {
                if (existing) {
                    cookiesByName.delete(name)
                    this.bot.cookies.mobile = this.bot.cookies.mobile.filter(c => c.name !== name)
                }
                cookieMap.delete(name)
                continue
            }

            cookieMap.set(name, value)

            if (existing) {
                this.updateCookie(existing, value, attrs)
            } else {
                this.bot.cookies.mobile.push(this.createCookie(name, value, attrs))
            }
        }

        return Array.from(cookieMap, ([name, value]) => `${name}=${value}`).join('; ')
    }

    private parseAttributes(attributes: string[]) {
        const attrs: {
            domain?: string
            path?: string
            expires?: number
            httpOnly?: boolean
            secure?: boolean
            sameSite?: Cookie['sameSite']
        } = {}

        for (const attr of attributes) {
            const [key, val] = attr.split('=').map(s => s?.trim())
            const lowerKey = key?.toLowerCase()

            switch (lowerKey) {
                case 'domain':
                case 'path': {
                    if (val) attrs[lowerKey] = val
                    break
                }
                case 'expires': {
                    if (val) {
                        const ts = Date.parse(val)
                        if (!isNaN(ts)) attrs.expires = Math.floor(ts / 1000)
                    }
                    break
                }
                case 'max-age': {
                    if (val) {
                        const maxAge = Number(val)
                        if (!isNaN(maxAge)) attrs.expires = Math.floor(Date.now() / 1000) + maxAge
                    }
                    break
                }
                case 'httponly': {
                    attrs.httpOnly = true
                    break
                }
                case 'secure': {
                    attrs.secure = true
                    break
                }
                case 'samesite': {
                    const normalized = val?.toLowerCase()
                    if (normalized && ['lax', 'strict', 'none'].includes(normalized)) {
                        attrs.sameSite = (normalized.charAt(0).toUpperCase() +
                            normalized.slice(1)) as Cookie['sameSite']
                    }
                    break
                }
            }
        }

        return attrs
    }

    private updateCookie(cookie: Cookie, value: string, attrs: ReturnType<typeof this.parseAttributes>) {
        cookie.value = value
        if (attrs.domain) cookie.domain = attrs.domain
        if (attrs.path) cookie.path = attrs.path
        //if (attrs.expires !== undefined) cookie.expires = attrs.expires
        //if (attrs.httpOnly) cookie.httpOnly = true
        //if (attrs.secure) cookie.secure = true
        //if (attrs.sameSite) cookie.sameSite = attrs.sameSite
    }

    private createCookie(name: string, value: string, attrs: ReturnType<typeof this.parseAttributes>): Cookie {
        return {
            name,
            value,
            domain: attrs.domain || '.bing.com',
            path: attrs.path || '/'
            /*
            ...(attrs.expires !== undefined && { expires: attrs.expires }),
            ...(attrs.httpOnly && { httpOnly: true }),
            ...(attrs.secure && { secure: true }),
            ...(attrs.sameSite && { sameSite: attrs.sameSite })
            */
        } as Cookie
    }

    buildCookieHeader(cookies: Cookie[], allowedDomains?: string[]): string {
        const filtered = cookies
            .filter(c => {
                if (!allowedDomains || allowedDomains.length === 0) return true
                return (
                    typeof c.domain === 'string' &&
                    allowedDomains.some(d => c.domain.toLowerCase().endsWith(d.toLowerCase()))
                )
            })

        // For duplicate cookie names, prefer a non-empty value (for auth cookies like _C_Auth),
        // otherwise keep the latest value.
        const latestByName = new Map<string, Cookie>()
        for (const cookie of filtered) {
            const existing = latestByName.get(cookie.name)
            if (!existing) {
                latestByName.set(cookie.name, cookie)
                continue
            }

            const existingHasValue = String(existing.value ?? '').length > 0
            const nextHasValue = String(cookie.value ?? '').length > 0

            if (!existingHasValue && nextHasValue) {
                latestByName.set(cookie.name, cookie)
                continue
            }
            if (existingHasValue && !nextHasValue) {
                continue
            }

            // If both are empty or both have values, keep the latest one.
            latestByName.set(cookie.name, cookie)
        }

        return [...latestByName.values()]
            .map(c => `${c.name}=${c.value}`)
            .join('; ')
    }
}
