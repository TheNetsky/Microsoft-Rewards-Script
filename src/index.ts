import cluster from 'cluster'
// Use Page type from playwright for typings; at runtime rebrowser-playwright extends playwright
import type { Page } from 'playwright'

import Browser from './browser/Browser'
import BrowserFunc from './browser/BrowserFunc'
import BrowserUtil from './browser/BrowserUtil'

import { log } from './util/Logger'
import Util from './util/Utils'
import { loadAccounts, loadConfig, saveSessionData } from './util/Load'

import { Login } from './functions/Login'
import { Workers } from './functions/Workers'
import Activities from './functions/Activities'

import { Account } from './interface/Account'
import Axios from './util/Axios'
import fs from 'fs'
import path from 'path'


// Main bot class
export class MicrosoftRewardsBot {
    public log: typeof log
    public config
    public utils: Util
    public activities: Activities = new Activities(this)
    public browser: {
        func: BrowserFunc,
        utils: BrowserUtil
    }
    public isMobile: boolean
    public homePage!: Page

    private pointsCanCollect: number = 0
    private pointsInitial: number = 0

    private activeWorkers: number
    private mobileRetryAttempts: number
    private browserFactory: Browser = new Browser(this)
    private accounts: Account[]
    private workers: Workers
    private login = new Login(this)
    private accessToken: string = ''

    // Summary collection (per process)
    private accountSummaries: AccountSummary[] = []

    //@ts-expect-error Will be initialized later
    public axios: Axios

    constructor(isMobile: boolean) {
        this.isMobile = isMobile
        this.log = log

        this.accounts = []
        this.utils = new Util()
        this.workers = new Workers(this)
        this.browser = {
            func: new BrowserFunc(this),
            utils: new BrowserUtil(this)
        }
        this.config = loadConfig()
        this.activeWorkers = this.config.clusters
        this.mobileRetryAttempts = 0
    }

    async initialize() {
        this.accounts = loadAccounts()
    }

    async run() {
        this.printBanner()
        log('main', 'MAIN', `Bot started with ${this.config.clusters} clusters`)

        // Only cluster when there's more than 1 cluster demanded
        if (this.config.clusters > 1) {
            if (cluster.isPrimary) {
                this.runMaster()
            } else {
                this.runWorker()
            }
        } else {
            await this.runTasks(this.accounts)
        }
    }

    private printBanner() {
        // Only print once (primary process or single cluster execution)
        if (this.config.clusters > 1 && !cluster.isPrimary) return
        try {
            const pkgPath = path.join(__dirname, '../', 'package.json')
            let version = 'unknown'
            if (fs.existsSync(pkgPath)) {
                const raw = fs.readFileSync(pkgPath, 'utf-8')
                const pkg = JSON.parse(raw)
                version = pkg.version || version
            }
            const banner = [
                '  __  __  _____       _____                            _     ',
                ' |  \/  |/ ____|     |  __ \\                          | |    ',
                ' | \  / | (___ ______| |__) |_____      ____ _ _ __ __| |___ ',
                ' | |\/| |\\___ \\______|  _  // _ \\ \\ /\\ / / _` | \'__/ _` / __|',
                ' | |  | |____) |     | | \\ \\  __/ \\ V  V / (_| | | | (_| \\__ \\',
                ' |_|  |_|_____/      |_|  \\_\\___| \\_/\\_/ \\__,_|_|  \\__,_|___/',
                '',
                ` Version: v${version}`,
                ''
            ].join('\n')
            console.log(banner)
        } catch { /* ignore banner errors */ }
    }

    // Return summaries (used when clusters==1)
    public getSummaries() {
        return this.accountSummaries
    }

    private runMaster() {
        log('main', 'MAIN-PRIMARY', 'Primary process started')

        const accountChunks = this.utils.chunkArray(this.accounts, this.config.clusters)

        for (let i = 0; i < accountChunks.length; i++) {
            const worker = cluster.fork()
            const chunk = accountChunks[i]
            ;(worker as any).send?.({ chunk })
            // Collect summaries from workers
            worker.on('message', (msg: any) => {
                if (msg && msg.type === 'summary' && Array.isArray(msg.data)) {
                    this.accountSummaries.push(...msg.data)
                }
            })
        }

    cluster.on('exit', (worker: any, code: number) => {
            this.activeWorkers -= 1

            log('main', 'MAIN-WORKER', `Worker ${worker.process.pid} destroyed | Code: ${code} | Active workers: ${this.activeWorkers}`, 'warn')

            // Check if all workers have exited
            if (this.activeWorkers === 0) {
                // All workers done -> send conclusion (if enabled) then exit
                this.sendConclusion(this.accountSummaries).finally(() => {
                    log('main', 'MAIN-WORKER', 'All workers destroyed. Exiting main process!', 'warn')
                    process.exit(0)
                })
            }
        })
    }

    private runWorker() {
        log('main', 'MAIN-WORKER', `Worker ${process.pid} spawned`)
        // Receive the chunk of accounts from the master
    ;(process as any).on('message', async ({ chunk }: { chunk: Account[] }) => {
            await this.runTasks(chunk)
        })
    }

    private async runTasks(accounts: Account[]) {
        for (const account of accounts) {
            log('main', 'MAIN-WORKER', `Started tasks for account ${account.email}`)

            const accountStart = Date.now()
            let desktopInitial = 0
            let mobileInitial = 0
            let desktopCollected = 0
            let mobileCollected = 0
            const errors: string[] = []

            this.axios = new Axios(account.proxy)
            const verbose = process.env.DEBUG_REWARDS_VERBOSE === '1'
            const formatFullErr = (label: string, e: any) => {
                const base = shortErr(e)
                if (verbose && e instanceof Error) {
                    return `${label}:${base} :: ${e.stack?.split('\n').slice(0,4).join(' | ')}`
                }
                return `${label}:${base}`
            }

            if (this.config.parallel) {
                const mobileInstance = new MicrosoftRewardsBot(true)
                mobileInstance.axios = this.axios
                // Run both and capture results with detailed logging
                const desktopPromise = this.Desktop(account).catch(e => {
                    log(false, 'TASK', `Desktop flow failed early for ${account.email}: ${e instanceof Error ? e.message : e}`,'error')
                    errors.push(formatFullErr('desktop', e)); return null
                })
                const mobilePromise = mobileInstance.Mobile(account).catch(e => {
                    log(true, 'TASK', `Mobile flow failed early for ${account.email}: ${e instanceof Error ? e.message : e}`,'error')
                    errors.push(formatFullErr('mobile', e)); return null
                })
                const [desktopResult, mobileResult] = await Promise.all([desktopPromise, mobilePromise])
                if (desktopResult) {
                    desktopInitial = desktopResult.initialPoints
                    desktopCollected = desktopResult.collectedPoints
                }
                if (mobileResult) {
                    mobileInitial = mobileResult.initialPoints
                    mobileCollected = mobileResult.collectedPoints
                }
            } else {
                this.isMobile = false
                const desktopResult = await this.Desktop(account).catch(e => {
                    log(false, 'TASK', `Desktop flow failed early for ${account.email}: ${e instanceof Error ? e.message : e}`,'error')
                    errors.push(formatFullErr('desktop', e)); return null
                })
                if (desktopResult) {
                    desktopInitial = desktopResult.initialPoints
                    desktopCollected = desktopResult.collectedPoints
                }

                this.isMobile = true
                const mobileResult = await this.Mobile(account).catch(e => {
                    log(true, 'TASK', `Mobile flow failed early for ${account.email}: ${e instanceof Error ? e.message : e}`,'error')
                    errors.push(formatFullErr('mobile', e)); return null
                })
                if (mobileResult) {
                    mobileInitial = mobileResult.initialPoints
                    mobileCollected = mobileResult.collectedPoints
                }
            }

            const accountEnd = Date.now()
            const durationMs = accountEnd - accountStart
            const totalCollected = desktopCollected + mobileCollected
            const initialTotal = (desktopInitial || 0) + (mobileInitial || 0)
            this.accountSummaries.push({
                email: account.email,
                durationMs,
                desktopCollected,
                mobileCollected,
                totalCollected,
                initialTotal,
                endTotal: initialTotal + totalCollected,
                errors
            })

            log('main', 'MAIN-WORKER', `Completed tasks for account ${account.email}`, 'log', 'green')
        }

        log(this.isMobile, 'MAIN-PRIMARY', 'Completed tasks for ALL accounts', 'log', 'green')
        // Extra diagnostic summary when verbose
        if (process.env.DEBUG_REWARDS_VERBOSE === '1') {
            for (const summary of this.accountSummaries) {
                log('main','SUMMARY-DEBUG',`Account ${summary.email} collected D:${summary.desktopCollected} M:${summary.mobileCollected} TOTAL:${summary.totalCollected} ERRORS:${summary.errors.length ? summary.errors.join(';') : 'none'}`)
            }
        }
        // If in worker mode (clusters>1) send summaries to primary
        if (this.config.clusters > 1 && !cluster.isPrimary) {
            if (process.send) {
                process.send({ type: 'summary', data: this.accountSummaries })
            }
        } else {
            // Single process mode -> build and send conclusion directly
            await this.sendConclusion(this.accountSummaries)
        }
        process.exit()
    }

    // Desktop
    async Desktop(account: Account) {
        log(false,'FLOW','Desktop() invoked')
        const browser = await this.browserFactory.createBrowser(account.proxy, account.email)
        this.homePage = await browser.newPage()

        log(this.isMobile, 'MAIN', 'Starting browser')

        // Login into MS Rewards, then go to rewards homepage
        await this.login.login(this.homePage, account.email, account.password)

        await this.browser.func.goHome(this.homePage)

        const data = await this.browser.func.getDashboardData()

    this.pointsInitial = data.userStatus.availablePoints
    const initial = this.pointsInitial

        log(this.isMobile, 'MAIN-POINTS', `Current point count: ${this.pointsInitial}`)

        const browserEnarablePoints = await this.browser.func.getBrowserEarnablePoints()

        // Tally all the desktop points
        this.pointsCanCollect = browserEnarablePoints.dailySetPoints +
            browserEnarablePoints.desktopSearchPoints
            + browserEnarablePoints.morePromotionsPoints

        log(this.isMobile, 'MAIN-POINTS', `You can earn ${this.pointsCanCollect} points today`)

        // If runOnZeroPoints is false and 0 points to earn, don't continue
        if (!this.config.runOnZeroPoints && this.pointsCanCollect === 0) {
            log(this.isMobile, 'MAIN', 'No points to earn and "runOnZeroPoints" is set to "false", stopping!', 'log', 'yellow')

            // Close desktop browser
            await this.browser.func.closeBrowser(browser, account.email)
            return
        }

        // Open a new tab to where the tasks are going to be completed
        const workerPage = await browser.newPage()

        // Go to homepage on worker page
        await this.browser.func.goHome(workerPage)

        // Complete daily set
        if (this.config.workers.doDailySet) {
            await this.workers.doDailySet(workerPage, data)
        }

        // Complete more promotions
        if (this.config.workers.doMorePromotions) {
            await this.workers.doMorePromotions(workerPage, data)
        }

        // Complete punch cards
        if (this.config.workers.doPunchCards) {
            await this.workers.doPunchCard(workerPage, data)
        }

        // Do desktop searches
        if (this.config.workers.doDesktopSearch) {
            await this.activities.doSearch(workerPage, data)
        }

        // Save cookies
        await saveSessionData(this.config.sessionPath, browser, account.email, this.isMobile)

        // Fetch points BEFORE closing (avoid page closed reload error)
        const after = await this.browser.func.getCurrentPoints().catch(()=>initial)
        // Close desktop browser
        await this.browser.func.closeBrowser(browser, account.email)
        return {
            initialPoints: initial,
            collectedPoints: (after - initial) || 0
        }
    }

    // Mobile
    async Mobile(account: Account) {
        log(true,'FLOW','Mobile() invoked')
        const browser = await this.browserFactory.createBrowser(account.proxy, account.email)
        this.homePage = await browser.newPage()

        log(this.isMobile, 'MAIN', 'Starting browser')

        // Login into MS Rewards, then go to rewards homepage
        await this.login.login(this.homePage, account.email, account.password)
        this.accessToken = await this.login.getMobileAccessToken(this.homePage, account.email)

        await this.browser.func.goHome(this.homePage)

    const data = await this.browser.func.getDashboardData()
    const initialPoints = data.userStatus.availablePoints || this.pointsInitial || 0

        const browserEnarablePoints = await this.browser.func.getBrowserEarnablePoints()
        const appEarnablePoints = await this.browser.func.getAppEarnablePoints(this.accessToken)

        this.pointsCanCollect = browserEnarablePoints.mobileSearchPoints + appEarnablePoints.totalEarnablePoints

        log(this.isMobile, 'MAIN-POINTS', `You can earn ${this.pointsCanCollect} points today (Browser: ${browserEnarablePoints.mobileSearchPoints} points, App: ${appEarnablePoints.totalEarnablePoints} points)`)

        // If runOnZeroPoints is false and 0 points to earn, don't continue
        if (!this.config.runOnZeroPoints && this.pointsCanCollect === 0) {
            log(this.isMobile, 'MAIN', 'No points to earn and "runOnZeroPoints" is set to "false", stopping!', 'log', 'yellow')

            // Close mobile browser
            await this.browser.func.closeBrowser(browser, account.email)
            return {
                initialPoints: initialPoints,
                collectedPoints: 0
            }
        }
        // Do daily check in
        if (this.config.workers.doDailyCheckIn) {
            await this.activities.doDailyCheckIn(this.accessToken, data)
        }

        // Do read to earn
        if (this.config.workers.doReadToEarn) {
            await this.activities.doReadToEarn(this.accessToken, data)
        }

        // Do mobile searches
        if (this.config.workers.doMobileSearch) {
            // If no mobile searches data found, stop (Does not always exist on new accounts)
            if (data.userStatus.counters.mobileSearch) {
                // Open a new tab to where the tasks are going to be completed
                const workerPage = await browser.newPage()

                // Go to homepage on worker page
                await this.browser.func.goHome(workerPage)

                await this.activities.doSearch(workerPage, data)

                // Fetch current search points
                const mobileSearchPoints = (await this.browser.func.getSearchPoints()).mobileSearch?.[0]

                if (mobileSearchPoints && (mobileSearchPoints.pointProgressMax - mobileSearchPoints.pointProgress) > 0) {
                    // Increment retry count
                    this.mobileRetryAttempts++
                }

                // Exit if retries are exhausted
                if (this.mobileRetryAttempts > this.config.searchSettings.retryMobileSearchAmount) {
                    log(this.isMobile, 'MAIN', `Max retry limit of ${this.config.searchSettings.retryMobileSearchAmount} reached. Exiting retry loop`, 'warn')
                } else if (this.mobileRetryAttempts !== 0) {
                    log(this.isMobile, 'MAIN', `Attempt ${this.mobileRetryAttempts}/${this.config.searchSettings.retryMobileSearchAmount}: Unable to complete mobile searches, bad User-Agent? Increase search delay? Retrying...`, 'log', 'yellow')

                    // Close mobile browser
                    await this.browser.func.closeBrowser(browser, account.email)

                    // Create a new browser and try
                    await this.Mobile(account)
                    return
                }
            } else {
                log(this.isMobile, 'MAIN', 'Unable to fetch search points, your account is most likely too "new" for this! Try again later!', 'warn')
            }
        }

        const afterPointAmount = await this.browser.func.getCurrentPoints()

        log(this.isMobile, 'MAIN-POINTS', `The script collected ${afterPointAmount - initialPoints} points today`)

        // Close mobile browser
        await this.browser.func.closeBrowser(browser, account.email)
        return {
            initialPoints: initialPoints,
            collectedPoints: (afterPointAmount - initialPoints) || 0
        }
    }

    private async sendConclusion(summaries: AccountSummary[]) {
        const { ConclusionWebhook } = await import('./util/ConclusionWebhook')
        const cfg = this.config
        if (!cfg.conclusionWebhook || !cfg.conclusionWebhook.enabled) return

        const totalAccounts = summaries.length
        if (totalAccounts === 0) return

        let totalCollected = 0
        let totalInitial = 0
        let totalEnd = 0
        let totalDuration = 0
        let accountsWithErrors = 0

        const accountFields: any[] = []
        for (const s of summaries) {
            totalCollected += s.totalCollected
            totalInitial += s.initialTotal
            totalEnd += s.endTotal
            totalDuration += s.durationMs
            if (s.errors.length) accountsWithErrors++

            const statusEmoji = s.errors.length ? '⚠️' : '✅'
            const diff = s.totalCollected
            const duration = formatDuration(s.durationMs)
            const valueLines: string[] = [
                `Points: ${s.initialTotal} → ${s.endTotal} ( +${diff} )`,
                `Breakdown: 🖥️ ${s.desktopCollected} | 📱 ${s.mobileCollected}`,
                `Duration: ⏱️ ${duration}`
            ]
            if (s.errors.length) {
                valueLines.push(`Errors: ${s.errors.slice(0,2).join(' | ')}`)
            }
            accountFields.push({
                name: `${statusEmoji} ${s.email}`.substring(0, 256),
                value: valueLines.join('\n').substring(0, 1024),
                inline: false
            })
        }

        const avgDuration = totalDuration / totalAccounts
        const embed = {
            title: '🎯 Microsoft Rewards Summary',
            description: `Processed **${totalAccounts}** account(s)${accountsWithErrors ? ` • ${accountsWithErrors} with issues` : ''}`,
            color: accountsWithErrors ? 0xFFAA00 : 0x32CD32,
            fields: [
                {
                    name: 'Global Totals',
                    value: [
                        `Total Points: ${totalInitial} → ${totalEnd} ( +${totalCollected} )`,
                        `Average Duration: ${formatDuration(avgDuration)}`,
                        `Cumulative Runtime: ${formatDuration(totalDuration)}`
                    ].join('\n')
                },
                ...accountFields
            ].slice(0, 25), // Discord max 25 fields
            timestamp: new Date().toISOString(),
            footer: {
                text: 'Script conclusion webhook'
            }
        }

        // Fallback plain text (rare) & embed send
        const fallback = `Microsoft Rewards Summary\nAccounts: ${totalAccounts}\nTotal: ${totalInitial} -> ${totalEnd} (+${totalCollected})\nRuntime: ${formatDuration(totalDuration)}`
        await ConclusionWebhook(cfg, fallback, { embeds: [embed] })
    }
}

interface AccountSummary {
    email: string
    durationMs: number
    desktopCollected: number
    mobileCollected: number
    totalCollected: number
    initialTotal: number
    endTotal: number
    errors: string[]
}

function shortErr(e: any): string {
    if (!e) return 'unknown'
    if (e instanceof Error) return e.message.substring(0, 120)
    const s = String(e)
    return s.substring(0, 120)
}

function formatDuration(ms: number): string {
    if (!ms || ms < 1000) return `${ms}ms`
    const sec = Math.floor(ms / 1000)
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    const parts: string[] = []
    if (h) parts.push(`${h}h`)
    if (m) parts.push(`${m}m`)
    if (s) parts.push(`${s}s`)
    return parts.join(' ') || `${ms}ms`
}

async function main() {
    const rewardsBot = new MicrosoftRewardsBot(false)

    try {
        await rewardsBot.initialize()
        await rewardsBot.run()
    } catch (error) {
        log(false, 'MAIN-ERROR', `Error running desktop bot: ${error}`, 'error')
    }
}

// Start the bots
main().catch(error => {
    log('main', 'MAIN-ERROR', `Error running bots: ${error}`, 'error')
    process.exit(1)
})