import type { BrowserContext, Page } from 'patchright'
import type { BotContext } from '../core/BotContext'
import type { Account } from '../core/Account'
import { executionContext } from '../core/ExecutionContext'
import { saveStorageState } from '../session/SessionStore'
import { createSessionState } from '../session/SessionState'
import { isBrowserClosedError } from '../util/Utils'
import BrowserManager from './BrowserManager'
import { Login } from './auth/Login'
import { closeRewardsTaskContext } from './RewardsBrowserContext'

export interface BrowserSession {
    context: BrowserContext
}

export interface SignInOptions {
    fresh?: boolean
    sessionOnly?: boolean
}

export class BrowserSessions {
    readonly manager: BrowserManager
    readonly login: Login
    private readonly owned = new Map<BrowserContext, { isMobile: boolean; account: Account; persistSession: boolean }>()

    constructor(private readonly bot: BotContext) {
        this.manager = new BrowserManager(bot)
        this.login = new Login(bot)
    }

    private async createTracked(account: Account, options: SignInOptions): Promise<BrowserSession> {
        this.bot.signal.throwIfAborted()
        const session = await this.manager.createBrowser(account, options)
        this.owned.set(session.context, {
            isMobile: this.bot.isMobile,
            account,
            persistSession: !options.sessionOnly
        })
        return session
    }

    signIn(account: Account, isMobile: boolean, withAccessToken: boolean, options: SignInOptions = {}): Promise<void> {
        return executionContext.run({ isMobile, account }, async () => {
            await this.create(account, isMobile, options)
            if (withAccessToken)
                this.bot.accessTokens[isMobile ? 'mobile' : 'desktop'] = await this.appAccessToken(account)
            await this.bot.sessionState.checkpoint('LOGIN-CHECKPOINT')
        })
    }

    private async appAccessToken(account: Account): Promise<string> {
        try {
            return await this.login.getAppAccessToken(this.bot.requirePage(), account.email)
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'LOGIN-APP',
                `Failed to get app access token: ${error instanceof Error ? error.message : String(error)}`
            )
            return ''
        }
    }

    private create(account: Account, isMobile: boolean, options: SignInOptions): Promise<BrowserSession> {
        return executionContext.run({ isMobile, account }, async () => {
            const session = await this.createTracked(account, options)
            try {
                const page = await session.context.newPage()
                if (isMobile) this.bot.mainMobilePage = page
                else this.bot.mainDesktopPage = page
                await this.captureBrowserClock(page)
                this.bot.logger.info(
                    isMobile,
                    'BROWSER',
                    `${isMobile ? 'Mobile' : 'Desktop'} browser started | ${account.email}`
                )
                await this.login.login(page, account, options.sessionOnly)
                const owner = this.owned.get(session.context)
                if (owner) owner.persistSession = true
                return session
            } catch (error) {
                await this.close(session.context, account.email, false)
                throw error
            }
        })
    }

    async closeAll(): Promise<void> {
        try {
            for (const [context, owner] of this.owned) {
                await executionContext.run({ isMobile: owner.isMobile, account: owner.account }, async () => {
                    await this.close(context, owner.account.email)
                })
            }
        } finally {
            await this.manager.closeBrowserProcess()
        }
    }

    async closePlatform(account: Account, isMobile: boolean): Promise<void> {
        const contexts = [...this.owned].filter(
            ([, owner]) => owner.isMobile === isMobile && owner.account.email === account.email
        )
        if (!contexts.length) return
        await executionContext.run({ isMobile, account }, async () => {
            try {
                await this.bot.sessionState.checkpoint('PRE-BROWSER-CLOSE')
            } finally {
                for (const [context] of contexts) await this.close(context, account.email)
                if (!this.owned.size) await this.manager.closeBrowserProcess()
            }
        })
    }

    private async captureBrowserClock(page: Page): Promise<void> {
        const clock = await page.evaluate(() => ({
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            timezoneOffset: new Date().getTimezoneOffset()
        }))
        const timezone = clock.timezone?.trim()
        if (!timezone || !Number.isFinite(clock.timezoneOffset)) {
            throw new Error('Chromium did not return a valid timezone and UTC offset')
        }

        try {
            new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format()
        } catch {
            throw new Error(`Chromium returned an unsupported timezone: ${timezone}`)
        }

        const changed =
            this.bot.userData.timezone !== timezone || this.bot.userData.timezoneOffset !== String(clock.timezoneOffset)
        this.bot.userData.timezone = timezone
        this.bot.userData.timezoneOffset = String(clock.timezoneOffset)

        if (changed) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'BROWSER-TIMEZONE',
                `Read from Chromium | timezone=${timezone} | offset=${clock.timezoneOffset}`
            )
        }
    }

    async close(browser: BrowserContext, email: string, persistSession = true) {
        const owned = this.owned.get(browser)
        this.owned.delete(browser)
        if (owned) {
            if (owned.isMobile && this.bot.mainMobilePage?.context() === browser) this.bot.mainMobilePage = undefined
            if (!owned.isMobile && this.bot.mainDesktopPage?.context() === browser) this.bot.mainDesktopPage = undefined
        }
        try {
            try {
                await this.bot.requestClient.closeHelperPages(browser)
            } finally {
                await closeRewardsTaskContext(browser)
            }
            if (persistSession && owned?.persistSession !== false) {
                const storageState = createSessionState(await browser.cookies())
                const isMobile = owned?.isMobile ?? this.bot.isMobile
                this.bot.cookies[isMobile ? 'mobile' : 'desktop'] = storageState.cookies
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'CLOSE-BROWSER',
                    `Saving session | cookies=${storageState.cookies.length} | origins=${storageState.origins.length}`
                )
                saveStorageState(this.bot.config.sessionPath, email, isMobile, storageState)
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
                this.bot.logger.debug(this.bot.isMobile, 'CLOSE-BROWSER', 'Browser context closed')
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
}
