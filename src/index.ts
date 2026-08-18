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
import { closeSessionStore, loadResolvedRegion, saveResolvedRegion } from './util/SessionStore'
import { checkNodeVersion } from './util/Validator'
import { normalizeCountry, resolveAccountLocale } from './util/Locale'
import type { AccountLocale } from './util/Locale'

import { Login } from './browser/auth/Login'
import Activities from './functions/Activities'
import { SearchManager } from './functions/activities/search/SearchManager'

import type { Account } from './interface/Account'
import HttpClient from './util/Http'
import { sendDiscord, flushDiscordQueue } from './logging/Discord'
import { sendNtfy, flushNtfyQueue } from './logging/Ntfy'
import { sendTelegram, flushTelegramQueue } from './logging/Telegram'
import { sendPushPlus, flushPushPlusQueue } from './logging/PushPlus'
import { sendClawBot, flushClawBotQueue, ensureClawBotReady } from './logging/ClawBot'
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
    await Promise.allSettled([
        flushDiscordQueue(timeoutMs),
        flushNtfyQueue(timeoutMs),
        flushTelegramQueue(timeoutMs),
        flushPushPlusQueue(timeoutMs),
        flushClawBotQueue(timeoutMs)
    ])
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
    public accountLocale: AccountLocale

    public nextActions: Record<string, string> = {}
    public nextRouterStateTree = ''
    public reactSnapshot: PageSnapshot | null = null
    public reactSnapshots: { mobile: PageSnapshot | null; desktop: PageSnapshot | null } = {
        mobile: null,
        desktop: null
    }

    public accessToken = ''
    public cookies: { mobile: Cookie[]; desktop: Cookie[] }
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
    private searchManager: SearchManager
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
        this.accountLocale = resolveAccountLocale({ langCode: 'en', geoLocale: 'US' })
        this.logger = new Logger(this)
        this.accounts = []
        this.cookies = { mobile: [], desktop: [] }
        this.utils = new Utils()
        this.searchManager = new SearchManager(this)
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
                `无法刷新奖励上下文 | 原因=${reason} | 账户=不可用`
            )
            return false
        }

        try {
            this.logger.warn(
                this.isMobile,
                'CONTEXT-REFRESH',
                `请求失败后正在刷新奖励浏览器上下文 | 原因=${reason}`
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
                `奖励上下文刷新成功 | Cookie数=${refreshedCookies.length}`,
                'green'
            )
            refreshSucceeded = true
            return true
        } catch (error) {
            this.logger.error(
                this.isMobile,
                'CONTEXT-REFRESH',
                `奖励上下文刷新失败 | 原因=${reason} | 信息=${error instanceof Error ? error.message : String(error)}`
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

    // Move to utils
    private warnExperimental(): void {
        const exp = this.config.experimental
        const searchFeatures = [exp.apiSearch && 'apiSearch', exp.apiSearchOnBing && 'apiSearchOnBing'].filter(
            Boolean
        ) as string[]

        if (searchFeatures.length) {
            this.logger.warn(
                'main',
                'EXPERIMENTAL',
                `${searchFeatures.join(' + ')} 已启用 - 这些功能通过 HTTP 执行搜索，不使用真实浏览器。` +
                    `此路径属于实验性且不安全，可能导致你的账户被标记或封禁。` +
                    `如不确定，请在 config.experimental 下禁用。`,
                'redBright'
            )
        }

        if (exp.edgeBrowsing) {
            this.logger.warn(
                'main',
                'EXPERIMENTAL',
                'edgeBrowsing 已启用 - Edge 浏览活动将在后台通过 HTTP 上报。' +
                    '此集成为实验性功能；如表现异常，请在 config.experimental 下禁用。'
            )
        }
    }

    async run(): Promise<void> {
        const totalAccounts = this.accounts.length
        const runStartTime = Date.now()

        this.logger.info(
            'main',
            'RUN-START',
            `启动微软奖励脚本 | v${pkg.version} | 账户数: ${totalAccounts} | 集群数: ${this.config.clusters}`
        )

        // 主进程启动时检查 ClawBot 凭证：缺失则弹出扫码登录（worker 不重复触发）
        if (cluster.isPrimary) {
            await ensureClawBotReady(this.config.webhook?.clawbot)
        }

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
        void this.logger.info('main', 'CLUSTER-PRIMARY', `主进程已启动 | PID: ${process.pid}`)

        const rawChunks = this.utils.chunkArray(this.accounts, this.config.clusters)
        const accountChunks = rawChunks.filter(c => c && c.length > 0)
        this.activeWorkers = accountChunks.length

        const allAccountStats: AccountStats[] = []
        let hadWorkerFailure = false

        for (const [chunkIndex, chunk] of accountChunks.entries()) {
            if (chunkIndex > 0) {
                await this.waitBeforeNextAccount(chunk[0]?.email)
            }

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
                `worker ${pid} 退出 | 代码: ${code ?? 'n/a'} | 信号: ${signal ?? 'n/a'} | 活跃worker数: ${this.activeWorkers}`
            )

            if (this.activeWorkers <= 0) {
                const totalCollectedPoints = allAccountStats.reduce((sum, s) => sum + s.collectedPoints, 0)
                const totalInitialPoints = allAccountStats.reduce((sum, s) => sum + s.initialPoints, 0)
                const totalFinalPoints = allAccountStats.reduce((sum, s) => sum + s.finalPoints, 0)
                const totalDurationMinutes = ((Date.now() - runStartTime) / 1000 / 60).toFixed(1)

                this.logger.info(
                    'main',
                    'RUN-END',
                    `全部账户完成 | 处理账户数=${allAccountStats.length} | 获得积分=${totalCollectedPoints} | 原余额=${totalInitialPoints} | 现余额=${totalFinalPoints} | 运行分钟数=${totalDurationMinutes}`,
                    'green'
                )

                await this.sendPushPlusSummary(allAccountStats, runStartTime, hadWorkerFailure)
                await this.sendClawBotSummary(allAccountStats, runStartTime, hadWorkerFailure)
                await flushAllWebhooks()

                process.exit(hadWorkerFailure ? 1 : 0)
            }
        }

        cluster.on('exit', (worker, code, signal) => {
            void onWorkerExit(worker, code ?? undefined, signal ?? undefined)
        })

        cluster.on('disconnect', worker => {
            const pid = worker.process?.pid
            this.logger.warn('main', 'CLUSTER-WORKER-DISCONNECT', `worker ${pid ?? '?'} 已断开连接`)
        })
    }

    private runWorker(runStartTimeFromMaster?: number): void {
        void this.logger.info('main', 'CLUSTER-WORKER-START', `worker 已生成 | PID: ${process.pid}`)

        process.on('message', async ({ chunk, runStartTime }: { chunk: Account[]; runStartTime: number }) => {
            void this.logger.info(
                'main',
                'CLUSTER-WORKER-TASK',
                `worker ${process.pid} 接收到 ${chunk.length} 个账户。`
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
                    `worker 任务崩溃: ${error instanceof Error ? error.message : String(error)}`
                )

                await flushAllWebhooks()
                process.exit(1)
            }
        })
    }

    private buildSummaryMessage(accountStats: AccountStats[], runStartTime: number, hadWorkerFailure: boolean): string {
        const totalCollectedPoints = accountStats.reduce((sum, s) => sum + s.collectedPoints, 0)
        const totalInitialPoints = accountStats.reduce((sum, s) => sum + s.initialPoints, 0)
        const totalFinalPoints = accountStats.reduce((sum, s) => sum + s.finalPoints, 0)
        const totalDurationMinutes = ((Date.now() - runStartTime) / 1000 / 60).toFixed(1)
        const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19)

        const lines: string[] = [
            `每日积分摘要 | ${timestamp}`,
            `状态: ${hadWorkerFailure ? '异常' : '完成'}`,
            `账户数: ${accountStats.length}`,
            `总收集积分: +${totalCollectedPoints}`,
            `原始总计: ${totalInitialPoints} → 新总计: ${totalFinalPoints}`,
            `总运行时间: ${totalDurationMinutes}分钟`
        ]

        if (accountStats.length > 0) {
            lines.push('')
            lines.push('账户明细:')
            for (const stat of accountStats) {
                const status = stat.success ? '成功' : '失败'
                const duration = Number.isFinite(stat.duration) ? stat.duration.toFixed(1) : String(stat.duration)
                const error = stat.error ? ` | ${stat.error}` : ''
                lines.push(
                    `${stat.email} | +${stat.collectedPoints} | ${stat.initialPoints}→${stat.finalPoints} | ${duration}秒 | ${status}${error}`
                )
            }
        }

        return lines.join('\n')
    }

    private async sendPushPlusSummary(
        accountStats: AccountStats[],
        runStartTime: number,
        hadWorkerFailure: boolean
    ): Promise<void> {
        const pushplus = this.config?.webhook?.pushplus
        if (!pushplus?.enabled || !pushplus.token) {
            return
        }

        const content = this.buildSummaryMessage(accountStats, runStartTime, hadWorkerFailure)
        await sendPushPlus(pushplus, content)
    }

    private async sendClawBotSummary(
        accountStats: AccountStats[],
        runStartTime: number,
        hadWorkerFailure: boolean
    ): Promise<void> {
        const clawbot = this.config?.webhook?.clawbot
        if (!clawbot?.enabled) {
            return
        }

        const content = this.buildSummaryMessage(accountStats, runStartTime, hadWorkerFailure)
        await sendClawBot(clawbot, content)
    }

    private async runTasks(accounts: Account[], runStartTime: number): Promise<AccountStats[]> {
        const accountStats: AccountStats[] = []

        for (const [accountIndex, account] of accounts.entries()) {
            if (accountIndex > 0) {
                await this.waitBeforeNextAccount(account.email)
            }

            const accountStartTime = Date.now()
            const accountEmail = account.email
            this.userData.userName = this.utils.getEmailUsername(accountEmail)
            this.userData.timezoneOffset = String(new Date().getTimezoneOffset())

            try {
                const cachedRegion =
                    account.geoLocale === 'auto' ? loadResolvedRegion(this.config.sessionPath, accountEmail) : undefined
                this.accountLocale = resolveAccountLocale(account, cachedRegion)
                this.userData.langCode = this.accountLocale.language
                this.userData.geoLocale = this.accountLocale.country ?? 'US'

                this.logger.info(
                    'main',
                    'ACCOUNT-START',
                    `开始处理账户: ${accountEmail} | geoLocale: ${account.geoLocale} | locale: ${this.accountLocale.locale}${
                        cachedRegion ? ` | 缓存区域: ${cachedRegion}` : ''
                    }`
                )

                this.http = new HttpClient(account.proxy, {
                    'Accept-Language': this.accountLocale.acceptLanguage
                })

                const result: { initialPoints: number; collectedPoints: number } | undefined = await this.Main(
                    account
                ).catch(error => {
                    void this.logger.error(
                        true,
                        'FLOW',
                        `${accountEmail} 的移动端流程失败: ${error instanceof Error ? error.message : String(error)}`
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
                        `账户完成: ${accountEmail} | 获得积分=${collectedPoints} | 原余额=${accountInitialPoints} | 现余额=${accountFinalPoints} | 持续秒数=${durationSeconds}`,
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
                    `${accountEmail} | 错误=${error instanceof Error ? error.message : String(error)}`
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
                `全部账户完成 | 处理账户数=${accountStats.length} | 获得积分=${totalCollectedPoints} | 原余额=${totalInitialPoints} | 现余额=${totalFinalPoints} | 运行分钟数=${totalDurationMinutes}`,
                'green'
            )

            const hadFailure = accountStats.some(s => !s.success)
            await this.sendPushPlusSummary(accountStats, runStartTime, hadFailure)
            await this.sendClawBotSummary(accountStats, runStartTime, hadFailure)
            await flushAllWebhooks()
            process.exit(0)
        }

        return accountStats
    }

    private async waitBeforeNextAccount(nextEmail?: string): Promise<void> {
        const { min, max } = this.config.accountDelay
        const minMs = typeof min === 'number' ? min : this.utils.stringToNumber(min)
        const maxMs = typeof max === 'number' ? max : this.utils.stringToNumber(max)

        if (minMs < 0 || maxMs < 0 || maxMs < minMs) {
            throw new Error('accountDelay must use non-negative values with max greater than or equal to min')
        }

        const delayMs = this.utils.randomNumber(Math.ceil(minMs), Math.floor(maxMs))
        this.logger.info(
            'main',
            'ACCOUNT-DELAY',
            `等待 ${(delayMs / 1000).toFixed(1)} 秒后开始下一个账户${
                nextEmail ? ` (${nextEmail})` : ''
            }`
        )
        await this.utils.wait(delayMs)
    }

    async createDesktopSession(account: Account): Promise<BrowserSession> {
        const session = await this.browserFactory.createBrowser(account)
        this.mainDesktopPage = await session.context.newPage()
        this.fingerprintDesktop = session.fingerprint

        this.logger.info(this.isMobile, 'BROWSER', `桌面浏览器已启动 | ${account.email}`)

        await this.login.login(this.mainDesktopPage, account)
        await this.browser.func.checkpointActiveSession('LOGIN-CHECKPOINT')
        this.cookies.desktop = await session.context.cookies()

        return session
    }

    async Main(account: Account): Promise<{ initialPoints: number; collectedPoints: number }> {
        const accountEmail = account.email
        this.logger.info('main', 'FLOW', `开始为 ${accountEmail} 创建会话`)

        // Drop cookies, page snapshots and app credentials from the previous account
        this.accessToken = ''
        this.cookies = { mobile: [], desktop: [] }
        this.reactSnapshot = null
        this.reactSnapshots = { mobile: null, desktop: null }

        const apiSearch = this.config.experimental.apiSearch
        const apiSearchOnBing = this.config.experimental.apiSearchOnBing
        const fullApi = apiSearch && (apiSearchOnBing || !this.config.activities.searchOnBing)

        let mobileSession: BrowserSession | null = null
        let desktopSession: BrowserSession | null = null
        const edgeBrowsingController = new AbortController()
        let edgeBrowsingTask: Promise<void> | null = null
        let edgeBrowsingFinished = false

        const closeMobileSession = async (): Promise<void> => {
            const session = mobileSession
            if (!session) return
            mobileSession = null

            await executionContext.run({ isMobile: true, account }, async () => {
                await this.browser.func.checkpointActiveSession('PRE-BROWSER-CLOSE')
                await this.browser.func.closeBrowser(session.context, accountEmail)
            })
        }

        const closeDesktopSession = async (): Promise<void> => {
            const session = desktopSession
            if (!session) return
            desktopSession = null

            await executionContext.run({ isMobile: false, account }, async () => {
                await this.browser.func.checkpointActiveSession('PRE-BROWSER-CLOSE')
                await this.browser.func.closeBrowser(session.context, accountEmail)
            })
        }

        try {
            return await executionContext.run({ isMobile: true, account }, async () => {
                mobileSession = await this.browserFactory.createBrowser(account)
                const initialContext: BrowserContext = mobileSession.context
                this.mainMobilePage = await initialContext.newPage()

                this.logger.info('main', 'BROWSER', `移动浏览器已启动 | ${accountEmail}`)

                await this.login.login(this.mainMobilePage, account)

                try {
                    this.accessToken = await this.login.getAppAccessToken(this.mainMobilePage, accountEmail)
                } catch (error) {
                    this.logger.error(
                        'main',
                        'FLOW',
                        `获取移动端访问令牌失败: ${error instanceof Error ? error.message : String(error)}`
                    )
                    this.accessToken = ''
                }

                await this.browser.func.checkpointActiveSession('LOGIN-CHECKPOINT')
                this.cookies.mobile = await initialContext.cookies()
                this.fingerprintMobile = mobileSession.fingerprint

                if (fullApi) {
                    await closeMobileSession()
                    this.logger.info(
                        'main',
                        'FLOW',
                        '移动端登录浏览器已关闭；继续使用已保存的会话和 HTTP 请求'
                    )
                }

                const data: DashboardData = await this.browser.func.getDashboardData()
                const profileCountry = normalizeCountry(data.dashboard.userProfile.attributes.country)

                if (account.geoLocale === 'auto') {
                    if (profileCountry) {
                        saveResolvedRegion(this.config.sessionPath, accountEmail, profileCountry)
                    } else {
                        this.logger.warn(
                            'main',
                            'GEO-LOCALE',
                            `Microsoft 个人资料返回了无效的国家/地区；保留 ${
                                this.accountLocale.country ?? 'US fallback'
                            }`
                        )
                    }
                }

                this.accountLocale = resolveAccountLocale(account, profileCountry ?? this.accountLocale.country)
                this.userData.langCode = this.accountLocale.language
                this.userData.geoLocale = this.accountLocale.country ?? 'US'
                this.http.setDefaultHeaders({
                    'Accept-Language': this.accountLocale.acceptLanguage
                })

                let appData: AppDashboardData | null = null

                if (this.accessToken) {
                    try {
                        appData = await this.browser.func.getAppDashboardData()
                    } catch (error) {
                        this.logger.warn(
                            'main',
                            'LOGIN-APP',
                            `App 仪表板不可用 - 本次运行将跳过 App 活动 | 信息=${error instanceof Error ? error.message : String(error)}`
                        )
                        this.accessToken = ''
                    }
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
                            `App 可赚积分查询失败 - 本次运行将跳过 App 活动 | 信息=${error instanceof Error ? error.message : String(error)}`
                        )
                        this.accessToken = ''
                        appData = null
                    }
                }

                const appAvailable = Boolean(this.accessToken && appData)

                this.logger.info(
                    'main',
                    'POINTS',
                    `今日可赚取 | 移动端: ${browserEarnable.mobileSearchPoints} | 浏览器: ${
                        browserEarnable.desktopSearchPoints
                    } | App: ${appEarnable?.totalEarnablePoints ?? 0} | ${accountEmail} | locale: ${this.accountLocale.locale}`
                )

                const parallel = this.config.searchSettings.parallelSearching
                const doBonus = this.config.workers.doBonusSearches
                const doVisualSearch = this.config.workers.doVisualSearch

                let mobilePoints = 0
                let desktopPoints = 0
                let bonusPoints = 0

                if (this.config.experimental.edgeBrowsing) {
                    edgeBrowsingTask = this.activities
                        .doEdgeBrowsing(edgeBrowsingController.signal)
                        .catch(error => {
                            this.logger.error(
                                this.isMobile,
                                'EDGE-BROWSING',
                                `意外的后台任务失败 | 信息=${
                                    error instanceof Error ? error.message : String(error)
                                }`
                            )
                        })
                        .finally(() => {
                            edgeBrowsingFinished = true
                        })
                }

                if (fullApi) {
                    if (this.config.ensureStreakProtection) {
                        await this.activities.doEnsureStreakProtection()
                    }
                    if (this.config.workers.doPunchCards) await this.activities.doPunchCardsMobile(data)
                    if (this.config.workers.doActivateSearchPerk) await this.activities.doActivateSearchPerk(data)

                    const plan = await this.searchManager.getSearchPoints()
                    const doMobileSearch = plan.doMobile
                    const doDesktopSearch = plan.doDesktop
                    const desktopBrowserNeeded = this.config.workers.doPunchCards || doVisualSearch

                    if (desktopBrowserNeeded) {
                        await executionContext.run({ isMobile: false, account }, async () => {
                            desktopSession = await this.createDesktopSession(account)
                            await this.activities.doPunchCardsDesktop()
                            if (doVisualSearch) await this.activities.doVisualSearch(data)
                        })
                        await closeDesktopSession()
                    }

                    if (this.config.workers.doDailySet) await this.activities.doDailySet(data)
                    if (this.config.workers.doMorePromotions) await this.activities.doMorePromotions(data)
                    if (appAvailable && this.config.workers.doDailyCheckIn) await this.activities.doDailyCheckIn()
                    if (appAvailable && this.config.workers.doAppPromotions && appData)
                        await this.activities.doAppPromotions(appData)
                    if (appAvailable && this.config.workers.doReadToEarn) await this.activities.doReadToEarn()

                    if (doMobileSearch) mobilePoints = await this.searchManager.searchMobile(account)
                    if (doBonus) bonusPoints = await this.searchManager.bonusMobile(account)
                    if (doDesktopSearch) desktopPoints = await this.searchManager.searchDesktop(account)
                } else {
                    if (this.config.ensureStreakProtection) {
                        await this.activities.doEnsureStreakProtection()
                    }
                    if (this.config.workers.doDailySet) await this.activities.doDailySet(data)
                    if (this.config.workers.doActivateSearchPerk) await this.activities.doActivateSearchPerk(data)
                    if (this.config.workers.doMorePromotions) await this.activities.doMorePromotions(data)
                    if (appAvailable && this.config.workers.doDailyCheckIn) await this.activities.doDailyCheckIn()
                    if (appAvailable && this.config.workers.doAppPromotions && appData)
                        await this.activities.doAppPromotions(appData)
                    if (appAvailable && this.config.workers.doReadToEarn) await this.activities.doReadToEarn()
                    if (this.config.workers.doPunchCards) await this.activities.doPunchCardsMobile(data)

                    const plan = await this.searchManager.getSearchPoints()
                    const doMobileSearch = plan.doMobile
                    const doDesktopSearch = plan.doDesktop

                    const desktopBrowserNeeded =
                        this.config.workers.doPunchCards || doVisualSearch || (doDesktopSearch && !apiSearch)

                    if (parallel && !apiSearch && doMobileSearch && doDesktopSearch) {
                        await executionContext.run({ isMobile: false, account }, async () => {
                            desktopSession = await this.createDesktopSession(account)
                            await this.activities.doPunchCardsDesktop()
                            if (doVisualSearch) await this.activities.doVisualSearch(data)
                        })

                        const mobileWork = async (): Promise<[number, number]> => {
                            try {
                                const searchPoints = await this.searchManager.searchMobile(account)
                                const extraPoints = doBonus ? await this.searchManager.bonusMobile(account) : 0
                                return [searchPoints, extraPoints]
                            } finally {
                                await closeMobileSession()
                            }
                        }
                        const desktopWork = async (): Promise<number> => {
                            try {
                                return await this.searchManager.searchDesktop(account)
                            } finally {
                                await closeDesktopSession()
                            }
                        }

                        ;[[mobilePoints, bonusPoints], desktopPoints] = await Promise.all([mobileWork(), desktopWork()])
                    } else {
                        if (apiSearch) await closeMobileSession()

                        if (doMobileSearch) mobilePoints = await this.searchManager.searchMobile(account)
                        if (doBonus) bonusPoints = await this.searchManager.bonusMobile(account)

                        if (!apiSearch) await closeMobileSession()

                        if (desktopBrowserNeeded) {
                            await executionContext.run({ isMobile: false, account }, async () => {
                                desktopSession = await this.createDesktopSession(account)

                                await this.activities.doPunchCardsDesktop()
                                if (doVisualSearch) await this.activities.doVisualSearch(data)
                                if (doDesktopSearch && !apiSearch) {
                                    desktopPoints = await this.searchManager.searchDesktop(account)
                                }
                            })
                            await closeDesktopSession()
                        }

                        if (doDesktopSearch && apiSearch) {
                            desktopPoints = await this.searchManager.searchDesktop(account)
                        }
                    }
                }

                this.logger.info(
                    'main',
                    'SEARCH-MANAGER',
                    `搜索汇总 | 移动端=${mobilePoints} | 桌面端=${desktopPoints} | 额外=${bonusPoints} | 总计=${
                        mobilePoints + desktopPoints + bonusPoints
                    }`
                )

                if (this.config.workers.doClaimBonusPoints) await this.activities.doClaimBonusPoints()

                if (edgeBrowsingTask) {
                    if (!edgeBrowsingFinished) {
                        this.logger.info(
                            this.isMobile,
                            'EDGE-BROWSING',
                            '前台活动已完成；正在等待后台 Edge 浏览活动'
                        )
                    }
                    await edgeBrowsingTask
                    edgeBrowsingTask = null
                }

                const finalPoints = await this.browser.func.getCurrentPoints()
                const collectedPoints = finalPoints - initialPoints

                this.logger.info(
                    'main',
                    'FLOW',
                    `积分已收集 | 获得积分=${collectedPoints} | 现余额=${finalPoints} | 账户=${accountEmail}`
                )

                return {
                    initialPoints,
                    collectedPoints: collectedPoints || 0
                }
            })
        } finally {
            if (edgeBrowsingTask) {
                edgeBrowsingController.abort()
                await edgeBrowsingTask
                edgeBrowsingTask = null
            }

            if (mobileSession) {
                try {
                    await closeMobileSession()
                } catch (error) {
                    this.logger.debug(
                        'main',
                        'CLEANUP',
                        `移动端上下文关闭失败 | ${error instanceof Error ? error.message : String(error)}`
                    )
                }
            }

            if (desktopSession) {
                try {
                    await closeDesktopSession()
                } catch (error) {
                    this.logger.debug(
                        'main',
                        'CLEANUP',
                        `桌面端上下文关闭失败 | ${error instanceof Error ? error.message : String(error)}`
                    )
                }
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
        rewardsBot.logger.warn('main', 'PROCESS', '收到 SIGINT 信号，正在刷新并退出...')
        await flushAllWebhooks()
        process.exit(130)
    })
    process.on('SIGTERM', async () => {
        rewardsBot.logger.warn('main', 'PROCESS', '收到 SIGTERM 信号，正在刷新并退出...')
        await flushAllWebhooks()
        process.exit(143)
    })
    process.on('uncaughtException', async error => {
        if (isBrowserClosedError(error)) {
            rewardsBot.logger.debug(
                'main',
                'UNCAUGHT-EXCEPTION',
                `忽略清理阶段良性的浏览器已关闭错误 | ${error instanceof Error ? error.message : String(error)}`
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
                `忽略清理阶段良性的浏览器已关闭拒绝 | ${reason instanceof Error ? reason.message : String(reason)}`
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
