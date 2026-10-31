import type { Cookie } from 'patchright'

import { URLs } from '../../../constants/urls'
import type { AppDashboardData } from '../../app/types/AppDashboardData'
import { parseAppDashboard } from '../../app/AppResponses'
import type { BotContext } from '../../../core/BotContext'
import { filterCookiesForUrl } from '../../../network/CookieUtils'

export interface EdgeReportedActivity {
    type?: number | string
    q?: number
    a?: { offerid?: string }
}

interface EdgeActivityResponse {
    code?: number
    response?: {
        activity?: EdgeReportedActivity
        isDuplicate?: boolean
    }
}

export interface EdgeReportResult {
    status: number
    duplicate: boolean
    cookieNames: string[]
    activity?: EdgeReportedActivity
}

export class EdgePlatformClient {
    constructor(private readonly bot: BotContext) {}

    async getProfile(accessToken: string): Promise<AppDashboardData> {
        const response = await this.bot.http.request<unknown>({
            url: URLs.platform.edgeProfile,
            method: 'GET',
            headers: this.requestHeaders(accessToken)
        })

        return parseAppDashboard(response.data)
    }

    async submitActivity(accessToken: string, offerId: string, activityType: string): Promise<EdgeReportResult> {
        const { header: cookieHeader, names: cookieNames } = this.platformCookies()
        const response = await this.bot.http.request<EdgeActivityResponse>({
            url: URLs.platform.activities,
            method: 'POST',
            retries: 0,
            headers: {
                ...this.requestHeaders(accessToken, 'application/json'),
                ...(cookieHeader ? { Cookie: cookieHeader } : {})
            },
            data: {
                amount: 1,
                attributes: { offerid: offerId },
                request_user_info: true,
                type: activityType
            }
        })

        if (response.data.code !== 0) {
            throw new Error(`Edge activity returned code ${response.data.code ?? 'unknown'}`)
        }

        return {
            status: response.status,
            duplicate: response.data.response?.isDuplicate === true,
            cookieNames,
            activity: response.data.response?.activity
        }
    }

    private requestHeaders(accessToken: string, contentType?: string): Record<string, string> {
        return {
            ...this.bot.browser.userAgentManager.getRequestHeaders(false),
            Authorization: `Bearer ${accessToken}`,
            Accept: '*/*',
            'Accept-Language': this.bot.accountLocale.acceptLanguage,
            'X-Rewards-AppId': 'EdgeDesktop',
            'X-Rewards-PartnerId': 'EdgeHub',
            'X-Rewards-Country': this.bot.userData.geoLocale,
            'X-Rewards-Language': this.bot.userData.langCode,
            ...(contentType ? { 'Content-Type': contentType } : {})
        }
    }

    private platformCookies(): { header: string; names: string[] } {
        const allowedNames = new Set(['MUID', 'MC1'])
        const cookiesByName = new Map<string, Cookie>()
        const cookies = filterCookiesForUrl(this.bot.cookies.desktop, URLs.platform.activities)
            .filter(cookie => allowedNames.has(cookie.name))
            .sort((a, b) => (b.path?.length ?? 0) - (a.path?.length ?? 0) || b.domain.length - a.domain.length)

        for (const cookie of cookies) {
            if (!cookiesByName.has(cookie.name)) cookiesByName.set(cookie.name, cookie)
        }

        const selected = [...cookiesByName.values()]
        return {
            header: selected.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
            names: selected.map(cookie => cookie.name)
        }
    }
}
