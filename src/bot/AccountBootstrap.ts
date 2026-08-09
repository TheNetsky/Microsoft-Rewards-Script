import type { AppDashboardData } from '../interface/AppDashBoardData'
import type { DashboardData } from '../interface/DashboardData'
import type { AppEarnablePoints, BrowserEarnablePoints } from '../interface/Points'
import type { Account } from '../interface/Account'
import { normalizeCountry, resolveAccountLocale } from '../util/Locale'
import { saveResolvedRegion } from '../util/SessionStore'
import type { MicrosoftRewardsBot } from './MicrosoftRewardsBot'

export interface PreparedAccountContext {
    dashboardData: DashboardData
    appData: AppDashboardData | null
    initialPoints: number
    browserEarnable: BrowserEarnablePoints
    appEarnable: AppEarnablePoints | null
    appAvailable: boolean
    profileCountry: string | null
}

export async function prepareAccountContext(
    bot: MicrosoftRewardsBot,
    account: Account,
    accountEmail: string
): Promise<PreparedAccountContext> {
    const dashboardData: DashboardData = await bot.browser.func.getDashboardData()
    const profileCountry = normalizeCountry(dashboardData.dashboard.userProfile.attributes.country) ?? null

    if (account.geoLocale === 'auto') {
        if (profileCountry) {
            saveResolvedRegion(bot.config.sessionPath, accountEmail, profileCountry)
        } else {
            bot.logger.warn(
                'main',
                'GEO-LOCALE',
                `Microsoft profile returned an invalid country; retaining ${bot.accountLocale.country ?? 'US fallback'}`
            )
        }
    }

    bot.accountLocale = resolveAccountLocale(account, profileCountry ?? bot.accountLocale.country)
    bot.userData.langCode = bot.accountLocale.language
    bot.userData.geoLocale = bot.accountLocale.country ?? 'US'
    bot.http.setDefaultHeaders({
        'Accept-Language': bot.accountLocale.acceptLanguage
    })

    let appData: AppDashboardData | null = null

    if (bot.accessToken) {
        try {
            appData = await bot.browser.func.getAppDashboardData()
        } catch (error) {
            bot.logger.warn(
                'main',
                'LOGIN-APP',
                `App dashboard unavailable - app activities will be skipped this run | message=${error instanceof Error ? error.message : String(error)}`
            )
            bot.accessToken = ''
        }
    }

    bot.userData.initialPoints = dashboardData.dashboard.userStatus.availablePoints
    bot.userData.currentPoints = dashboardData.dashboard.userStatus.availablePoints
    const initialPoints = bot.userData.initialPoints ?? 0

    const browserEarnable = await bot.browser.func.getBrowserEarnablePoints()
    let appEarnable: AppEarnablePoints | null = null

    if (bot.accessToken) {
        try {
            appEarnable = await bot.browser.func.getAppEarnablePoints()
        } catch (error) {
            bot.logger.warn(
                'main',
                'LOGIN-APP',
                `App earnable-points lookup failed - app activities will be skipped this run | message=${error instanceof Error ? error.message : String(error)}`
            )
            bot.accessToken = ''
            appData = null
        }
    }

    const pointsCanCollect = browserEarnable.mobileSearchPoints + (appEarnable?.totalEarnablePoints ?? 0)
    const appAvailable = Boolean(bot.accessToken && appData)

    bot.logger.info(
        'main',
        'POINTS',
        `Earnable today | Mobile: ${pointsCanCollect} | Browser: ${browserEarnable.mobileSearchPoints} | App: ${
            appEarnable?.totalEarnablePoints ?? 0
        } | ${accountEmail} | locale: ${bot.accountLocale.locale}`
    )

    return { dashboardData, appData, initialPoints, browserEarnable, appEarnable, appAvailable, profileCountry }
}
