import { HttpError, isTerminalHttpError } from '../../../network/HttpError'
import { browserTimeout } from '../../../browser/BrowserTiming'
import { mapApiDashboard, mapFlyoutDashboard } from './DashboardMapper'
import type { Page } from 'patchright'
import type { BotContext } from '../../../core/BotContext'
import { URLs } from '../../../constants/urls'
import type { RewardsState } from '../../types/RewardsState'
import type { AccountDataSource } from '../../types/DataSource'
import { buildCookieHeader } from '../../../network/CookieUtils'
import { mergeRequestHeaders } from '../../../network/HttpClient'
import { localeRequestHeaders } from '../../../network/RequestHeaders'
import type { BrowserRequestResponse } from '../../../browser/BrowserRequestClient'
import { ServerActions } from '../http/ServerActions'
import { mergeAccountInfo } from '../parsers/NormalizeRewards'
import { accountReset } from '../AccountReset'
import { observePunchCard } from '../PunchCardProgress'

type UserDataTransport = 'node-http' | 'in-page'

export class AccountData implements AccountDataSource {
    constructor(
        private readonly bot: BotContext,
        private readonly serverActions: ServerActions
    ) {}

    reset(): void {
        this.serverActions.reset()
    }

    async bootstrap(page: Page): Promise<void> {
        await this.serverActions.bootstrap(page)
    }

    async getDashboardData(): Promise<RewardsState> {
        const errors: unknown[] = []
        const failures: string[] = []
        const deadline = Date.now() + browserTimeout(this.bot)
        const transports: UserDataTransport[] = this.bot.activePage ? ['node-http', 'in-page'] : ['node-http']
        const attempts = transports.flatMap(via => [
            { via, url: URLs.rewards.userInfoApi, map: mapApiDashboard },
            { via, url: URLs.bing.rewardsFlyoutUserInfo, map: mapFlyoutDashboard }
        ])

        for (const [index, { via, url, map }] of attempts.entries()) {
            this.bot.signal.throwIfAborted()
            if (Date.now() >= deadline) break
            const started = Date.now()
            const attemptDeadline = started + Math.max(1, Math.floor((deadline - started) / (attempts.length - index)))
            try {
                return await this.fetchDashboard(url, map as (payload: unknown) => RewardsState, via, attemptDeadline)
            } catch (error) {
                this.bot.signal.throwIfAborted()
                errors.push(error)
                failures.push(`${via}/${new URL(url).pathname}=${this.errorMessage(error)}`)
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'GET-DASHBOARD-DATA',
                    `User data source unavailable | via=${via} | path=${new URL(url).pathname}` +
                        ` | attempt=${index + 1}/${attempts.length} | elapsedMs=${Date.now() - started}` +
                        ` | remainingMs=${Math.max(0, deadline - Date.now())} | message=${this.errorMessage(error)}`
                )
            }
        }

        const message = `Rewards user data unavailable | ${failures.join(' | ')}`
        this.bot.logger.error(this.bot.isMobile, 'GET-DASHBOARD-DATA', message)
        throw new AggregateError(errors, message)
    }

    private async fetchDashboard<T>(
        url: string,
        map: (payload: T) => RewardsState,
        via: UserDataTransport,
        deadline: number
    ): Promise<RewardsState> {
        if (via === 'node-http' && this.bot.activePage) await this.bot.sessionState.synchronize('GET-DASHBOARD-DATA')
        this.bot.signal.throwIfAborted()
        const origin = new URL(url).origin
        const headers = {
            ...localeRequestHeaders(this.bot.accountLocale.acceptLanguage),
            Accept: 'application/json',
            'Cache-Control': 'no-cache',
            Referer: `${origin}/`,
            Origin: origin,
            Cookie: buildCookieHeader(this.bot.sessionState.getCachedCookies(undefined, url))
        }
        let response: BrowserRequestResponse<T>
        if (via === 'node-http') {
            const httpResponse = await this.bot.sessionState.browserRequest<T>({
                url,
                method: 'GET',
                headers: mergeRequestHeaders(
                    headers,
                    this.bot.browser.userAgentManager.getRequestHeaders(this.bot.isMobile)
                ),
                responseType: 'json',
                retries: 0,
                deadline
            })
            response = { ...httpResponse, via }
            this.bot.signal.throwIfAborted()
        } else {
            response = await this.bot.requestClient.request<T>({
                url,
                method: 'GET',
                headers,
                pageOwnership: 'background',
                allowNodeFallback: false,
                timeout: Math.max(1, deadline - Date.now())
            })
        }
        this.bot.signal.throwIfAborted()
        if (response.status < 200 || response.status >= 300) {
            if (response.status === 429) this.bot.accountState.defer('Service rate limit while reading account data')
            throw new HttpError(response.status, response)
        }
        this.rejectHtmlResponse(response.data, response.status)

        const data = map(response.data)
        data.account = mergeAccountInfo(data.account, this.bot.reactSnapshot?.account)
        data.dashboard.userStatus.level ??= data.account.level
        this.bot.userData.currentPoints = data.dashboard.userStatus.availablePoints
        this.bot.accountState.observe(data, this.bot.config)
        this.bot.userData.initialPoints = this.bot.accountState.initialBalance!
        for (const card of data.dashboard.punchCards) {
            const parent = card.parentPromotion
            observePunchCard(
                this.bot,
                parent,
                card.childPromotions.length
                    ? card.childPromotions.map(child => ({
                          complete: child.complete,
                          locked: child.exclusiveLockedFeatureStatus.toLowerCase() === 'locked'
                      }))
                    : undefined,
                parent
            )
        }
        this.bot.logger.event(
            this.bot.isMobile,
            'ACCOUNT-INFO',
            `Account information observed | level=${data.account.level} | pointsProgress=${data.account.pointsProgress}` +
                ` | pointsRemaining=${data.account.pointsRemaining} | lifetimeEarn=${data.account.lifetimeEarn}`,
            {
                kind: 'account-info',
                ...data.account,
                ...accountReset(this.bot.reactSnapshot?.streaks ?? [], this.bot.userData.timezone)
            }
        )
        this.bot.logger.event(
            this.bot.isMobile,
            'ACCOUNT-BALANCE',
            `Account balance observed | currentBalance=${data.dashboard.userStatus.availablePoints} | initialPoints=${this.bot.userData.initialPoints}`,
            {
                kind: 'balance',
                currentBalance: data.dashboard.userStatus.availablePoints,
                initialPoints: this.bot.userData.initialPoints
            }
        )
        const missingWarnings = data.sourceInfo.missingSections.includes('userWarnings')
        this.bot.logger.debug(
            this.bot.isMobile,
            'GET-DASHBOARD-DATA',
            `User data received | source=${data.sourceInfo.source} | via=${response.via} | session=${this.bot.isMobile ? 'mobile' : 'desktop'}` +
                ` | currentBalance=${data.dashboard.userStatus.availablePoints}` +
                ` | warnings=${data.dashboard.userWarnings.map(warning => warning.name).join(',') || (missingWarnings ? 'unavailable' : 'none')}`
        )
        return data
    }

    private rejectHtmlResponse(data: unknown, status: number): void {
        if (typeof data !== 'string') return
        const isSignIn =
            /<base\b[^>]*\bhref\s*=\s*["']https:\/\/(?:login\.live\.com|login\.microsoftonline\.com|login\.windows\.net)[/"']/i.test(
                data
            ) || /<title\b[^>]*>\s*Sign in to Microsoft(?: Rewards| account)?\s*<\/title>/i.test(data)
        if (isSignIn) {
            throw new Error(
                'Microsoft sign-in HTML returned instead of user data JSON; the request has no authenticated Rewards session'
            )
        }
        throw new Error(`User data request returned text or HTML instead of JSON | status=${status}`)
    }

    private errorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error)
    }

    async getPageHtml(url: string, route: string): Promise<string | null> {
        this.bot.signal.throwIfAborted()
        try {
            const finalHeaders: Record<string, string> = {
                ...localeRequestHeaders(this.bot.accountLocale.acceptLanguage),
                Cookie: buildCookieHeader(this.bot.sessionState.getCachedCookies(undefined, url)),
                Referer: URLs.rewards.referer,
                'Cache-Control': 'no-cache',
                Pragma: 'no-cache',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }

            const response = await this.bot.requestClient.request<string>({
                url,
                method: 'GET',
                headers: finalHeaders,
                responseType: 'text',
                pageOwnership: 'observe',
                allowNodeFallback: this.bot.mode.allowClosedBrowserHttp
            })

            this.bot.signal.throwIfAborted()
            if (response.via !== 'in-page') {
                await this.bot.sessionState.applyResponseCookies(url, response.headers['set-cookie'])
            }
            if (response.status < 200 || response.status >= 300) throw new HttpError(response.status, response)
            return typeof response.data === 'string' ? response.data : null
        } catch (error) {
            this.bot.signal.throwIfAborted()
            if (isTerminalHttpError(error)) throw error
            this.bot.logger.debug(
                this.bot.isMobile,
                'EARN-SNAPSHOT',
                `Failed to fetch ${route} over http | ${error instanceof Error ? error.message : String(error)}`
            )
            return null
        }
    }
}
