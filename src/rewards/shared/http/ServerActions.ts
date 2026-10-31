import { ActionDiscovery } from '../parsers/ActionDiscovery'
import { ghostClick } from '../../../browser/GhostClick'
import type { Page } from 'patchright'
import type { BotContext } from '../../../core/BotContext'
import { URLs } from '../../../constants/urls'
import { buildCookieHeader } from '../../../network/CookieUtils'
import { localeRequestHeaders } from '../../../network/RequestHeaders'
import { ActivitySkipError } from '../ActivityResult'

const STREAK_ACTION_NAMES = [
    'reportSetStreakProtection',
    'setStreakProtection',
    'updateStreakProtection',
    'reportEnableStreakProtection',
    'reportToggleStreakProtection',
    'reportStreakProtection'
]

export class ServerActions {
    private rewardsDeploymentIds = { mobile: '', desktop: '' }
    private readonly discovery: ActionDiscovery

    constructor(private readonly bot: BotContext) {
        this.discovery = new ActionDiscovery(bot)
    }

    reset(): void {
        this.rewardsDeploymentIds = { mobile: '', desktop: '' }
    }

    private get platformKey(): 'mobile' | 'desktop' {
        return this.bot.isMobile ? 'mobile' : 'desktop'
    }

    async bootstrap(page: Page): Promise<void> {
        try {
            await page.goto(URLs.rewards.earn, { waitUntil: 'domcontentloaded' })
            await this.dismissRewardsWelcomeDialog(page)
            await this.bot.browser.utils.dismissMessages(page)

            const earnDom = await page.content()
            const earnRaw = await this.fetchBootstrapHtml(page, URLs.rewards.earn, '/earn')
            const dashboardHtml = await this.fetchBootstrapHtml(page, URLs.rewards.dashboard, '/dashboard')
            const sources = [earnRaw, earnDom, dashboardHtml].filter(Boolean)

            this.rewardsDeploymentIds[this.platformKey] = this.bot.pageParser.buildId(earnRaw || earnDom) ?? ''
            this.bot.nextRouterStateTree = this.bot.pageParser.routerStateTree('earn')
            const snapshot = this.bot.pageParser.snapshotPage(sources)
            this.bot.reactSnapshot = snapshot
            if (this.bot.isMobile) this.bot.reactSnapshots.mobile = snapshot
            else this.bot.reactSnapshots.desktop = snapshot

            this.bot.nextActions = await this.discovery.resolve(page, sources)

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

            this.bot.logger.debug(
                this.bot.isMobile,
                'BOOTSTRAP',
                `Context ready | rewardsMode=${this.bot.config.rewardsMode} | actions=${Object.keys(this.bot.nextActions).length} | reportable=${this.bot.reactSnapshot.reportable.length} | available=${this.bot.reactSnapshot.account.availablePoints}`
            )

            this.bot.logger.debug(
                this.bot.isMobile,
                'BUILD',
                `Rewards build | id=${this.rewardsDeploymentIds[this.platformKey] || 'unknown'}`
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

    private async dismissRewardsWelcomeDialog(page: Page): Promise<void> {
        try {
            const welcomeButton = await page
                .waitForSelector('section[role="dialog"] button[slot="close"]', { timeout: 5000 })
                .catch(() => null)
            if (!welcomeButton) return

            await ghostClick(page, page.locator('section[role="dialog"] button[slot="close"]'), 5000, this.bot.signal)
            this.bot.logger.debug(this.bot.isMobile, 'BOOTSTRAP', 'Dismissed welcome dialog')

            await page.waitForSelector('section#dailyset', { timeout: 15000 }).catch(() => undefined)
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'BOOTSTRAP',
                `Failed to dismiss welcome dialog: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async fetchBootstrapHtml(page: Page, url: string, route: string): Promise<string> {
        try {
            const res = await this.fetchBrowserText(page, url)
            if (res.status >= 200 && res.status < 300) return res.body

            this.bot.logger.warn(
                this.bot.isMobile,
                'BOOTSTRAP',
                `Failed to fetch ${route} HTML | status=${res.status} - snapshot and action discovery may be incomplete`
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

    private async fetchBrowserText(page: Page, url: string): Promise<{ status: number; body: string }> {
        const response = await this.bot.requestClient.request<string>(
            {
                url,
                method: 'GET',
                headers: {},
                responseType: 'text',
                allowNodeFallback: false
            },
            page
        )
        return { status: response.status, body: response.data }
    }

    async reportServerAction(
        actionId: string,
        body: unknown[],
        opts?: { url?: string; referer?: string; routerStateTree?: string }
    ): Promise<{ status: number; acknowledged: boolean; availablePoints: number | null }> {
        if (this.bot.config.rewardsMode === 'browser') {
            throw new Error('Direct Rewards server actions are disabled while rewardsMode="browser"')
        }

        return this.postServerAction(actionId, body, opts)
    }

    async reportClaimAllPoints(
        html: string,
        page?: Page
    ): Promise<{ status: number; acknowledged: boolean; availablePoints: number | null }> {
        return this.reportNamedAction('reportClaimAllPoints', [], html, 'dashboard', page)
    }

    async reportStreakProtection(
        html: string
    ): Promise<{ status: number; acknowledged: boolean; availablePoints: number | null }> {
        return this.reportNamedAction(STREAK_ACTION_NAMES, [true], html, 'earn')
    }

    async reportEdgeBrowsingActivation(
        html: string,
        body: unknown[],
        page: Page,
        signal?: AbortSignal
    ): Promise<{ status: number; acknowledged: boolean; availablePoints: number | null }> {
        return this.reportNamedAction('reportActivity', body, html, 'earn', page, signal)
    }

    private async reportNamedAction(
        required: string | readonly string[],
        body: unknown[],
        html: string,
        route: 'earn' | 'dashboard',
        page?: Page,
        signal?: AbortSignal
    ): Promise<{ status: number; acknowledged: boolean; availablePoints: number | null }> {
        this.rewardsDeploymentIds[this.platformKey] = this.bot.pageParser.buildId(html) ?? ''
        const actions = await this.discovery.resolve(page, [html], required)
        this.bot.signal.throwIfAborted()
        signal?.throwIfAborted()
        const names = typeof required === 'string' ? [required] : required
        const name = names.find(name => actions[name])
        if (!name)
            throw new ActivitySkipError(
                'action-id-unavailable',
                `Required server action was not found | names=${names.join(',')} | build=${this.rewardsDeploymentIds[this.platformKey] || 'unknown'}`
            )
        this.bot.nextActions = { ...this.bot.nextActions, ...actions }
        this.bot.logger.debug(
            this.bot.isMobile,
            'SERVER-ACTION',
            `Submitting action | name=${name} | route=/${route} | build=${this.rewardsDeploymentIds[this.platformKey] || 'unknown'}`
        )
        return this.postServerAction(
            actions[name]!,
            body,
            {
                url: URLs.rewards[route],
                referer: URLs.rewards[route],
                routerStateTree: this.bot.pageParser.routerStateTree(route)
            },
            page
        )
    }

    private async postServerAction(
        actionId: string,
        body: unknown[],
        opts?: { url?: string; referer?: string; routerStateTree?: string },
        ownedPage?: Page
    ): Promise<{ status: number; acknowledged: boolean; availablePoints: number | null }> {
        const url = opts?.url ?? URLs.rewards.earn
        const routerStateTree = opts?.routerStateTree ?? this.bot.nextRouterStateTree

        const transportHeaders: Record<string, string> = {
            ...localeRequestHeaders(this.bot.accountLocale.acceptLanguage),
            Referer: opts?.referer ?? url,
            Origin: URLs.rewards.origin,
            Cookie: buildCookieHeader(this.bot.sessionState.getCachedCookies(undefined, url))
        }

        const rscHeaders: Record<string, string> = {
            Accept: 'text/x-component',
            'Content-Type': 'text/plain;charset=UTF-8',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
            'Next-Action': actionId,
            'Next-Router-State-Tree': routerStateTree,
            ...(this.rewardsDeploymentIds[this.platformKey]
                ? { 'X-Deployment-Id': this.rewardsDeploymentIds[this.platformKey] }
                : {})
        }

        const page = this.bot.activePage
        let targetUrl = url
        if (page && !opts?.url) {
            try {
                const current = page.url()
                if (new URL(current).origin === new URL(url).origin) {
                    targetUrl = current
                }
            } catch {
                // Ignore
            }
        }

        const finalHeaders = { ...transportHeaders, ...rscHeaders }

        this.bot.signal.throwIfAborted()
        const response = await this.bot.requestClient
            .request<unknown>(
                {
                    url: targetUrl,
                    method: 'POST',
                    headers: finalHeaders,
                    body: JSON.stringify(body),
                    responseType: 'text',
                    pageOwnership: 'own',
                    allowNodeFallback: this.bot.mode.allowClosedBrowserHttp
                },
                ownedPage
            )
            .catch(error => {
                this.discovery.invalidate(this.rewardsDeploymentIds[this.platformKey])
                throw error
            })

        if (
            response.status < 200 ||
            response.status >= 300 ||
            (typeof response.data === 'string' && /failed to find server action/i.test(response.data))
        )
            this.discovery.invalidate(this.rewardsDeploymentIds[this.platformKey])

        if (response.via !== 'in-page') {
            await this.bot.sessionState.applyResponseCookies(url, response.headers['set-cookie'])
        }

        this.bot.logger.debug(
            this.bot.isMobile,
            'URL-REWARD-RSC',
            `Server action delivered via ${response.via} | url=${targetUrl} | status=${response.status}`
        )

        return {
            status: response.status,
            acknowledged:
                response.status >= 200 &&
                response.status < 300 &&
                this.bot.utils.serverActionAcknowledged(response.data),
            availablePoints: this.bot.pageParser.availablePointsFromPayload(response.data)
        }
    }
}
