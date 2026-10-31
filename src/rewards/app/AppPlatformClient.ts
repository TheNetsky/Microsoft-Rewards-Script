import { appOfferId, appPromotionType, findAppPromotion, isAppPromotionComplete } from './AppPromotion'
import { creditedPoints, pointDelta, pointValue } from '../shared/PointAccounting'
import { activityResult, type ActivityResult } from '../shared/ActivityResult'
import type { AppEarnablePoints } from '../types/Points'
import { URLs } from '../../constants/urls'
import type { BotContext } from '../../core/BotContext'
import type { AppDashboardData, Promotion } from './types/AppDashboardData'
import type { HttpResponse } from '../../network/HttpClient'
import { parseAppDashboard, parseAppActivity, type AppActivityResponse } from './AppResponses'

type AppContext = Pick<
    BotContext,
    'accessTokens' | 'appIdentity' | 'http' | 'isMobile' | 'logger' | 'rewards' | 'signal' | 'userData' | 'utils'
>

export interface AppActivitySubmission extends HttpResponse<AppActivityResponse> {
    previousBalance: number
}

export class AppPlatformClient {
    constructor(private readonly bot: AppContext) {}

    async getDashboard(
        extraHeaders: Record<string, string> = {},
        channel: 'SAAndroid' | 'SAIOS' = this.bot.appIdentity.channel
    ): Promise<AppDashboardData> {
        const response = await this.bot.http.request<unknown>({
            url: URLs.platform.me(channel),
            method: 'GET',
            headers: this.headers({ 'Cache-Control': 'no-cache', ...extraHeaders })
        })
        return parseAppDashboard(response.data)
    }

    async getEarnablePoints(data?: AppDashboardData): Promise<AppEarnablePoints> {
        data ??= await this.getDashboard()
        let readToEarn: number | null = 0
        let checkIn: number | null = 0
        for (const promotion of data.response.promotions) {
            const attrs = promotion.attributes
            const type = appPromotionType(promotion)
            const complete = isAppPromotionComplete(promotion)
            if (type === 'msnreadearn') {
                const max = pointValue(attrs.pointmax)
                const progress = pointValue(attrs.pointprogress)
                const remaining = complete ? 0 : max === null || progress === null ? null : Math.max(0, max - progress)
                readToEarn = readToEarn === null || remaining === null ? null : readToEarn + remaining
            } else if (type === 'checkin') {
                const progress = pointValue(attrs.progress)
                const days = Object.keys(attrs)
                    .flatMap(key => {
                        const match = /^day_(\d+)_points$/.exec(key)
                        return match && Number(match[1]) > 0 ? [Number(match[1])] : []
                    })
                    .sort((a, b) => a - b)
                const day =
                    progress !== null &&
                    Number.isInteger(progress) &&
                    days.length &&
                    days.every((day, index) => day === index + 1)
                        ? days[progress % days.length]
                        : undefined
                const lastUpdated = Date.parse(attrs.last_updated ?? '')
                const alreadyCheckedIn =
                    Number.isFinite(lastUpdated) &&
                    this.bot.utils.formatDate(lastUpdated, this.bot.userData.timezone) ===
                        this.bot.utils.formatDate(Date.now(), this.bot.userData.timezone)
                const remaining =
                    complete || alreadyCheckedIn ? 0 : day === undefined ? null : pointValue(attrs[`day_${day}_points`])
                checkIn = checkIn === null || remaining === null ? null : checkIn + remaining
            }
        }
        return {
            readToEarn,
            checkIn,
            totalEarnablePoints: readToEarn === null || checkIn === null ? null : readToEarn + checkIn
        }
    }

    async submitActivity(data: unknown, extraHeaders: Record<string, string> = {}): Promise<AppActivitySubmission> {
        const before = await this.bot.rewards.getDashboardData()
        const previousBalance = before.dashboard.userStatus.availablePoints
        this.bot.signal.throwIfAborted()
        const response = await this.bot.http.request<unknown>({
            url: URLs.platform.activities,
            method: 'POST',
            headers: this.headers({ 'Content-Type': 'application/json', ...extraHeaders }),
            data: JSON.stringify(data),
            retries: 0
        })
        return { ...response, data: parseAppActivity(response.data), previousBalance }
    }

    async verifyActivity(
        before: Promotion,
        extraHeaders: Record<string, string> = {},
        channel: 'SAAndroid' | 'SAIOS' = this.bot.appIdentity.channel,
        options: {
            maxAttempts?: number
            delayMs?: number
            beforeBalance?: number | null
            onRetry?: (attempt: number, maxAttempts: number) => void
        } = {}
    ): Promise<ActivityResult> {
        const offerId = appOfferId(before)
        const { maxAttempts = 3, delayMs = 1000 } = options
        let offerFound = false
        let confirmed = false
        let measured: number | null = null
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            this.bot.signal.throwIfAborted()
            if (attempt) await this.bot.utils.wait(delayMs)
            this.bot.signal.throwIfAborted()
            let dashboard: AppDashboardData
            try {
                dashboard = await this.getDashboard(extraHeaders, channel)
            } catch (error) {
                this.bot.signal.throwIfAborted()
                if (measured === 0) measured = null
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'APP-ACTIVITY-VERIFY',
                    `Offer read unavailable | offerId=${offerId} | attempt=${attempt + 1}/${maxAttempts} | ${String(error)}`
                )
                if (attempt + 1 < maxAttempts) options.onRetry?.(attempt + 1, maxAttempts)
                continue
            }
            this.bot.signal.throwIfAborted()
            const balance = dashboard.response.balance
            if (Number.isFinite(balance)) this.bot.userData.currentPoints = balance
            const after = findAppPromotion(dashboard.response.promotions, before)
            offerFound ||= Boolean(after)
            const gained =
                before.attributes.pointmax === after?.attributes.pointmax
                    ? pointDelta(before.attributes.pointprogress, after?.attributes.pointprogress)
                    : null
            const credited = creditedPoints(gained, options.beforeBalance, balance)
            if (credited !== null) measured = measured === null ? credited : Math.max(measured, credited)
            else if (measured === 0) measured = null
            const oldProgress = pointValue(before.attributes.progress)
            const newProgress = pointValue(after?.attributes.progress)
            const oldUpdated = Date.parse(before.attributes.last_updated ?? '')
            const newUpdated = Date.parse(after?.attributes.last_updated ?? '')
            const updated = Number.isFinite(oldUpdated) && Number.isFinite(newUpdated) && newUpdated > oldUpdated
            const progressed =
                oldProgress !== null &&
                newProgress !== null &&
                (newProgress > oldProgress || (updated && newProgress !== oldProgress))
            const evidence = [
                after?.attributes.complete?.trim().toLowerCase() === 'true' && 'complete',
                gained !== null && gained > 0 && 'pointprogress',
                progressed && 'progress'
            ].filter(Boolean)
            confirmed ||= evidence.length > 0
            this.bot.logger.debug(
                this.bot.isMobile,
                'APP-ACTIVITY-VERIFY',
                `Offer verification | channel=${channel} | offerId=${offerId} | attempt=${attempt + 1}/${maxAttempts}` +
                    ` | offerFound=${Boolean(after)} | balance=${balance} | evidence=${evidence.join(',') || 'none'}` +
                    ` | complete=${before.attributes.complete ?? 'unknown'}->${after?.attributes.complete ?? 'unknown'}` +
                    ` | progress=${before.attributes.progress ?? 'unknown'}->${after?.attributes.progress ?? 'unknown'}` +
                    ` | pointprogress=${before.attributes.pointprogress ?? 'unknown'}->${after?.attributes.pointprogress ?? 'unknown'}` +
                    ` | lastUpdated=${before.attributes.last_updated ?? 'unknown'}->${after?.attributes.last_updated ?? 'unknown'}`
            )
            if (confirmed && measured !== null && measured > 0) break
            if (attempt + 1 < maxAttempts) options.onRetry?.(attempt + 1, maxAttempts)
        }
        return activityResult(
            confirmed ? 'confirmed' : 'unconfirmed',
            confirmed ? 'offer-progress-verified' : offerFound ? 'offer-progress-unchanged' : 'offer-not-found',
            offerId,
            measured
        )
    }

    private headers(extra: Record<string, string> = {}): Record<string, string> {
        const identity = this.bot.appIdentity
        const userAgent = extra['User-Agent'] ?? identity.userAgent
        if (!userAgent) throw new Error('Initialize the browser engine before sending app requests')
        return {
            Authorization: `Bearer ${this.bot.accessTokens.mobile}`,
            Accept: '*/*',
            'User-Agent': userAgent,
            'X-Rewards-AppId': identity.appId,
            'X-Rewards-PartnerId': identity.partnerId,
            'X-Rewards-Country': this.bot.userData.geoLocale,
            'X-Rewards-Language': this.bot.userData.langCode,
            'X-Rewards-IsMobile': 'true',
            ...extra
        }
    }
}
