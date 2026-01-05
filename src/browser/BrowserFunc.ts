import type { BrowserContext, Cookie } from 'patchright'
import type { AxiosRequestConfig, AxiosResponse } from 'axios'

import type { MicrosoftRewardsBot } from '../index'
import { saveSessionData } from '../util/Load'

import type { Counters, DashboardData } from './../interface/DashboardData'
import type { AppUserData } from '../interface/AppUserData'
import type { XboxDashboardData } from '../interface/XboxDashboardData'
import type { AppEarnablePoints, BrowserEarnablePoints, MissingSearchPoints } from '../interface/Points'
import type { AppDashboardData } from '../interface/AppDashBoardData'

export default class BrowserFunc {
    private bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    /**
     * Fetch user desktop dashboard data
     * @returns {DashboardData} Object of user bing rewards dashboard data
     */
    async getDashboardData(): Promise<DashboardData> {
        try {
            const cookieHeader = this.bot.cookies.mobile
                .map((c: { name: string; value: string }) => `${c.name}=${c.value}`)
                .join('; ')

            const request: AxiosRequestConfig = {
                url: 'https://rewards.bing.com/api/getuserinfo?type=1',
                method: 'GET',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {}),
                    Cookie: cookieHeader,
                    Referer: 'https://rewards.bing.com/',
                    Origin: 'https://rewards.bing.com'
                }
            }

            const response = await this.bot.axios.request(request)
            return response.data.dashboard as DashboardData
        } catch (error) {
            this.bot.logger.info(
                this.bot.isMobile,
                'GET-DASHBOARD-DATA',
                `Error fetching dashboard data: ${error instanceof Error ? error.message : String(error)}`
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
                `Error fetching dashboard data: ${error instanceof Error ? error.message : String(error)}`
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
                `Error fetching dashboard data: ${error instanceof Error ? error.message : String(error)}`
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
                `An error occurred: ${error instanceof Error ? error.message : String(error)}`
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

            return data.userStatus.availablePoints
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'GET-CURRENT-POINTS',
                `An error occurred: ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }

    async closeBrowser(browser: BrowserContext, email: string) {
        try {
            const cookies = await browser.cookies()

            // Save cookies
            this.bot.logger.debug(
                this.bot.isMobile,
                'CLOSE-BROWSER',
                `Saving ${cookies.length} cookies to session folder!`
            )
            await saveSessionData(this.bot.config.sessionPath, cookies, email, this.bot.isMobile)

            await this.bot.utils.wait(2000)

            // Close browser
            await browser.close()
            this.bot.logger.info(this.bot.isMobile, 'CLOSE-BROWSER', 'Browser closed cleanly!')
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'CLOSE-BROWSER',
                `An error occurred: ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
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
}
