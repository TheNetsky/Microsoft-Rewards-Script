import cluster from 'cluster'
import type { Worker } from 'cluster'
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
import { spawn } from 'child_process'
import Humanizer from './util/Humanizer'


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
    public humanizer: Humanizer
    public isMobile: boolean
    public homePage!: Page
    public currentAccountEmail?: string

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
    private runId: string = Math.random().toString(36).slice(2)
    private diagCount: number = 0

    //@ts-expect-error Will be initialized later
    public axios: Axios

    constructor(isMobile: boolean) {
        this.isMobile = isMobile
        this.log = log

        this.accounts = []
        this.utils = new Util()
        this.config = loadConfig()
        this.browser = {
            func: new BrowserFunc(this),
            utils: new BrowserUtil(this)
        }
        this.workers = new Workers(this)
        this.humanizer = new Humanizer(this.utils, this.config.humanization)
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
        
        const banner = `
 ███╗   ███╗███████╗    ██████╗ ███████╗██╗    ██╗ █████╗ ██████╗ ██████╗ ███████╗
 ████╗ ████║██╔════╝    ██╔══██╗██╔════╝██║    ██║██╔══██╗██╔══██╗██╔══██╗██╔════╝
 ██╔████╔██║███████╗    ██████╔╝█████╗  ██║ █╗ ██║███████║██████╔╝██║  ██║███████╗
 ██║╚██╔╝██║╚════██║    ██╔══██╗██╔══╝  ██║███╗██║██╔══██║██╔══██╗██║  ██║╚════██║
 ██║ ╚═╝ ██║███████║    ██║  ██║███████╗╚███╔███╔╝██║  ██║██║  ██║██████╔╝███████║
 ╚═╝     ╚═╝╚══════╝    ╚═╝  ╚═╝╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚══════╝
                                                                                   
                      TypeScript • Playwright • Automated Point Collection        
`
        
        try {
            const pkgPath = path.join(__dirname, '../', 'package.json')
            let version = 'unknown'
            if (fs.existsSync(pkgPath)) {
                const raw = fs.readFileSync(pkgPath, 'utf-8')
                const pkg = JSON.parse(raw)
                version = pkg.version || version
            }
            
            console.log(banner)
            console.log('='.repeat(80))
            console.log(`  Version: ${version} | Process: ${process.pid} | Clusters: ${this.config.clusters}`)
            console.log(`  Mode: ${this.config.headless ? 'Headless' : 'Visible'} | Parallel: ${this.config.parallel ? 'Yes' : 'No'}`)
            console.log('='.repeat(80) + '\n')
        } catch { 
            console.log(banner)
            console.log('='.repeat(50))
            console.log('  Microsoft Rewards Script Started')
            console.log('='.repeat(50) + '\n')
        }
    }    // Return summaries (used when clusters==1)
    public getSummaries() {
        return this.accountSummaries
    }

    private runMaster() {
        log('main', 'MAIN-PRIMARY', 'Primary process started')

        const accountChunks = this.utils.chunkArray(this.accounts, this.config.clusters)

        for (let i = 0; i < accountChunks.length; i++) {
            const worker = cluster.fork()
            const chunk = accountChunks[i]
            const msg = { chunk: chunk as Account[] }
            ;(worker as unknown as { send?: (m: { chunk: Account[] }) => void }).send?.(msg)
            // Collect summaries from workers
            worker.on('message', (msg: unknown) => {
                const m = msg as { type?: string; data?: AccountSummary[] }
                if (m && m.type === 'summary' && Array.isArray(m.data)) {
                    this.accountSummaries.push(...m.data)
                }
            })
        }

    cluster.on('exit', (worker: Worker, code: number) => {
            this.activeWorkers -= 1

            log('main', 'MAIN-WORKER', `Worker ${worker.process.pid} destroyed | Code: ${code} | Active workers: ${this.activeWorkers}`, 'warn')

            // Check if all workers have exited
            if (this.activeWorkers === 0) {
                // All workers done -> send conclusion (if enabled), run optional auto-update, then exit
                (async () => {
                    try {
                        await this.sendConclusion(this.accountSummaries)
                    } catch {/* ignore */}
                    try {
                        await this.runAutoUpdate()
                    } catch {/* ignore */}
                    log('main', 'MAIN-WORKER', 'All workers destroyed. Exiting main process!', 'warn')
                    process.exit(0)
                })()
            }
        })
    }

    private runWorker() {
        log('main', 'MAIN-WORKER', `Worker ${process.pid} spawned`)
        // Receive the chunk of accounts from the master
    ;(process as unknown as { on: (ev: 'message', cb: (m: { chunk: Account[] }) => void) => void }).on('message', async ({ chunk }: { chunk: Account[] }) => {
            await this.runTasks(chunk)
        })
    }

    private async runTasks(accounts: Account[]) {
        for (const account of accounts) {
            // If humanization allowed windows are configured, wait until within a window
            try {
                const windows: string[] | undefined = this.config?.humanization?.allowedWindows
                if (Array.isArray(windows) && windows.length > 0) {
                    const waitMs = this.computeWaitForAllowedWindow(windows)
                    if (waitMs > 0) {
                        log('main','HUMANIZATION',`Waiting ${Math.ceil(waitMs/1000)}s until next allowed window before starting ${account.email}`,'warn')
                        await new Promise<void>(r => setTimeout(r, waitMs))
                    }
                }
            } catch {/* ignore */}
            this.currentAccountEmail = account.email
            log('main', 'MAIN-WORKER', `Started tasks for account ${account.email}`)

            const accountStart = Date.now()
            let desktopInitial = 0
            let mobileInitial = 0
            let desktopCollected = 0
            let mobileCollected = 0
            const errors: string[] = []
            const banned = { status: false, reason: '' }

            this.axios = new Axios(account.proxy)
            const verbose = process.env.DEBUG_REWARDS_VERBOSE === '1'
            const formatFullErr = (label: string, e: unknown) => {
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
                    const msg = e instanceof Error ? e.message : String(e)
                    log(false, 'TASK', `Desktop flow failed early for ${account.email}: ${msg}`,'error')
                    if (/suspend|locked|serviceabuse/i.test(msg)) {
                        banned.status = true
                        banned.reason = msg.substring(0, 200)
                    }
                    errors.push(formatFullErr('desktop', e)); return null
                })
                const mobilePromise = mobileInstance.Mobile(account).catch(e => {
                    const msg = e instanceof Error ? e.message : String(e)
                    log(true, 'TASK', `Mobile flow failed early for ${account.email}: ${msg}`,'error')
                    if (/suspend|locked|serviceabuse/i.test(msg)) {
                        banned.status = true
                        banned.reason = msg.substring(0, 200)
                    }
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
                    const msg = e instanceof Error ? e.message : String(e)
                    log(false, 'TASK', `Desktop flow failed early for ${account.email}: ${msg}`,'error')
                    if (/suspend|locked|serviceabuse/i.test(msg)) {
                        banned.status = true
                        banned.reason = msg.substring(0, 200)
                    }
                    errors.push(formatFullErr('desktop', e)); return null
                })
                if (desktopResult) {
                    desktopInitial = desktopResult.initialPoints
                    desktopCollected = desktopResult.collectedPoints
                }

                // If banned detected, skip mobile to save time
                if (!banned.status) {
                    this.isMobile = true
                    const mobileResult = await this.Mobile(account).catch(e => {
                        const msg = e instanceof Error ? e.message : String(e)
                        log(true, 'TASK', `Mobile flow failed early for ${account.email}: ${msg}`,'error')
                        if (/suspend|locked|serviceabuse/i.test(msg)) {
                            banned.status = true
                            banned.reason = msg.substring(0, 200)
                        }
                        errors.push(formatFullErr('mobile', e)); return null
                    })
                    if (mobileResult) {
                        mobileInitial = mobileResult.initialPoints
                        mobileCollected = mobileResult.collectedPoints
                    }
                } else {
                    log(true, 'TASK', `Skipping mobile flow for ${account.email} due to banned status`, 'warn')
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
                errors,
                banned
            })

            await log('main', 'MAIN-WORKER', `Completed tasks for account ${account.email}`, 'log', 'green')
        }

        await log(this.isMobile, 'MAIN-PRIMARY', 'Completed tasks for ALL accounts', 'log', 'green')
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
            // After conclusion, run optional auto-update
            await this.runAutoUpdate().catch(() => {/* ignore update errors */})
        }
        process.exit()
    }

    /** Compute milliseconds to wait until within one of the allowed windows (HH:mm-HH:mm). Returns 0 if already inside. */
    private computeWaitForAllowedWindow(windows: string[]): number {
        const now = new Date()
        const minsNow = now.getHours() * 60 + now.getMinutes()
        let nextStartMins: number | null = null
        for (const w of windows) {
            const [start, end] = w.split('-')
            if (!start || !end) continue
            const pStart = start.split(':').map(v=>parseInt(v,10))
            const pEnd = end.split(':').map(v=>parseInt(v,10))
            if (pStart.length !== 2 || pEnd.length !== 2) continue
            const sh = pStart[0]!, sm = pStart[1]!
            const eh = pEnd[0]!, em = pEnd[1]!
            if ([sh,sm,eh,em].some(n=>Number.isNaN(n))) continue
            const s = sh*60 + sm
            const e = eh*60 + em
            if (s <= e) {
                // same-day window
                if (minsNow >= s && minsNow <= e) return 0
                if (minsNow < s) nextStartMins = Math.min(nextStartMins ?? s, s)
            } else {
                // wraps past midnight (e.g., 22:00-02:00)
                if (minsNow >= s || minsNow <= e) return 0
                // next start today is s
                nextStartMins = Math.min(nextStartMins ?? s, s)
            }
        }
        const msPerMin = 60*1000
        if (nextStartMins != null) {
            const targetTodayMs = (nextStartMins - minsNow) * msPerMin
            return targetTodayMs > 0 ? targetTodayMs : (24*60 + nextStartMins - minsNow) * msPerMin
        }
        // No valid windows parsed -> do not block
        return 0
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

        const conclusionWebhookEnabled = !!(cfg.conclusionWebhook && cfg.conclusionWebhook.enabled)
        const ntfyEnabled = !!(cfg.ntfy && cfg.ntfy.enabled)
        if (!conclusionWebhookEnabled && !ntfyEnabled) return

        const totalAccounts = summaries.length
        if (totalAccounts === 0) return

        let totalCollected = 0
        let totalInitial = 0
        let totalEnd = 0
        let totalDuration = 0
        let accountsWithErrors = 0
        let successes = 0

        type DiscordField = { name: string; value: string; inline?: boolean }
        type DiscordFooter = { text: string }
        type DiscordEmbed = {
            title?: string
            description?: string
            color?: number
            fields?: DiscordField[]
            timestamp?: string
            footer?: DiscordFooter
        }

        const accountFields: DiscordField[] = []
        const accountLines: string[] = []

        for (const s of summaries) {
            totalCollected += s.totalCollected
            totalInitial += s.initialTotal
            totalEnd += s.endTotal
            totalDuration += s.durationMs
            if (s.errors.length) accountsWithErrors++
            else successes++

            const statusEmoji = s.banned?.status ? '🚫' : (s.errors.length ? '⚠️' : '✅')
            const diff = s.totalCollected
            const duration = formatDuration(s.durationMs)

            // Build embed fields (Discord)
            const valueLines: string[] = [
                `Points: ${s.initialTotal} → ${s.endTotal} ( +${diff} )`,
                `Breakdown: 🖥️ ${s.desktopCollected} | 📱 ${s.mobileCollected}`,
                `Duration: ⏱️ ${duration}`
            ]
            if (s.banned?.status) {
                valueLines.push(`Banned: ${s.banned.reason || 'detected by heuristics'}`)
            }
            if (s.errors.length) {
                valueLines.push(`Errors: ${s.errors.slice(0, 2).join(' | ')}`)
            }
            accountFields.push({
                name: `${statusEmoji} ${s.email}`.substring(0, 256),
                value: valueLines.join('\n').substring(0, 1024),
                inline: false
            })

            // Build plain text lines (NTFY)
            const lines = [
                `${statusEmoji} ${s.email}`,
                `  Points: ${s.initialTotal} → ${s.endTotal} ( +${diff} )`,
                `  🖥️ ${s.desktopCollected} | 📱 ${s.mobileCollected}`,
                `  Duration: ${duration}`
            ]
            if (s.banned?.status) lines.push(`  Banned: ${s.banned.reason || 'detected by heuristics'}`)
            if (s.errors.length) lines.push(`  Errors: ${s.errors.slice(0, 2).join(' | ')}`)
            accountLines.push(lines.join('\n') + '\n')
        }

        const avgDuration = totalDuration / totalAccounts

        // Read package version (best-effort)
        let version = 'unknown'
        try {
            const pkgPath = path.join(process.cwd(), 'package.json')
            if (fs.existsSync(pkgPath)) {
                const raw = fs.readFileSync(pkgPath, 'utf-8')
                const pkg = JSON.parse(raw)
                version = pkg.version || version
            }
        } catch { /* ignore */ }

        // Discord/Webhook embeds with chunking (limits: 10 embeds/message, 25 fields/embed)
        const MAX_EMBEDS = 10
        const MAX_FIELDS = 25

        const baseFields = [
            {
                name: 'Global Totals',
                value: [
                    `Total Points: ${totalInitial} → ${totalEnd} ( +${totalCollected} )`,
                    `Accounts: ✅ ${successes} • ⚠️ ${accountsWithErrors} (of ${totalAccounts})`,
                    `Average Duration: ${formatDuration(avgDuration)}`,
                    `Cumulative Runtime: ${formatDuration(totalDuration)}`
                ].join('\n')
            }
        ]

        // Prepare embeds: first embed for totals, subsequent for accounts
        const embeds: DiscordEmbed[] = []
        const headerEmbed: DiscordEmbed = {
            title: '🎯 Microsoft Rewards Summary',
            description: `Processed **${totalAccounts}** account(s)${accountsWithErrors ? ` • ${accountsWithErrors} with issues` : ''}`,
            color: accountsWithErrors ? 0xFFAA00 : 0x32CD32,
            fields: baseFields,
            timestamp: new Date().toISOString(),
            footer: { text: `Run ${this.runId}${version !== 'unknown' ? ` • v${version}` : ''}` }
        }
        embeds.push(headerEmbed)

        // Chunk account fields across remaining embeds
        const fieldsPerEmbed = Math.min(MAX_FIELDS, 25)
        const availableEmbeds = MAX_EMBEDS - embeds.length
        const chunks: DiscordField[][] = []
        for (let i = 0; i < accountFields.length; i += fieldsPerEmbed) {
            chunks.push(accountFields.slice(i, i + fieldsPerEmbed))
        }

        const includedChunks = chunks.slice(0, availableEmbeds)
        for (const [idx, chunk] of includedChunks.entries()) {
            const chunkEmbed: DiscordEmbed = {
                title: `Accounts ${idx * fieldsPerEmbed + 1}–${Math.min((idx + 1) * fieldsPerEmbed, accountFields.length)}`,
                color: accountsWithErrors ? 0xFFAA00 : 0x32CD32,
                fields: chunk,
                timestamp: new Date().toISOString()
            }
            embeds.push(chunkEmbed)
        }

        const omitted = chunks.length - includedChunks.length
        if (omitted > 0 && embeds.length > 0) {
            // Add a small note to the last embed about omitted accounts
            const last = embeds[embeds.length - 1]!
            const noteField: DiscordField = { name: 'Note', value: `And ${omitted * fieldsPerEmbed} more account entries not shown due to Discord limits.`, inline: false }
            if (last.fields && Array.isArray(last.fields)) {
                last.fields = [...last.fields, noteField].slice(0, MAX_FIELDS)
            }
        }

        // NTFY-compatible plain text (includes per-account breakdown)
        const fallback = [
            'Microsoft Rewards Summary',
            `Accounts: ${totalAccounts}${accountsWithErrors ? ` • ${accountsWithErrors} with issues` : ''}`,
            `Total: ${totalInitial} -> ${totalEnd} (+${totalCollected})`,
            `Average Duration: ${formatDuration(avgDuration)}`,
            `Cumulative Runtime: ${formatDuration(totalDuration)}`,
            '',
            ...accountLines
        ].join('\n')

    // Send both: Discord gets embeds, NTFY gets fallback
    await ConclusionWebhook(cfg, fallback, { embeds })

        // Write local JSON report for observability
        try {
            const fs = await import('fs')
            const path = await import('path')
            const now = new Date()
            const day = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
            const baseDir = path.join(process.cwd(), 'reports', day)
            if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true })
            const file = path.join(baseDir, `summary_${this.runId}.json`)
            const payload = {
                runId: this.runId,
                timestamp: now.toISOString(),
                totals: { totalCollected, totalInitial, totalEnd, totalDuration, totalAccounts, accountsWithErrors },
                perAccount: summaries
            }
            fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf-8')
            log('main','REPORT',`Saved report to ${file}`)
        } catch (e) {
            log('main','REPORT',`Failed to save report: ${e instanceof Error ? e.message : e}`,'warn')
        }

        // Optionally cleanup old diagnostics folders
        try {
            const days = cfg.diagnostics?.retentionDays
            if (typeof days === 'number' && days > 0) {
                await this.cleanupOldDiagnostics(days)
            }
        } catch (e) {
            log('main','REPORT',`Failed diagnostics cleanup: ${e instanceof Error ? e.message : e}`,'warn')
        }
    }

    /** Reserve one diagnostics slot for this run (caps captures). */
    public tryReserveDiagSlot(maxPerRun: number): boolean {
        if (this.diagCount >= Math.max(0, maxPerRun || 0)) return false
        this.diagCount += 1
        return true
    }

    /** Delete diagnostics folders older than N days under ./reports */
    private async cleanupOldDiagnostics(retentionDays: number) {
        const base = path.join(process.cwd(), 'reports')
        if (!fs.existsSync(base)) return
        const entries = fs.readdirSync(base, { withFileTypes: true })
        const now = Date.now()
        const keepMs = retentionDays * 24 * 60 * 60 * 1000
        for (const e of entries) {
            if (!e.isDirectory()) continue
            const name = e.name // expect YYYY-MM-DD
            const parts = name.split('-').map((n: string) => parseInt(n, 10))
            if (parts.length !== 3 || parts.some(isNaN)) continue
            const [yy, mm, dd] = parts
            if (yy === undefined || mm === undefined || dd === undefined) continue
            const dirDate = new Date(yy, mm - 1, dd).getTime()
            if (isNaN(dirDate)) continue
            if (now - dirDate > keepMs) {
                const dirPath = path.join(base, name)
                try { fs.rmSync(dirPath, { recursive: true, force: true }) } catch { /* ignore */ }
            }
        }
    }

    // Run optional auto-update script based on configuration flags.
    private async runAutoUpdate(): Promise<void> {
        const upd = this.config.update
        if (!upd) return
        const scriptRel = upd.scriptPath || 'setup/update/update.mjs'
        const scriptAbs = path.join(process.cwd(), scriptRel)
        if (!fs.existsSync(scriptAbs)) return

        const args: string[] = []
        // Git update is enabled by default (unless explicitly set to false)
        if (upd.git !== false) args.push('--git')
        if (upd.docker) args.push('--docker')
        if (args.length === 0) return

        await new Promise<void>((resolve) => {
            const child = spawn(process.execPath, [scriptAbs, ...args], { stdio: 'inherit' })
            child.on('close', () => resolve())
            child.on('error', () => resolve())
        })
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
    banned?: { status: boolean; reason: string }
}

function shortErr(e: unknown): string {
    if (e == null) return 'unknown'
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