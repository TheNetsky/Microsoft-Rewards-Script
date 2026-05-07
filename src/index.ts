import { AsyncLocalStorage } from 'node:async_hooks'
import cluster, { Worker } from 'cluster'
import type { BrowserContext, Cookie, Page } from 'patchright'
import pkg from '../package.json'

import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator'

import Browser from './browser/Browser'
import BrowserFunc from './browser/BrowserFunc'
import BrowserUtils from './browser/BrowserUtils'

import { IpcLog, Logger } from './logging/Logger'
import Utils from './util/Utils'
import { loadAccounts, loadConfig } from './util/Load'
import { checkNodeVersion } from './util/Validator'

import { Login } from './browser/auth/Login'
import { Workers } from './functions/Workers'
import Activities from './functions/Activities'
import { SearchManager } from './functions/SearchManager'

import type { Account } from './interface/Account'
import HttpCloakClient from './util/httpcloak'
import { sendDiscord, flushDiscordQueue } from './logging/Discord'
import { sendNtfy, flushNtfyQueue } from './logging/Ntfy'
import type { DashboardData } from './interface/DashboardData'
import type { AppDashboardData } from './interface/AppDashBoardData'
import type { PanelFlyoutData } from './interface/PanelFlyoutData'
import { writeSerpBotScoreLog } from './util/SerpBotScoreLogger'

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
    serpBotScore?: string
    serpBotScoreUpd?: string
}

const executionContext = new AsyncLocalStorage<ExecutionContext>()
const EMPTY_ACCOUNT: Account = {
    email: '',
    password: '',
    recoveryEmail: '',
    geoLocale: 'auto',
    langCode: 'en',
    proxy: {
        proxyAxios: false,
        url: '',
        port: 0,
        password: '',
        username: ''
    },
    saveFingerprint: {
        mobile: false,
        desktop: false
    }
}

export function getCurrentContext(): ExecutionContext {
    const context = executionContext.getStore()
    if (!context) {
        return { isMobile: false, account: EMPTY_ACCOUNT }
    }
    return context
}

async function flushAllWebhooks(timeoutMs = 5000): Promise<void> {
    await Promise.allSettled([flushDiscordQueue(timeoutMs), flushNtfyQueue(timeoutMs)])
}

interface UserData {
    userName: string
    geoLocale: string
    langCode: string
    initialPoints: number
    currentPoints: number
    gainedPoints: number
}

export class MicrosoftRewardsBot {
    public logger: Logger
    public config
    public utils: Utils
    public activities: Activities = new Activities(this)
    public browser: { func: BrowserFunc; utils: BrowserUtils }

    public mainMobilePage!: Page
    public mainDesktopPage!: Page

    public userData: UserData

    public accessToken = ''
    public requestToken = ''
    public rewardsVersion: 'legacy' | 'modern' = 'legacy'
    public panelData!: PanelFlyoutData
    public cookies: { mobile: Cookie[]; desktop: Cookie[] }
    public fingerprint!: BrowserFingerprintWithHeaders

    private pointsCanCollect = 0

    private activeWorkers: number
    private exitedWorkers: number[]
    private browserFactory: Browser = new Browser(this)
    private accounts: Account[]
    private workers: Workers
    private login = new Login(this)
    private searchManager: SearchManager

    public httpcloak!: HttpCloakClient
    public get axios(): HttpCloakClient {
        return this.httpcloak
    }

    constructor() {
        this.userData = {
            userName: '',
            geoLocale: 'US',
            langCode: 'en',
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
        this.browser = {
            func: new BrowserFunc(this),
            utils: new BrowserUtils(this)
        }
        this.config = loadConfig()
        this.activeWorkers = this.config.clusters
        this.exitedWorkers = []
    }

    get isMobile(): boolean {
        return getCurrentContext().isMobile
    }

    async initialize(): Promise<void> {
        this.accounts = loadAccounts()
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

        const accountQueue = [...this.accounts]
        const maxWorkers = Math.max(1, Math.min(this.config.clusters, accountQueue.length))
        this.activeWorkers = 0

        const allAccountStats: AccountStats[] = []
        let hadWorkerFailure = false

        const spawnNextWorker = async (): Promise<boolean> => {
            const nextAccount = accountQueue.shift()
            if (!nextAccount) {
                return false
            }

            const worker = cluster.fork()
            this.activeWorkers += 1
            worker.send?.({ chunk: [nextAccount], runStartTime })

            worker.on('message', (msg: { __ipcLog?: IpcLog; __stats?: AccountStats[] }) => {
                if (msg.__stats) {
                    allAccountStats.push(...msg.__stats)
                }

                const log = msg.__ipcLog
                if (log && typeof log.content === 'string') {
                    const { webhook } = this.config
                    const { content, level } = log

                    // Webhooks, for later expansion?
                    if (webhook.discord?.enabled && webhook.discord.url) {
                        sendDiscord(webhook.discord.url, content, level)
                    }
                    if (webhook.ntfy?.enabled && webhook.ntfy.url) {
                        sendNtfy(webhook.ntfy, content, level)
                    }
                }
            })

            // Startup delay to smooth resource usage spikes
            if (accountQueue.length > 0) {
                await this.utils.wait(5000)
            }

            return true
        }

        const onWorkerExit = async (worker: Worker, code?: number, signal?: string): Promise<void> => {
            const { pid } = worker.process

            if (!pid || this.exitedWorkers.includes(pid)) {
                return
            }

            this.exitedWorkers.push(pid)
            this.activeWorkers -= 1

            // exit 0 = good, exit 1 = crash
            const failed = (code ?? 0) !== 0 || Boolean(signal)
            if (failed) {
                hadWorkerFailure = true
            }

            if (accountQueue.length > 0) {
                await spawnNextWorker()
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
                    `Completed all accounts | Accounts processed: ${allAccountStats.length} | Total points collected: +${totalCollectedPoints} | Old total: ${totalInitialPoints} → New total: ${totalFinalPoints} | Total runtime: ${totalDurationMinutes}min`,
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
            this.logger.warn('main', 'CLUSTER-WORKER-DISCONNECT', `Worker ${pid ?? '?'} disconnected`) // <-- Warning only
        })

        for (let i = 0; i < maxWorkers; i++) {
            const spawned = await spawnNextWorker()
            if (!spawned) {
                break
            }
        }
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

                // Send and flush before exit
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

    private isFlow401Error(error: unknown): boolean {
        const errorMessage = this.toErrorMessage(error)
        const errorStatus = (error as { response?: { status?: number } })?.response?.status
        return errorStatus === 401 || /status code\s*401/i.test(errorMessage)
    }

    private toErrorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error)
    }

    private pushFailedAccountStat(
        accountStats: AccountStats[],
        accountEmail: string,
        durationSeconds: string,
        errorMessage: string
    ): void {
        accountStats.push({
            email: accountEmail,
            initialPoints: 0,
            finalPoints: 0,
            collectedPoints: 0,
            duration: parseFloat(durationSeconds),
            success: false,
            error: errorMessage
        })
    }

    private async runTasks(accounts: Account[], runStartTime: number): Promise<AccountStats[]> {
        const accountStats: AccountStats[] = []

        for (const account of accounts) {
            const accountStartTime = Date.now()
            const accountEmail = account.email
            this.userData.userName = this.utils.getEmailUsername(accountEmail)

            // FIX: Reset shared state between accounts to prevent state bleed from previous account
            this.accessToken = ''
            this.requestToken = ''
            this.cookies = { mobile: [], desktop: [] }
            this.userData.gainedPoints = 0
            this.userData.initialPoints = 0
            this.userData.currentPoints = 0
            this.rewardsVersion = 'legacy'

            try {
                this.logger.info(
                    'main',
                    'ACCOUNT-START',
                    `Starting account: ${accountEmail} | geoLocale: ${account.geoLocale}`
                )

                this.httpcloak = new HttpCloakClient(account.proxy, { debug: this.config.debugLogs })
                const maxMobileFlowRetries = 3
                let result: { initialPoints: number; collectedPoints: number; serpBotScore: string; serpBotScoreUpd: string } | undefined
                let lastFlowErrorMessage = ''

                for (let attempt = 1; !result && attempt <= maxMobileFlowRetries; attempt++) {
                    try {
                        result = await this.Main(account)
                    } catch (error) {
                        const errorMessage = this.toErrorMessage(error)
                        lastFlowErrorMessage = errorMessage
                        const canRetry = this.isFlow401Error(error) && attempt < maxMobileFlowRetries

                        if (canRetry) {
                            this.logger.warn(
                                true,
                                'FLOW-RETRY',
                                `Mobile flow 401 for ${accountEmail}, retrying (${attempt}/${maxMobileFlowRetries}) | message=${errorMessage}`
                            )
                            await this.utils.wait(this.utils.randomDelay(2500, 4500))
                        } else {
                            this.logger.error(true, 'FLOW', `Mobile flow failed for ${accountEmail}: ${errorMessage}`)
                        }
                    }
                }

                const durationSeconds = ((Date.now() - accountStartTime) / 1000).toFixed(1)

                if (result) {
                    const collectedPoints = result.collectedPoints ?? 0
                    const accountInitialPoints = result.initialPoints ?? 0
                    const accountFinalPoints = accountInitialPoints + collectedPoints
                    const serpBotScore = result.serpBotScore ?? 'N/A'
                    const serpBotScoreUpd = result.serpBotScoreUpd ?? 'N/A'

                    accountStats.push({
                        email: accountEmail,
                        initialPoints: accountInitialPoints,
                        finalPoints: accountFinalPoints,
                        collectedPoints: collectedPoints,
                        duration: parseFloat(durationSeconds),
                        success: true,
                        serpBotScore,
                        serpBotScoreUpd
                    })

                    this.logger.info(
                        'main',
                        'ACCOUNT-END',
                        `Completed account: ${accountEmail} | Total: +${collectedPoints} | Old: ${accountInitialPoints} → New: ${accountFinalPoints} | SerpBotScore: ${serpBotScore} | Duration: ${durationSeconds}s`,
                        'green'
                    )
                } else {
                    this.pushFailedAccountStat(
                        accountStats,
                        accountEmail,
                        durationSeconds,
                        lastFlowErrorMessage || 'Flow failed'
                    )
                }
            } catch (error) {
                const durationSeconds = ((Date.now() - accountStartTime) / 1000).toFixed(1)
                this.logger.error(
                    'main',
                    'ACCOUNT-ERROR',
                    `${accountEmail}: ${this.toErrorMessage(error)}`
                )

                this.pushFailedAccountStat(accountStats, accountEmail, durationSeconds, this.toErrorMessage(error))

                // FIX: Add a short delay before moving to the next account after an error,
                // giving browser processes time to fully release resources
                this.logger.info('main', 'ACCOUNT-SWITCH', `Waiting 3s before switching to next account...`)
                await this.utils.wait(3000)
            }
        }

        if (this.config.clusters <= 1 && cluster.isPrimary) {
            const totalCollectedPoints = accountStats.reduce((sum, s) => sum + s.collectedPoints, 0)
            const totalInitialPoints = accountStats.reduce((sum, s) => sum + s.initialPoints, 0)
            const totalFinalPoints = accountStats.reduce((sum, s) => sum + s.finalPoints, 0)
            const totalDurationMinutes = ((Date.now() - runStartTime) / 1000 / 60).toFixed(1)

            // Write SerpBotScore daily log
            const serpEntries = accountStats.map(s => ({
                email: s.email,
                collectedPoints: s.collectedPoints,
                initialPoints: s.initialPoints,
                finalPoints: s.finalPoints,
                serpBotScore: s.serpBotScore ?? 'N/A',
                serpBotScoreUpd: s.serpBotScoreUpd ?? 'N/A',
                duration: s.duration,
                success: s.success,
                error: s.error
            }))
            if (serpEntries.length > 0) {
                await writeSerpBotScoreLog(serpEntries)
                this.logger.info('main', 'SERP-BOT-SCORE-LOG', `Account log saved → logs/SerpBotScore_${new Date().toISOString().slice(0, 10)}.txt`)
            }

            this.logger.info(
                'main',
                'RUN-END',
                `Completed all accounts | Accounts processed: ${accountStats.length} | Total points collected: +${totalCollectedPoints} | Old total: ${totalInitialPoints} → New total: ${totalFinalPoints} | Total runtime: ${totalDurationMinutes}min`,
                'green'
            )

            await flushAllWebhooks()
            process.exit(0)
        }

        return accountStats
    }

    async Main(account: Account): Promise<{ initialPoints: number; collectedPoints: number; serpBotScore: string; serpBotScoreUpd: string }> {
        const accountEmail = account.email
        this.logger.info('main', 'FLOW', `Starting session for ${accountEmail}`)

        let mobileSession: BrowserSession | null = null

        try {
            return await executionContext.run({ isMobile: true, account }, async () => {
                mobileSession = await this.browserFactory.createBrowser(account)
                const initialContext: BrowserContext = mobileSession.context
                this.mainMobilePage = await initialContext.newPage()

                this.logger.info('main', 'BROWSER', `Mobile Browser started | ${accountEmail}`)

                // Login with retry for recoverable errors
                const maxLoginRetries = 3
                for (let loginAttempt = 1; loginAttempt <= maxLoginRetries; loginAttempt++) {
                    try {
                        await this.login.login(this.mainMobilePage, account)
                        break // Success, exit retry loop
                    } catch (error) {
                        const errorMsg = error instanceof Error ? error.message : String(error)
                        const isRecoverableError = errorMsg.includes('Enter the code to help us verify') ||
                                                   errorMsg.includes('TOTP authentication failed') ||
                                                   errorMsg.includes('status code 401')
                        
                        if (isRecoverableError && loginAttempt < maxLoginRetries) {
                            this.logger.warn(
                                'main',
                                'LOGIN-RETRY',
                                `Login failed with recoverable error, retrying (${loginAttempt}/${maxLoginRetries}): ${errorMsg}`
                            )
                            // Navigate back to start fresh
                            await this.mainMobilePage.goto('https://www.bing.com/rewards/dashboard', { 
                                waitUntil: 'domcontentloaded',
                                timeout: 10000 
                            }).catch(() => {})
                            await this.utils.wait(2000)
                            continue
                        }
                        throw error // Non-recoverable or max retries reached
                    }
                }

                try {
                    this.accessToken = await this.login.getAppAccessToken(this.mainMobilePage, accountEmail)
                } catch (error) {
                    this.logger.error(
                        'main',
                        'FLOW',
                        `Failed to get mobile access token: ${error instanceof Error ? error.message : String(error)}`
                    )
                }

                this.cookies.mobile = await initialContext.cookies()
                this.fingerprint = mobileSession.fingerprint

                const data: DashboardData = await this.browser.func.getDashboardData()
                const appData: AppDashboardData = await this.browser.func.getAppDashboardData()
                this.panelData = await this.browser.func.getPanelFlyoutData()

                // Set geo
                this.userData.geoLocale =
                    account.geoLocale === 'auto' ? data.userProfile.attributes.country : account.geoLocale.toLowerCase()
                if (this.userData.geoLocale.length > 2) {
                    this.logger.warn(
                        'main',
                        'GEO-LOCALE',
                        `The provided geoLocale is longer than 2 (${this.userData.geoLocale} | auto=${account.geoLocale === 'auto'}), this is likely invalid and can cause errors!`
                    )
                }

                this.userData.initialPoints = data.userStatus.availablePoints
                this.userData.currentPoints = data.userStatus.availablePoints
                const initialPoints = this.userData.initialPoints ?? 0

                const browserEarnable = await this.browser.func.getBrowserEarnablePoints()
                const appEarnable = await this.browser.func.getAppEarnablePoints()

                this.pointsCanCollect = browserEarnable.mobileSearchPoints + (appEarnable?.totalEarnablePoints ?? 0)

                this.logger.info(
                    'main',
                    'POINTS',
                    `Earnable today | Mobile: ${this.pointsCanCollect} | Browser: ${
                        browserEarnable.mobileSearchPoints
                    } | App: ${appEarnable?.totalEarnablePoints ?? 0} | ${accountEmail} | locale: ${this.userData.geoLocale}`
                )

                if (this.config.workers.doAppPromotions) await this.workers.doAppPromotions(appData)
                if (this.config.workers.doDailySet) await this.workers.doDailySet(data, this.mainMobilePage)
                if (this.config.workers.doSpecialPromotions) await this.workers.doSpecialPromotions(data)
                if (this.config.workers.doExploreOnBingActivation)
                    await this.workers.doExploreOnBingActivation(data, this.mainMobilePage)
                if (this.config.workers.doMorePromotions) await this.workers.doMorePromotions(data, this.mainMobilePage)
                if (this.config.workers.doDailyCheckIn) await this.activities.doDailyCheckIn()
                if (this.config.workers.doReadToEarn) await this.activities.doReadToEarn()
                if (this.config.workers.doPunchCards) await this.workers.doPunchCards(data, this.mainMobilePage)

                const searchPoints = await this.browser.func.getSearchPoints()
                const missingSearchPoints = this.browser.func.missingSearchPoints(searchPoints, true)

                this.cookies.mobile = await initialContext.cookies()

                const { mobilePoints, desktopPoints } = await this.searchManager.doSearches(
                    data,
                    missingSearchPoints,
                    mobileSession,
                    account,
                    accountEmail
                )

                this.userData.gainedPoints = mobilePoints + desktopPoints

                const finalPoints = await this.browser.func.getCurrentPoints()
                const collectedPoints = finalPoints - initialPoints

                this.logger.info(
                    'main',
                    'FLOW',
                    `Collected: +${collectedPoints} | Mobile: +${mobilePoints} | Desktop: +${desktopPoints} | ${accountEmail}`
                )

                const serpBotScore = data.userProfile?.attributes?.serpbotscore ?? 'N/A'
                const serpBotScoreUpdRaw = data.userProfile?.attributes?.serpbotscore_upd
                const serpBotScoreUpd = serpBotScoreUpdRaw
                    ? new Date(serpBotScoreUpdRaw).toLocaleString('id-ID', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: false
                      })
                    : 'N/A'

                return {
                    initialPoints,
                    collectedPoints: collectedPoints || 0,
                    serpBotScore,
                    serpBotScoreUpd
                }
            })
        } finally {
            // FIX: Always attempt to close the browser context to prevent resource leaks between accounts
            if (mobileSession) {
                try {
                    await executionContext.run({ isMobile: true, account }, async () => {
                        await this.browser.func.closeBrowser(mobileSession!.context, accountEmail)
                    })
                } catch (closeError) {
                    this.logger.warn(
                        'main',
                        'FLOW',
                        `Failed to close browser for ${accountEmail}: ${closeError instanceof Error ? closeError.message : String(closeError)}`
                    )
                }
                mobileSession = null
            }
        }
    }
}

export { executionContext }

async function main(): Promise<void> {
    // Check before doing anything
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
    // FIX: Log uncaught errors without immediately killing the process,
    // so the account loop in runTasks can continue to the next account.
    // Only exit if the error is truly fatal (not a per-account browser crash).
    const isBrowserLevelError = (msg: string): boolean =>
        msg.includes('Target closed') ||
        msg.includes('Browser closed') ||
        msg.includes('Connection closed') ||
        msg.includes('page.close') ||
        msg.includes('context.close') ||
        msg.includes('Playwright') ||
        msg.includes('Cannot find context with specified id') ||
        msg.includes('Execution context was destroyed') ||
        msg.includes('Cannot find execution context') ||
        msg.includes('frame was detached') ||
        msg.includes('Protocol error (DOM.')

    process.on('uncaughtException', async error => {
        const msg = error instanceof Error ? error.message : String(error)
        if (isBrowserLevelError(msg)) {
            rewardsBot.logger.debug('main', 'UNCAUGHT-EXCEPTION', `Browser-level error suppressed: ${msg}`)
        } else {
            rewardsBot.logger.error('main', 'UNCAUGHT-EXCEPTION', error)
            await flushAllWebhooks()
            process.exit(1)
        }
    })
    process.on('unhandledRejection', async reason => {
        const msg = reason instanceof Error ? reason.message : String(reason)
        if (isBrowserLevelError(msg)) {
            rewardsBot.logger.debug('main', 'UNHANDLED-REJECTION', `Browser-level rejection suppressed: ${msg}`)
        } else {
            rewardsBot.logger.error('main', 'UNHANDLED-REJECTION', reason as Error)
            await flushAllWebhooks()
            process.exit(1)
        }
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
