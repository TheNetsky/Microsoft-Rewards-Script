import type { BrowserContext, Cookie, Page } from 'patchright'
import type { AxiosRequestConfig } from 'axios'

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

    /**
     * Get dashboard data using the active page if available (most reliable for V4)
     */
    async getDashboardDataFromPage(page: Page): Promise<DashboardData> {
        try {
            await page.goto('https://rewards.bing.com/', { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {})
            const html = await page.content()

            const nextData = this.bot.nextParser.parse(html)
            if (nextData.length > 0) {
                this.bot.rewardsVersion = 'modern'
                this.bot.logger.debug(this.bot.isMobile, 'GET-DASHBOARD-DATA', 'Modern UI (V4) detected from Page')

                const match = html.match(/var\s+dashboard\s*=\s*({.*?});/s)
                const legacyData = match?.[1] ? JSON.parse(match[1]) : null

                return {
                    ...(legacyData ?? {}),
                    v4Data: nextData,
                    userStatus: legacyData?.userStatus ?? {
                        availablePoints: this.bot.nextParser.find(nextData, 'availablePoints') ?? 0,
                        counters: {
                            pcSearch: this.bot.nextParser.find(nextData, 'pcSearch') ?? [],
                            mobileSearch: this.bot.nextParser.find(nextData, 'mobileSearch') ?? []
                        }
                    },
                    userProfile: legacyData?.userProfile ?? {
                        attributes: {
                            country:
                                this.bot.nextParser.find(nextData, 'country') ||
                                this.bot.nextParser.find(nextData, 'market')?.split('-')[1] ||
                                'US'
                        }
                    }
                } as unknown as DashboardData
            }

            const match = html.match(/var\s+dashboard\s*=\s*({.*?});/s)
            if (match?.[1]) {
                this.bot.rewardsVersion = 'legacy'
                return JSON.parse(match[1]) as DashboardData
            }

            throw new Error('No dashboard data found in Page HTML')
        } catch (error) {
            this.bot.logger.warn(this.bot.isMobile, 'GET-DASHBOARD-DATA', `Page extraction failed: ${error}`)
            return await this.getDashboardData() // Fallback to Axios
        }
    }

    async getDashboardData(): Promise<DashboardData> {
        // Fallback: Standard V3 API
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
                    Referer: 'https://rewards.bing.com/',
                    Origin: 'https://rewards.bing.com'
                }
            }

            const response = await this.bot.axios.request(request)

            if (response.data?.dashboard) {
                return response.data.dashboard as DashboardData
            }
            throw new Error('Dashboard data missing from API response')
        } catch (error) {
            // Final fallback: try dashboard HTML via Axios
            const request: AxiosRequestConfig = {
                url: this.bot.config.baseURL,
                method: 'GET',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {}),
                    Cookie: this.buildCookieHeader(this.bot.cookies.mobile),
                    Referer: 'https://rewards.bing.com/',
                    Origin: 'https://rewards.bing.com'
                }
            }

            const response = await this.bot.axios.request(request)
            const nextData = this.bot.nextParser.parse(response.data)
            if (nextData.length > 0) {
                this.bot.rewardsVersion = 'modern'
                return { v4Data: nextData } as unknown as DashboardData
            }

            const match = response.data.match(/var\s+dashboard\s*=\s*({.*?});/s)
            if (match?.[1]) {
                return JSON.parse(match[1]) as DashboardData
            }

            throw new Error('All dashboard data fetch methods failed')
        }
    }

    /**
     * Fetch user panel flyout data (V4 alternative source)
     * @returns {PanelFlyoutData} Object of user bing rewards dashboard data
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
                `Error fetching panel flyout data: ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }

    async getSearchPoints(): Promise<Counters> {
        const dashboardData = await this.getDashboardData()
        return dashboardData.userStatus.counters
    }

    missingSearchPoints(counters: Counters, isMobile: boolean): MissingSearchPoints {
        const pcSearch = counters.pcSearch ?? []
        const mobileSearch = counters.mobileSearch ?? []

        // V4 format: search entries may be in pcSearch array with deviceType区分
        let mobileData: any = undefined
        let desktopData: any = undefined

        if (pcSearch.length > 0) {
            // Try to find separate desktop/mobile entries
            desktopData = pcSearch.find(
                (x: any) => x.promotionType === 'search' && !x.deviceType?.toLowerCase().includes('mobile')
            )
            mobileData = pcSearch.find(
                (x: any) => x.promotionType === 'search' && x.deviceType?.toLowerCase().includes('mobile')
            )

            // Fallback to first entry
            if (!desktopData && !mobileData && pcSearch[0]) {
                desktopData = pcSearch[0]
            }
        }

        // Legacy fallback
        if (!mobileData && mobileSearch.length > 0) {
            mobileData = mobileSearch[0]
        }

        const mobilePoints = mobileData
            ? Math.max(0, (mobileData.pointProgressMax || 0) - (mobileData.pointProgress || 0))
            : 0
        const desktopPoints = desktopData
            ? Math.max(0, (desktopData.pointProgressMax || 0) - (desktopData.pointProgress || 0))
            : 0
        const edgePoints = 0

        const totalPoints = isMobile ? mobilePoints : desktopPoints

        return { mobilePoints, desktopPoints, edgePoints, totalPoints }
    }

    async getBrowserEarnablePoints(data?: DashboardData): Promise<BrowserEarnablePoints> {
        try {
            // For V4 UI, we need to fetch counters from API since page data doesn't have them
            let dashboardData: DashboardData | undefined = data

            this.bot.logger.debug(
                this.bot.isMobile,
                'GET-POINTS',
                `rewardsVersion=${this.bot.rewardsVersion}, hasData=${!!data}`
            )

            if (this.bot.rewardsVersion === 'modern') {
                try {
                    const countersData = await this.getDashboardData()
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'GET-POINTS',
                        `API counters: pcSearch=${JSON.stringify(countersData.userStatus?.counters?.pcSearch)}, mobileSearch=${JSON.stringify(countersData.userStatus?.counters?.mobileSearch)}`
                    )
                    dashboardData = countersData
                } catch (e: any) {
                    this.bot.logger.debug(this.bot.isMobile, 'GET-POINTS', `API error: ${e.message}`)
                }
            } else {
                dashboardData = data ?? (await this.getDashboardData())
            }

            if (!dashboardData) {
                return {
                    dailySetPoints: 0,
                    morePromotionsPoints: 0,
                    desktopSearchPoints: 0,
                    mobileSearchPoints: 0,
                    totalEarnablePoints: 0
                }
            }

            const pcSearch = dashboardData.userStatus?.counters?.pcSearch ?? []
            const mobileSearch = dashboardData.userStatus?.counters?.mobileSearch ?? []

            // V4: mobileSearch may not exist - check if pcSearch has mobile-type entries
            let desktopSearchPoints = 0
            let mobileSearchPoints = 0

            if (pcSearch.length > 0) {
                // V4 format: check if there's separate mobile search in pcSearch array
                const desktopEntry = pcSearch.find(
                    (x: any) => x.promotionType === 'search' && !x.deviceType?.toLowerCase().includes('mobile')
                )
                const mobileEntry = pcSearch.find(
                    (x: any) => x.promotionType === 'search' && x.deviceType?.toLowerCase().includes('mobile')
                )

                if (desktopEntry) {
                    desktopSearchPoints = Math.max(
                        0,
                        (desktopEntry.pointProgressMax || 0) - (desktopEntry.pointProgress || 0)
                    )
                }
                if (mobileEntry) {
                    mobileSearchPoints = Math.max(
                        0,
                        (mobileEntry.pointProgressMax || 0) - (mobileEntry.pointProgress || 0)
                    )
                } else if (mobileSearch.length > 0) {
                    // Legacy V3 format
                    mobileSearchPoints = mobileSearch.reduce(
                        (sum: number, x: any) => sum + Math.max(0, (x.pointProgressMax || 0) - (x.pointProgress || 0)),
                        0
                    )
                }
                // If no desktop/mobile split found, use first entry as desktop
                if (desktopSearchPoints === 0 && mobileSearchPoints === 0 && pcSearch[0]) {
                    desktopSearchPoints = Math.max(
                        0,
                        (pcSearch[0].pointProgressMax || 0) - (pcSearch[0].pointProgress || 0)
                    )
                }
            }

            let dailySetPoints = 0
            let morePromotionsPoints = 0

            if (this.bot.rewardsVersion === 'modern' && (dashboardData as any).v4Data) {
                const v4Data = (dashboardData as any).v4Data
                const dailySetItems = this.bot.nextParser.find(v4Data, 'dailySetItems') ?? []
                const moreActivities = this.bot.nextParser.find(v4Data, 'moreActivities') ?? []

                dailySetPoints = dailySetItems.reduce(
                    (sum: number, x: any) => sum + (!x.isCompleted ? x.points || 0 : 0),
                    0
                )
                morePromotionsPoints = moreActivities.reduce(
                    (sum: number, x: any) => sum + (!x.isCompleted ? x.points || 0 : 0),
                    0
                )
            } else {
                const todayDate = this.bot.utils.getFormattedDate()
                if (dashboardData.dailySetPromotions?.[todayDate]) {
                    dailySetPoints = dashboardData.dailySetPromotions[todayDate].reduce(
                        (sum, x) => sum + (x.pointProgressMax - x.pointProgress),
                        0
                    )
                }

                if (dashboardData.morePromotions) {
                    morePromotionsPoints = dashboardData.morePromotions.reduce((sum, x) => {
                        if (
                            ['quiz', 'urlreward'].includes(x.promotionType) &&
                            x.exclusiveLockedFeatureStatus !== 'locked'
                        ) {
                            return sum + (x.pointProgressMax - x.pointProgress)
                        }
                        return sum
                    }, 0)
                }
            }

            return {
                dailySetPoints,
                morePromotionsPoints,
                desktopSearchPoints,
                mobileSearchPoints,
                totalEarnablePoints: dailySetPoints + morePromotionsPoints + desktopSearchPoints + mobileSearchPoints
            }
        } catch (error) {
            this.bot.logger.error(this.bot.isMobile, 'GET-POINTS', `Error: ${error}`)
            throw error
        }
    }

    async getCurrentPoints(): Promise<number> {
        const data = await this.getDashboardData()
        return data.userStatus?.availablePoints ?? 0
    }

    async getAppDashboardData(): Promise<AppDashboardData> {
        const request: AxiosRequestConfig = {
            url: 'https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAIOS&options=613',
            method: 'GET',
            headers: {
                Authorization: `Bearer ${this.bot.accessToken}`,
                'User-Agent': 'Bing/32.5.431027001 (com.microsoft.bing; build:431027001; iOS 17.6.1) Alamofire/5.10.2'
            }
        }
        const response = await this.bot.axios.request(request)
        return response.data as AppDashboardData
    }

    async getAppEarnablePoints(): Promise<AppEarnablePoints> {
        try {
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
            const eligibleOffers = ['ENUS_readarticle3_30points', 'Gamification_Sapphire_DailyCheckIn']
            const eligibleActivities = userData.response.promotions.filter(x =>
                eligibleOffers.includes(x.attributes.offerid ?? '')
            )

            let readToEarn = 0
            let checkIn = 0

            for (const item of eligibleActivities) {
                const attrs = item.attributes
                if (attrs.type === 'msnreadearn') {
                    readToEarn = Math.max(0, parseInt(attrs.pointmax ?? '0') - parseInt(attrs.pointprogress ?? '0'))
                } else if (attrs.type === 'checkin') {
                    const progress = parseInt(attrs.progress ?? '0')
                    const checkInDay = progress % 7
                    const lastUpdated = new Date(attrs.last_updated ?? '')
                    if (checkInDay < 6 && new Date().getDate() !== lastUpdated.getDate()) {
                        checkIn = parseInt(attrs[`day_${checkInDay + 1}_points`] ?? '0')
                    }
                }
            }
            return { readToEarn, checkIn, totalEarnablePoints: readToEarn + checkIn }
        } catch {
            return { readToEarn: 0, checkIn: 0, totalEarnablePoints: 0 }
        }
    }

    async getXBoxDashboardData(): Promise<XboxDashboardData> {
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
    }

    async closeBrowser(browser: BrowserContext, email: string) {
        try {
            const cookies = await browser.cookies()
            await saveSessionData(this.bot.config.sessionPath, cookies, email, this.bot.isMobile)
            await browser.close()
        } catch {}
    }

    buildCookieHeader(cookies: Cookie[], allowedDomains?: string[]): string {
        return cookies
            .filter(c => !allowedDomains || allowedDomains.some(d => c.domain.includes(d)))
            .map(c => `${c.name}=${c.value}`)
            .join('; ')
    }
}
