import type { Route } from 'patchright'
import { type Page } from 'patchright'
import { browserTimeout } from './BrowserTiming'
import { ghostClick } from './GhostClick'

import type { BotContext } from '../core/BotContext'

type BrowserToolsContext = Pick<BotContext, 'config' | 'isMobile' | 'logger' | 'signal' | 'utils'>

export default class BrowserUtils {
    private bot: BrowserToolsContext
    private readonly consentChecked = new WeakSet<Page>()

    constructor(bot: BrowserToolsContext) {
        this.bot = bot
    }

    async dismissMessages(page: Page): Promise<void> {
        try {
            await page.bringToFront()
            if (!(await this.dismissRewardsWelcome(page))) return
            await this.dismissMsnConsent(page)
            const host = new URL(page.url()).hostname
            const waitForConsent =
                /^(?:rewards\.)?bing\.com$|^www\.bing\.com$/i.test(host) && !this.consentChecked.has(page)
            if (waitForConsent) {
                this.consentChecked.add(page)
                page.once('domcontentloaded', () => this.consentChecked.delete(page))
            }
            await this.dismissCookieConsent(page, waitForConsent ? browserTimeout(this.bot, 'optional') : 0)
            if (!(await this.dismissRewardsWelcome(page))) return
            const buttons = [
                { selector: '#acceptButton', label: 'AcceptButton' },
                { selector: '.ext-secondary.ext-button', label: '"Skip for now" Button' },
                { selector: '#iLandingViewAction', label: 'iLandingViewAction' },
                { selector: '#iShowSkip', label: 'iShowSkip' },
                { selector: '#iNext', label: 'iNext' },
                { selector: '#iLooksGood', label: 'iLooksGood' },
                { selector: '#idSIButton9', label: 'idSIButton9' },
                { selector: '.ms-Button.ms-Button--primary', label: 'Primary Button' },
                { selector: '.c-glyph.glyph-cancel', label: 'Mobile Welcome Button' },
                { selector: '.maybe-later', label: 'Mobile Rewards App Banner' },
                { selector: 'section[role="dialog"] button[slot="close"]', label: 'Rewards Dialog Close Button' },
                { selector: '#reward_pivot_earn', label: 'Reward Coupon Accept' }
            ]

            const checkVisible = await Promise.allSettled(
                buttons.map(async b => ({
                    ...b,
                    isVisible: await page
                        .locator(b.selector)
                        .isVisible()
                        .catch(() => false)
                }))
            )

            const visibleButtons = checkVisible
                .filter(r => r.status === 'fulfilled' && r.value.isVisible)
                .map(r => (r.status === 'fulfilled' ? r.value : null))
                .filter(Boolean)

            if (visibleButtons.length > 0) {
                for (const button of visibleButtons) {
                    if (
                        button &&
                        (await this.click(page, button.selector, { timeout: browserTimeout(this.bot, 'optional') }))
                    ) {
                        this.bot.logger.debug(this.bot.isMobile, 'DISMISS-ALL-MESSAGES', `Dismissed: ${button.label}`)
                    }
                }
                await this.bot.utils.wait(300)
            }

            if (!(await this.dismissRewardsWelcome(page))) return
            await this.dismissCookieConsent(page)
        } catch (error) {
            this.bot.signal.throwIfAborted()
            this.bot.logger.warn(
                this.bot.isMobile,
                'DISMISS-ALL-MESSAGES',
                `Handler error: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async dismissRewardsWelcome(page: Page): Promise<boolean> {
        const dialogs = page.locator('[role="dialog"]:visible').filter({
            has: page.getByRole('heading', { name: /^(?:welcome|welkom)\b/i })
        })
        const timeout = browserTimeout(this.bot, 'optional')
        for (let attempt = 1; attempt <= 2; attempt++) {
            this.bot.signal.throwIfAborted()
            const dialog = dialogs.first()
            if (!(await dialog.isVisible().catch(() => false))) return true
            const close = dialog.locator('button[slot="close"]:visible').first()
            const target = (await close.isVisible().catch(() => false))
                ? close
                : dialog.getByRole('button', { name: /^(?:get started|aan de slag)$/i }).first()
            try {
                await ghostClick(page, target, timeout, this.bot.signal)
                const dismissed = await dialog
                    .waitFor({ state: 'hidden', timeout: Math.min(timeout, 2000) })
                    .then(() => true)
                    .catch(() => false)
                if (dismissed) {
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'DISMISS-ALL-MESSAGES',
                        'Dismissed: Rewards welcome dialog'
                    )
                    return true
                }
            } catch (error) {
                this.bot.signal.throwIfAborted()
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'DISMISS-ALL-MESSAGES',
                    `Rewards welcome dismissal failed | attempt=${attempt}/2 | ${error instanceof Error ? error.message : String(error)}`
                )
            }
            if (page.isClosed()) return false
            if (attempt < 2) await this.bot.utils.wait(250)
        }
        this.bot.logger.warn(
            this.bot.isMobile,
            'DISMISS-ALL-MESSAGES',
            'Rewards welcome dialog remained visible after two dismissal attempts'
        )
        return false
    }

    async dismissCookieConsent(page: Page, waitMs = 0): Promise<boolean> {
        const banners = page.locator(
            '#wcpConsentBannerCtrl:visible, #bnp_overlay_wrapper:visible, #bnp_container:visible'
        )
        const timeout = browserTimeout(this.bot, 'optional')
        try {
            if (waitMs > 0)
                await banners
                    .first()
                    .waitFor({ state: 'visible', timeout: waitMs })
                    .catch(() => undefined)

            for (let attempt = 0; attempt < 2; attempt++) {
                this.bot.signal.throwIfAborted()
                const banner = banners.first()
                if (!(await banner.isVisible().catch(() => false))) return true
                const reject = banner.locator('#bnp_btn_reject:visible, button[aria-label*="Reject" i]:visible').first()
                const namedAccept = banner.getByRole('button', { name: /^accept(?: all(?: cookies)?)?$/i }).first()
                const bingAccept = banner.locator('#bnp_btn_accept:visible').first()
                const rejected = await reject.isVisible().catch(() => false)
                const target = rejected
                    ? reject
                    : (await bingAccept.isVisible().catch(() => false))
                      ? bingAccept
                      : (await namedAccept.isVisible().catch(() => false))
                        ? namedAccept
                        : banner.getByRole('button').first()

                await ghostClick(page, target, timeout, this.bot.signal)
                const dismissed = await banner
                    .waitFor({ state: 'hidden', timeout })
                    .then(() => true)
                    .catch(() => false)
                if (dismissed) {
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'DISMISS-ALL-MESSAGES',
                        `Dismissed: cookie consent banner (${rejected ? 'Reject' : 'Accept'})`
                    )
                    if (
                        !(await banners
                            .first()
                            .isVisible()
                            .catch(() => false))
                    )
                        return true
                }
                if (page.isClosed()) return false
            }
            this.bot.logger.warn(
                this.bot.isMobile,
                'DISMISS-ALL-MESSAGES',
                'Cookie consent banner remained visible after two dismissal attempts; page controls may be covered'
            )
        } catch (error) {
            this.bot.signal.throwIfAborted()
            this.bot.logger.warn(
                this.bot.isMobile,
                'DISMISS-ALL-MESSAGES',
                `Could not dismiss cookie consent | error=${error instanceof Error ? error.message : String(error)}`
            )
        }
        return false
    }

    private async dismissMsnConsent(page: Page): Promise<void> {
        const banner = page.locator('#cmp-banner-sdk:not([aria-hidden="true"])').first()
        if (/^https:\/\/(?:[^/]+\.)?msn\.com(?:\/|$)/i.test(page.url())) {
            await banner
                .waitFor({ state: 'visible', timeout: browserTimeout(this.bot, 'optional') })
                .catch(() => undefined)
        }
        if (!(await banner.isVisible().catch(() => false))) return
        const reject = banner.locator('#cmp-reject-all-handler')
        if (!(await reject.isVisible().catch(() => false))) return
        await ghostClick(page, reject, browserTimeout(this.bot), this.bot.signal)
        await banner.waitFor({ state: 'hidden', timeout: browserTimeout(this.bot) })
        this.bot.logger.debug(this.bot.isMobile, 'DISMISS-ALL-MESSAGES', 'Dismissed: MSN privacy banner (Reject All)')
    }

    async reloadNetworkError(page: Page): Promise<boolean> {
        try {
            const html = await page.content().catch(() => '')
            const isBadPage = /<body[^>]*\bclass=["'][^"']*\bneterror\b/i.test(html)

            if (isBadPage) {
                this.bot.logger.info(this.bot.isMobile, 'RELOAD-BAD-PAGE', 'Bad page detected, reloading!')
                try {
                    await page.reload({ waitUntil: 'load' })
                } catch {
                    await page.reload().catch(() => undefined)
                }
                return true
            } else {
                return false
            }
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'RELOAD-BAD-PAGE',
                `Reload check failed: ${error instanceof Error ? error.message : String(error)}`
            )
            return true
        }
    }

    async click(page: Page, selector: string, options?: { timeout?: number }): Promise<boolean> {
        try {
            const target = page.locator(selector).first()
            await ghostClick(page, target, options?.timeout ?? browserTimeout(this.bot), this.bot.signal)
            return true
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'CLICK',
                `Failed for ${selector}: ${error instanceof Error ? error.message : String(error)}`
            )
            return false
        }
    }

    async blockPasskeys(page: Page): Promise<() => Promise<void>> {
        const routePattern = '**/GetCredentialType.srf*'
        const handler = async (route: Route): Promise<void> => {
            try {
                const request = route.request()
                const postData = request.postData()

                const body = postData ? JSON.parse(postData) : {}

                body.isFidoSupported = false

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'DISABLE-FIDO',
                    `Modified request body: isFidoSupported set to ${body.isFidoSupported}`
                )

                await route.continue({
                    postData: JSON.stringify(body),
                    headers: {
                        ...request.headers(),
                        'Content-Type': 'application/json'
                    }
                })
            } catch (error) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'DISABLE-FIDO',
                    `An error occurred: ${error instanceof Error ? error.message : String(error)}`
                )
                await route.continue()
            }
        }
        await page.route(routePattern, handler)
        return () => page.unroute(routePattern, handler)
    }
}
