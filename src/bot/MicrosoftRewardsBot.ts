import type { Cookie, Page } from 'patchright'
import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator'
import pkg from '../../package.json'

import Browser from '../browser/Browser'
import BrowserFunc from '../browser/BrowserFunc'
import BrowserUtils from '../browser/BrowserUtils'
import ReactFunc from '../browser/ReactFunc'
import type { PageSnapshot } from '../browser/ReactFunc'

import { Logger } from '../logging/Logger'
import Utils from '../util/Utils'
import { loadAccounts, loadConfig } from '../util/Load'
import { resolveAccountLocale } from '../util/Locale'
import type { AccountLocale } from '../util/Locale'

import { Login } from '../browser/auth/Login'
import { Workers } from '../functions/Workers'
import Activities from '../functions/Activities'
import { SearchManager } from '../functions/SearchManager'
import { PunchcardManager } from '../functions/PunchcardManager'

import type { Account } from '../interface/Account'
import HttpClient from '../util/Http'
import type { BrowserSession, UserData } from './types'
import { getCurrentContext } from './ExecutionContextStore'
import { AccountFlowRunner } from './AccountFlowRunner'
import { ExecutionRuntime } from './ExecutionRuntime'

export { executionContext, getCurrentContext } from './ExecutionContextStore'
export { flushAllWebhooks } from './WebhookLifecycle'

export class MicrosoftRewardsBot {
    public logger: Logger
    public config
    public utils: Utils
    public activities: Activities = new Activities(this)
    public browser: { func: BrowserFunc; utils: BrowserUtils; react: ReactFunc }

    public mainMobilePage!: Page
    public mainDesktopPage!: Page

    public userData: UserData
    public accountLocale: AccountLocale

    public nextActions: Record<string, string> = {}
    public nextRouterStateTree = ''
    public reactSnapshot: PageSnapshot | null = null

    public accessToken = ''
    public cookies: { mobile: Cookie[]; desktop: Cookie[] }
    public fingerprintMobile?: BrowserFingerprintWithHeaders
    public fingerprintDesktop?: BrowserFingerprintWithHeaders
    public pkgVersion = pkg.version

    get fingerprint(): BrowserFingerprintWithHeaders {
        const ctx = this.isMobile ? this.fingerprintMobile : this.fingerprintDesktop
        return (ctx ?? this.fingerprintMobile ?? this.fingerprintDesktop) as BrowserFingerprintWithHeaders
    }

    public browserFactory: Browser = new Browser(this)
    public accounts: Account[]
    public workers: Workers
    public searchManager: SearchManager
    public punchcardManager: PunchcardManager
    public login = new Login(this)

    public http!: HttpClient

    private executionRuntime: ExecutionRuntime
    private accountFlowRunner: AccountFlowRunner

    constructor() {
        this.userData = {
            userName: '',
            geoLocale: 'US',
            langCode: 'en',
            timezoneOffset: '60',
            initialPoints: 0,
            currentPoints: 0,
            gainedPoints: 0
        }
        this.accountLocale = resolveAccountLocale({ langCode: 'en', geoLocale: 'US' })
        this.logger = new Logger(this)
        this.accounts = []
        this.cookies = { mobile: [], desktop: [] }
        this.utils = new Utils()
        this.workers = new Workers(this)
        this.searchManager = new SearchManager(this)
        this.punchcardManager = new PunchcardManager(this)
        this.browser = {
            func: new BrowserFunc(this),
            utils: new BrowserUtils(this),
            react: new ReactFunc(this)
        }
        this.config = loadConfig()
        this.executionRuntime = new ExecutionRuntime(this)
        this.accountFlowRunner = new AccountFlowRunner(this)
    }

    get isMobile(): boolean {
        return getCurrentContext().isMobile
    }

    get currentAccountEmail(): string | null {
        return getCurrentContext().account?.email || null
    }

    async refreshCurrentRewardsContext(reason: string): Promise<boolean> {
        const context = getCurrentContext()
        const account = context.account
        let page = context.isMobile ? this.mainMobilePage : this.mainDesktopPage
        let recoverySession: BrowserSession | null = null
        let refreshSucceeded = false

        if (!account?.email) {
            this.logger.debug(
                this.isMobile,
                'CONTEXT-REFRESH',
                `Cannot refresh rewards context | reason=${reason} | account=unavailable`
            )
            return false
        }

        try {
            this.logger.warn(
                this.isMobile,
                'CONTEXT-REFRESH',
                `Refreshing rewards browser context after request failure | reason=${reason}`
            )

            if (!page || page.isClosed()) {
                recoverySession = await this.browserFactory.createBrowser(account)
                page = await recoverySession.context.newPage()
                if (context.isMobile) {
                    this.mainMobilePage = page
                    this.fingerprintMobile = recoverySession.fingerprint
                } else {
                    this.mainDesktopPage = page
                    this.fingerprintDesktop = recoverySession.fingerprint
                }

                await this.login.login(page, account)
            } else {
                this.nextActions = {}
                this.nextRouterStateTree = ''
                this.reactSnapshot = null
                await this.browser.func.synchronizeActiveBrowserCookies('CONTEXT-REFRESH-COOKIE-SEED', true)
                try {
                    await this.browser.func.bootstrap(page)
                } catch {
                    await this.login.login(page, account)
                }
            }

            await this.browser.func.checkpointActiveSession('CONTEXT-REFRESH')

            const refreshedCookies = await page.context().cookies()
            this.logger.info(
                this.isMobile,
                'CONTEXT-REFRESH',
                `Rewards context refreshed successfully | cookies=${refreshedCookies.length}`,
                'green'
            )
            refreshSucceeded = true
            return true
        } catch (error) {
            this.logger.error(
                this.isMobile,
                'CONTEXT-REFRESH',
                `Rewards context refresh failed | reason=${reason} | message=${error instanceof Error ? error.message : String(error)}`
            )
            return false
        } finally {
            if (recoverySession) {
                await this.browser.func.closeBrowser(recoverySession.context, account.email, refreshSucceeded)
            }
        }
    }

    async initialize(): Promise<void> {
        this.accounts = loadAccounts()
        this.warnExperimental()
    }

    private warnExperimental(): void {
        const exp = this.config.experimental
        const enabled = [exp.apiSearch && 'apiSearch', exp.apiSearchOnBing && 'apiSearchOnBing'].filter(
            Boolean
        ) as string[]
        if (!enabled.length) return

        this.logger.warn(
            'main',
            'EXPERIMENTAL',
            `${enabled.join(' + ')} enabled - these perform searches over HTTP with no real browser. ` +
                `This path is EXPERIMENTAL and UNSAFE and may get your account flagged or banned. ` +
                `Disable it under config.experimental if you are unsure.`,
            'redBright'
        )
    }

    async run(): Promise<void> {
        await this.executionRuntime.run()
    }

    async createDesktopSession(account: Account): Promise<BrowserSession> {
        const session = await this.browserFactory.createBrowser(account)
        this.mainDesktopPage = await session.context.newPage()
        this.fingerprintDesktop = session.fingerprint

        this.logger.info(this.isMobile, 'BROWSER', `Desktop Browser started | ${account.email}`)

        await this.login.login(this.mainDesktopPage, account)
        await this.browser.func.checkpointActiveSession('LOGIN-CHECKPOINT')
        this.cookies.desktop = await session.context.cookies()

        return session
    }

    async Main(account: Account): Promise<{ initialPoints: number; collectedPoints: number }> {
        return this.accountFlowRunner.run(account)
    }
}
