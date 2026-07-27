import { AsyncLocalStorage } from 'node:async_hooks'
import cluster, { Worker } from 'cluster'
import type { BrowserContext, Cookie, Page } from 'patchright'
import pkg from '../package.json'

import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator'

import Browser from './browser/Browser'
import BrowserFunc from './browser/BrowserFunc'
import BrowserUtils from './browser/BrowserUtils'
import ReactFunc from './browser/ReactFunc'
import type { PageSnapshot } from './browser/ReactFunc'

import { IpcLog, Logger } from './logging/Logger'
import Utils, { isBrowserClosedError } from './util/Utils'
import { loadAccounts, loadConfig } from './util/Load'
import { clearStorageState, closeSessionStore } from './util/SessionStore'
import { checkNodeVersion } from './util/Validator'

import { Login } from './browser/auth/Login'
import { Workers } from './functions/Workers'
import Activities from './functions/Activities'
import { SearchManager } from './functions/SearchManager'
import { PunchcardManager } from './functions/PunchcardManager'

import type { Account } from './interface/Account'
import HttpClient from './util/Http'
import { sendDiscord, flushDiscordQueue } from './logging/Discord'
import { sendNtfy, flushNtfyQueue } from './logging/Ntfy'
import { sendTelegram, flushTelegramQueue } from './logging/Telegram'
import type { DashboardData } from './interface/DashboardData'
import type { AppDashboardData } from './interface/AppDashBoardData'
import type { AppEarnablePoints } from './interface/Points'

interface ExecutionContext {
    isMobile: boolean
    account: Account
}

interface BrowserSession {
    context: BrowserContext
    fingerprint: BrowserFingerprintWithHeaders
}

interface AccountStats {
    email: string
    initialPoints: number
    finalPoints: number
    collectedPoints: number
    duration: number
    success: boolean
    error?: string
}

const executionContext = new AsyncLocalStorage<ExecutionContext>()

export function getCurrentContext(): ExecutionContext {
    const context = executionContext.getStore()
    if (!context) {
        return { isMobile: false, account: {} as Account }
    }
    return context
}

async function flushAllWebhooks(timeoutMs = 5000): Promise<void> {
    await Promise.allSettled([flushDiscordQueue(timeoutMs), flushNtfyQueue(timeoutMs), flushTelegramQueue(timeoutMs)])
    closeSessionStore()
}

interface UserData {
    userName: string
    geoLocale: string
    langCode: string
    timezoneOffset: string
    initialPoints: number
    currentPoints: number
    gainedPoints: number
}

export class MicrosoftRewardsBot {
    public logger: Logger
    public config
    public utils: Utils
    public activities: Activities = new Activities(this)
    public browser: { func: BrowserFunc; utils: BrowserUtils; react: ReactFunc }

    public mainMobilePage!: Page
    public mainDesktopPage!: Page

    public userData: UserData

    public nextActions: Record<string, string> = {}
    public nextRouterStateTree = ''
    public reactSnapshot: PageSnapshot | null = null

    public accessToken = ''
    public cookies: { mobile: Cookie[]; desktop: Cookie[] }
    public restoredSession: { mobile: boolean; desktop: boolean } = { mobile: false, desktop: false }
    private fingerprintMobile?: BrowserFingerprintWithHeaders
    private fingerprintDesktop?: BrowserFingerprintWithHeaders

    get fingerprint(): BrowserFingerprintWithHeaders {
        const ctx = this.isMobile ? this.fingerprintMobile : this.fingerprintDesktop
        return (ctx ?? this.fingerprintMobile ?? this.fingerprintDesktop) as BrowserFingerprintWithHeaders
    }

    private activeWorkers: number
    private exitedWorkers: number[]
    private browserFactory: Browser = new Browser(this)
    private accounts: Account[]
    public workers: Workers
    private searchManager: SearchManager
    private punchcardManager: PunchcardManager
    private login = new Login(this)

    public http!: HttpClient

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
        this.activeWorkers = this.config.clusters
        this.exitedWorkers = []
    }

    get isMobile(): boolean {
        return getCurrentContext().isMobile
    }

    get currentAccountEmail(): string | null {
        return getCurrentContext().account?.email || null
    }

    get currentSessionWasRestored(): boolean {
        return this.isMobile ? this.restoredSession.mobile : this.restoredSession.desktop
    }

    setCurrentSessionRestored(restored: boolean): void {
        if (this.isMobile) this.restoredSession.mobile = restored
        else this.restoredSession.desktop = restored
    }

    async repairCurrentBrowserSession(reason: string): Promise<boolean> {
        const context = getCurrentContext()
        const account = context.account
        let page = context.isMobile ? this.mainMobilePage : this.mainDesktopPage
        let recoverySession: BrowserSession | null = null
        let repairSucceeded = false

        if (!account?.email) {
            this.logger.debug(
                this.isMobile,
                'SESSION-REPAIR',
                `Cannot repair session | reason=${reason} | account=unavailable`
            )
            return false
        }

        try {
            this.logger.warn(
                this.isMobile,
                'SESSION-REPAIR',
                `Restored session appears stale | reason=${reason} | clearing restored browser state and signing in again`
            )

            if (page && !page.isClosed()) {
                await this.browser.func.clearActiveSessionState(page, account.email, 'SESSION-REPAIR')
            } else {
                clearStorageState(this.config.sessionPath, account.email, context.isMobile)
                if (context.isMobile) this.cookies.mobile = []
                else this.cookies.desktop = []
                this.browser.func.resetHttpJars()

                recoverySession = await this.browserFactory.createBrowser(account)
                page = await recoverySession.context.newPage()
                if (context.isMobile) {
                    this.mainMobilePage = page
                    this.fingerprintMobile = recoverySession.fingerprint
                } else {
                    this.mainDesktopPage = page
                    this.fingerprintDesktop = recoverySession.fingerprint
                }
            }

            this.nextActions = {}
            this.nextRouterStateTree = ''
            this.reactSnapshot = null

            await this.login.login(page, account)
            await this.browser.func.checkpointActiveSession('SESSION-REPAIR')

            const refreshedCookies = await page.context().cookies()
            this.setCurrentSessionRestored(false)
            this.logger.info(
                this.isMobile,
                'SESSION-REPAIR',
                `Session repaired successfully | cookies=${refreshedCookies.length}`,
                'green'
            )
            repairSucceeded = true
            return true
        } catch (error) {
            this.logger.error(
                this.isMobile,
                'SESSION-REPAIR',
                `Session repair failed | reason=${reason} | message=${error instanceof Error ? error.message : String(error)}`
            )
            return false
        } finally {
            if (recoverySession) {
                await this.browser.func.closeBrowser(recoverySession.context, account.email, repairSucceeded)
            }
        }
    }

    async initialize(): Promise<void> {
        this.accounts = loadAccounts()
        this.warnExperimental()
    }

    // Move to utils
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
        const totalAccounts = this.accounts.length
        const runStartTime = Date.now()

        this.logger.info(
            'main',
            'RUN-START',
            `Starting Microsoft Rewards Script | v${pkg.version} | Accounts: ${totalAccounts} | Clusters: ${this.config.clusters}`
        )

        if (this.config.clusters > 1) {
            if (cluster.isPrimary) {
                await this.runMaster(runStartTime)
            } else {
                this.runWorker(runStartTime)
            }
        } else {
            await this.runTasks(this.accounts, runStartTime)
        }
    }

    private async runMaster(runStartTime: number): Promise<void> {
        void this.logger.info('main', 'CLUSTER-PRIMARY', `Primary process started | PID: ${process.pid}`)

        const rawChunks = this.utils.chunkArray(this.accounts, this.config.clusters)
        const accountChunks = rawChunks.filter(c => c && c.length > 0)
        this.activeWorkers = accountChunks.length

        const allAccountStats: AccountStats[] = []
        let hadWorkerFailure = false

        for (const chunk of accountChunks) {
            const worker = cluster.fork()
            worker.send?.({ chunk, runStartTime })

            worker.on('message', (msg: { __ipcLog?: IpcLog; __stats?: AccountStats[] }) => {
                if (msg.__stats) {
                    allAccountStats.push(...msg.__stats)
                }

                const log = msg.__ipcLog
                if (log && typeof log.content === 'string') {
                    const { webhook } = this.config
                    const { content, level } = log

                    if (webhook.discord?.enabled && webhook.discord.url) {
                        sendDiscord(webhook.discord.url, content, level)
                    }
                    if (webhook.ntfy?.enabled && webhook.ntfy.url) {
                        sendNtfy(webhook.ntfy, content, level)
                    }
                    if (webhook.telegram?.enabled && webhook.telegram.botToken && webhook.telegram.chatId) {
                        sendTelegram(webhook.telegram, content, level)
                    }
                }
            })

            // Startup delay for clusters due to resource usage
            if (accountChunks.indexOf(chunk) !== accountChunks.length - 1) {
                await this.utils.wait(5000)
            }
        }

        const onWorkerExit = async (worker: Worker, code?: number, signal?: string): Promise<void> => {
            const { pid } = worker.process

            if (!pid || this.exitedWorkers.includes(pid)) {
                return
            }

            this.exitedWorkers.push(pid)
            this.activeWorkers -= 1

            const failed = (code ?? 0) !== 0 || Boolean(signal)
            if (failed) {
                hadWorkerFailure = true
            }

            this.logger.warn(
                'main',
                'CLUSTER-WORKER-EXIT',
                `Worker ${pid} exit | Code: ${code ?? 'n/a'} | Signal: ${signal ?? 'n/a'} | Active workers: ${this.activeWorkers}`
            )

            if (this.activeWorkers <= 0) {
                const totalCollectedPoints = allAccountStats.reduce((sum, s) => sum + s.collectedPoints, 0)
                const totalInitialPoints = allAccountStats.reduce((sum, s) => sum + s.initialPoints, 0)
                const totalFinalPoints = allAccountStats.reduce((sum, s) => sum + s.finalPoints, 0)
                const totalDurationMinutes = ((Date.now() - runStartTime) / 1000 / 60).toFixed(1)

                this.logger.info(
                    'main',
                    'RUN-END',
                    `Completed all accounts | accountsProcessed=${allAccountStats.length} | pointsGained=${totalCollectedPoints} | previousBalance=${totalInitialPoints} | currentBalance=${totalFinalPoints} | runtimeMinutes=${totalDurationMinutes}`,
                    'green'
                )

                await flushAllWebhooks()

                process.exit(hadWorkerFailure ? 1 : 0)
            }
        }

        cluster.on('exit', (worker, code, signal) => {
            void onWorkerExit(worker, code ?? undefined, signal ?? undefined)
        })

        cluster.on('disconnect', worker => {
            const pid = worker.process?.pid
            this.logger.warn('main', 'CLUSTER-WORKER-DISCONNECT', `Worker ${pid ?? '?'} disconnected`)
        })
    }

    private runWorker(runStartTimeFromMaster?: number): void {
        void this.logger.info('main', 'CLUSTER-WORKER-START', `Worker spawned | PID: ${process.pid}`)

        process.on('message', async ({ chunk, runStartTime }: { chunk: Account[]; runStartTime: number }) => {
            void this.logger.info(
                'main',
                'CLUSTER-WORKER-TASK',
                `Worker ${process.pid} received ${chunk.length} accounts.`
            )

            try {
                const stats = await this.runTasks(chunk, runStartTime ?? runStartTimeFromMaster ?? Date.now())

                if (process.send) {
                    process.send({ __stats: stats })
                }

                await flushAllWebhooks()
                process.exit(0)
            } catch (error) {
                this.logger.error(
                    'main',
                    'CLUSTER-WORKER-ERROR',
                    `Worker task crash: ${error instanceof Error ? error.message : String(error)}`
                )

                await flushAllWebhooks()
                process.exit(1)
            }
        })
    }

    private async runTasks(accounts: Account[], runStartTime: number): Promise<AccountStats[]> {
        const accountStats: AccountStats[] = []

        for (const account of accounts) {
            const accountStartTime = Date.now()
            const accountEmail = account.email
            this.userData.userName = this.utils.getEmailUsername(accountEmail)
            this.userData.timezoneOffset = String(new Date().getTimezoneOffset())
            this.userData.langCode = account.langCode ?? 'en'

            try {
                this.logger.info(
                    'main',
                    'ACCOUNT-START',
                    `Starting account: ${accountEmail} | geoLocale: ${account.geoLocale}`
                )

                this.http = new HttpClient(account.proxy)

                const result: { initialPoints: number; collectedPoints: number } | undefined = await this.Main(
                    account
                ).catch(error => {
                    void this.logger.error(
                        true,
                        'FLOW',
                        `Mobile flow failed for ${accountEmail}: ${error instanceof Error ? error.message : String(error)}`
                    )
                    return undefined
                })

                const durationSeconds = ((Date.now() - accountStartTime) / 1000).toFixed(1)

                if (result) {
                    const collectedPoints = result.collectedPoints ?? 0
                    const accountInitialPoints = result.initialPoints ?? 0
                    const accountFinalPoints = accountInitialPoints + collectedPoints

                    accountStats.push({
                        email: accountEmail,
                        initialPoints: accountInitialPoints,
                        finalPoints: accountFinalPoints,
                        collectedPoints: collectedPoints,
                        duration: parseFloat(durationSeconds),
                        success: true
                    })

                    this.logger.info(
                        'main',
                        'ACCOUNT-END',
                        `Completed account: ${accountEmail} | pointsGained=${collectedPoints} | previousBalance=${accountInitialPoints} | currentBalance=${accountFinalPoints} | durationSeconds=${durationSeconds}`,
                        'green'
                    )
                } else {
                    accountStats.push({
                        email: accountEmail,
                        initialPoints: 0,
                        finalPoints: 0,
                        collectedPoints: 0,
                        duration: parseFloat(durationSeconds),
                        success: false,
                        error: 'Flow failed'
                    })
                }
            } catch (error) {
                const durationSeconds = ((Date.now() - accountStartTime) / 1000).toFixed(1)
                this.logger.error(
                    'main',
                    'ACCOUNT-ERROR',
                    `${accountEmail}: ${error instanceof Error ? error.message : String(error)}`
                )

                accountStats.push({
                    email: accountEmail,
                    initialPoints: 0,
                    finalPoints: 0,
                    collectedPoints: 0,
                    duration: parseFloat(durationSeconds),
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                })
            }
        }

        if (this.config.clusters <= 1 && cluster.isPrimary) {
            const totalCollectedPoints = accountStats.reduce((sum, s) => sum + s.collectedPoints, 0)
            const totalInitialPoints = accountStats.reduce((sum, s) => sum + s.initialPoints, 0)
            const totalFinalPoints = accountStats.reduce((sum, s) => sum + s.finalPoints, 0)
            const totalDurationMinutes = ((Date.now() - runStartTime) / 1000 / 60).toFixed(1)

            this.logger.info(
                'main',
                'RUN-END',
                `Completed all accounts | accountsProcessed=${accountStats.length} | pointsGained=${totalCollectedPoints} | previousBalance=${totalInitialPoints} | currentBalance=${totalFinalPoints} | runtimeMinutes=${totalDurationMinutes}`,
                'green'
            )

            await flushAllWebhooks()
            process.exit(0)
        }

        return accountStats
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
        const accountEmail = account.email
        this.logger.info('main', 'FLOW', `Starting session for ${accountEmail}`)

        // Drop cookies and app credentials from the previous account
        this.browser.func.resetHttpJars()
        this.accessToken = ''

        const apiSearch = this.config.experimental.apiSearch
        const apiSearchOnBing = this.config.experimental.apiSearchOnBing
        const fullApi = apiSearch && (apiSearchOnBing || !this.config.activities.searchOnBing)

        let mobileSession: BrowserSession | null = null
        let desktopSession: BrowserSession | null = null

        try {
            return await executionContext.run({ isMobile: true, account }, async () => {
                mobileSession = await this.browserFactory.createBrowser(account)
                const initialContext: BrowserContext = mobileSession.context
                this.mainMobilePage = await initialContext.newPage()

                this.logger.info('main', 'BROWSER', `Mobile Browser started | ${accountEmail}`)

                await this.login.login(this.mainMobilePage, account)

                try {
                    this.accessToken = await this.login.getAppAccessToken(this.mainMobilePage, accountEmail)
                } catch (error) {
                    this.logger.error(
                        'main',
                        'FLOW',
                        `Failed to get mobile access token: ${error instanceof Error ? error.message : String(error)}`
                    )
                    this.accessToken = ''
                }

                await this.browser.func.checkpointActiveSession('LOGIN-CHECKPOINT')
                this.cookies.mobile = await initialContext.cookies()
                this.fingerprintMobile = mobileSession.fingerprint

                if (fullApi) {
                    await this.browser.func.closeBrowser(initialContext, accountEmail)
                    mobileSession = null
                    this.logger.info(
                        'main',
                        'FLOW',
                        'Mobile login browser closed; continuing with the saved session and HTTP requests'
                    )
                }

                const data: DashboardData = await this.browser.func.getDashboardData()
                let appData: AppDashboardData | null = null

                if (this.accessToken) {
                    try {
                        appData = await this.browser.func.getAppDashboardData()
                    } catch (error) {
                        this.logger.warn(
                            'main',
                            'LOGIN-APP',
                            `App dashboard unavailable - app activities will be skipped this run | message=${error instanceof Error ? error.message : String(error)}`
                        )
                        this.accessToken = ''
                    }
                }

                this.userData.geoLocale =
                    account.geoLocale === 'auto'
                        ? data.dashboard.userProfile.attributes.country
                        : account.geoLocale.toLowerCase()
                if (this.userData.geoLocale.length > 2) {
                    this.logger.warn(
                        'main',
                        'GEO-LOCALE',
                        `The provided geoLocale is longer than 2 (${this.userData.geoLocale} | auto=${account.geoLocale === 'auto'}), this is likely invalid and can cause errors!`
                    )
                }

                this.userData.initialPoints = data.dashboard.userStatus.availablePoints
                this.userData.currentPoints = data.dashboard.userStatus.availablePoints
                const initialPoints = this.userData.initialPoints ?? 0

                const browserEarnable = await this.browser.func.getBrowserEarnablePoints()
                let appEarnable: AppEarnablePoints | null = null

                if (this.accessToken) {
                    try {
                        appEarnable = await this.browser.func.getAppEarnablePoints()
                    } catch (error) {
                        this.logger.warn(
                            'main',
                            'LOGIN-APP',
                            `App earnable-points lookup failed - app activities will be skipped this run | message=${error instanceof Error ? error.message : String(error)}`
                        )
                        this.accessToken = ''
                        appData = null
                    }
                }

                const pointsCanCollect = browserEarnable.mobileSearchPoints + (appEarnable?.totalEarnablePoints ?? 0)
                const appAvailable = Boolean(this.accessToken && appData)

                this.logger.info(
                    'main',
                    'POINTS',
                    `Earnable today | Mobile: ${pointsCanCollect} | Browser: ${
                        browserEarnable.mobileSearchPoints
                    } | App: ${appEarnable?.totalEarnablePoints ?? 0} | ${accountEmail} | locale: ${this.userData.geoLocale}`
                )

                const parallel = this.config.searchSettings.parallelSearching
                const doBonus = this.config.workers.doBonusSearches
                const doVisualSearch = this.config.workers.doVisualSearch

                let mobilePoints = 0
                let desktopPoints = 0
                let bonusPoints = 0

                if (fullApi) {
                    if (this.config.ensureStreakProtection) {
                        await this.activities.doEnsureStreakProtection()
                    }
                    if (this.config.workers.doPunchCards) await this.punchcardManager.runMobile(data)
                    if (this.config.workers.doActivateSearchPerk) await this.activities.doActivateSearchPerk(data)

                    const plan = await this.searchManager.getSearchPoints()
                    const doMobileSearch = plan.doMobile
                    const doDesktopSearch = plan.doDesktop
                    const desktopNeeded = this.config.workers.doPunchCards || doDesktopSearch || doVisualSearch

                    if (desktopNeeded) {
                        await executionContext.run({ isMobile: false, account }, async () => {
                            desktopSession = await this.createDesktopSession(account)
                            await this.punchcardManager.runDesktop()
                            if (doVisualSearch) await this.activities.doVisualSearch(data)
                        })

                        await executionContext.run({ isMobile: false, account }, async () => {
                            await this.browser.func.closeBrowser(desktopSession!.context, accountEmail)
                        })
                        desktopSession = null
                    }

                    if (this.config.workers.doDailySet) await this.workers.doDailySet(data)
                    if (this.config.workers.doMorePromotions) await this.workers.doMorePromotions(data)
                    if (appAvailable && this.config.workers.doDailyCheckIn) await this.activities.doDailyCheckIn()
                    if (appAvailable && this.config.workers.doAppPromotions && appData)
                        await this.workers.doAppPromotions(appData)
                    if (appAvailable && this.config.workers.doReadToEarn) await this.activities.doReadToEarn()

                    if (doMobileSearch) mobilePoints = await this.searchManager.searchMobile(account)
                    if (doBonus) bonusPoints = await this.searchManager.bonusMobile(account)
                    if (doDesktopSearch) desktopPoints = await this.searchManager.searchDesktop(account)
                } else {
                    if (this.config.ensureStreakProtection) {
                        await this.activities.doEnsureStreakProtection()
                    }
                    if (this.config.workers.doDailySet) await this.workers.doDailySet(data)
                    if (this.config.workers.doActivateSearchPerk) await this.activities.doActivateSearchPerk(data)
                    if (this.config.workers.doMorePromotions) await this.workers.doMorePromotions(data)
                    if (appAvailable && this.config.workers.doDailyCheckIn) await this.activities.doDailyCheckIn()
                    if (appAvailable && this.config.workers.doAppPromotions && appData)
                        await this.workers.doAppPromotions(appData)
                    if (appAvailable && this.config.workers.doReadToEarn) await this.activities.doReadToEarn()
                    if (this.config.workers.doPunchCards) await this.punchcardManager.runMobile(data)

                    const plan = await this.searchManager.getSearchPoints()
                    const doMobileSearch = plan.doMobile
                    const doDesktopSearch = plan.doDesktop

                    const desktopNeeded = this.config.workers.doPunchCards || doDesktopSearch || doVisualSearch

                    if (parallel && !apiSearch && doMobileSearch && doDesktopSearch) {
                        if (desktopNeeded) {
                            await executionContext.run({ isMobile: false, account }, async () => {
                                desktopSession = await this.createDesktopSession(account)
                                await this.punchcardManager.runDesktop()
                                if (doVisualSearch) await this.activities.doVisualSearch(data)
                            })
                        }

                        ;[mobilePoints, desktopPoints] = await Promise.all([
                            this.searchManager.searchMobile(account),
                            this.searchManager.searchDesktop(account)
                        ])

                        if (doBonus) bonusPoints = await this.searchManager.bonusMobile(account)

                        if (desktopSession) {
                            await executionContext.run({ isMobile: false, account }, async () => {
                                await this.browser.func.closeBrowser(desktopSession!.context, accountEmail)
                            })
                            desktopSession = null
                        }
                    } else {
                        if (apiSearch) {
                            if (doMobileSearch) mobilePoints = await this.searchManager.searchMobile(account)
                            if (doBonus) bonusPoints = await this.searchManager.bonusMobile(account)
                        } else {
                            if (doMobileSearch) mobilePoints = await this.searchManager.searchMobile(account)
                            if (doBonus) bonusPoints = await this.searchManager.bonusMobile(account)
                        }

                        if (desktopNeeded) {
                            await executionContext.run({ isMobile: false, account }, async () => {
                                desktopSession = await this.createDesktopSession(account)

                                await this.punchcardManager.runDesktop()
                                if (doVisualSearch) await this.activities.doVisualSearch(data)
                                if (doDesktopSearch && !apiSearch) {
                                    desktopPoints = await this.searchManager.searchDesktop(account)
                                }
                            })

                            await executionContext.run({ isMobile: false, account }, async () => {
                                await this.browser.func.closeBrowser(desktopSession!.context, accountEmail)
                            })
                            desktopSession = null

                            if (doDesktopSearch && apiSearch) {
                                desktopPoints = await this.searchManager.searchDesktop(account)
                            }
                        }
                    }
                }

                this.logger.info(
                    'main',
                    'SEARCH-MANAGER',
                    `Search summary | mobile=${mobilePoints} | desktop=${desktopPoints} | bonus=${bonusPoints} | total=${
                        mobilePoints + desktopPoints + bonusPoints
                    }`
                )

                if (mobileSession) {
                    await this.browser.func.checkpointActiveSession('PRE-FINAL-REWARDS')
                }

                if (this.config.workers.doClaimBonusPoints) await this.workers.doClaimBonusPoints()

                const finalPoints = await this.browser.func.getCurrentPoints()
                const collectedPoints = finalPoints - initialPoints

                this.logger.info(
                    'main',
                    'FLOW',
                    `Points collected | pointsGained=${collectedPoints} | currentBalance=${finalPoints} | account=${accountEmail}`
                )

                return {
                    initialPoints,
                    collectedPoints: collectedPoints || 0
                }
            })
        } finally {
            if (mobileSession) {
                try {
                    await executionContext.run({ isMobile: true, account }, async () => {
                        await this.browser.func.closeBrowser(mobileSession!.context, accountEmail)
                    })
                } catch (error) {
                    this.logger.debug(
                        'main',
                        'CLEANUP',
                        `Mobile context close failed | ${error instanceof Error ? error.message : String(error)}`
                    )
                }
            }

            if (desktopSession) {
                try {
                    await executionContext.run({ isMobile: false, account }, async () => {
                        await this.browser.func.closeBrowser(desktopSession!.context, accountEmail)
                    })
                } catch (error) {
                    this.logger.debug(
                        'main',
                        'CLEANUP',
                        `Desktop context close failed | ${error instanceof Error ? error.message : String(error)}`
                    )
                }
                desktopSession = null
            }
        }
    }
}

export { executionContext }

async function main(): Promise<void> {
    checkNodeVersion()
    const rewardsBot = new MicrosoftRewardsBot()

    process.on('beforeExit', () => {
        void flushAllWebhooks()
    })
    process.on('SIGINT', async () => {
        rewardsBot.logger.warn('main', 'PROCESS', 'SIGINT received, flushing and exiting...')
        await flushAllWebhooks()
        process.exit(130)
    })
    process.on('SIGTERM', async () => {
        rewardsBot.logger.warn('main', 'PROCESS', 'SIGTERM received, flushing and exiting...')
        await flushAllWebhooks()
        process.exit(143)
    })
    process.on('uncaughtException', async error => {
        if (isBrowserClosedError(error)) {
            rewardsBot.logger.debug(
                'main',
                'UNCAUGHT-EXCEPTION',
                `Ignoring benign browser-closed error during teardown | ${error instanceof Error ? error.message : String(error)}`
            )
            return
        }
        rewardsBot.logger.error('main', 'UNCAUGHT-EXCEPTION', error)
        await flushAllWebhooks()
        process.exit(1)
    })
    process.on('unhandledRejection', async reason => {
        if (isBrowserClosedError(reason)) {
            rewardsBot.logger.debug(
                'main',
                'UNHANDLED-REJECTION',
                `Ignoring benign browser-closed rejection during teardown | ${reason instanceof Error ? reason.message : String(reason)}`
            )
            return
        }
        rewardsBot.logger.error('main', 'UNHANDLED-REJECTION', reason as Error)
        await flushAllWebhooks()
        process.exit(1)
    })

    try {
        await rewardsBot.initialize()
        await rewardsBot.run()
    } catch (error) {
        rewardsBot.logger.error('main', 'MAIN-ERROR', error as Error)
    }
}

main().catch(async error => {
    const tmpBot = new MicrosoftRewardsBot()
    tmpBot.logger.error('main', 'MAIN-ERROR', error as Error)
    await flushAllWebhooks()
    process.exit(1)
})
