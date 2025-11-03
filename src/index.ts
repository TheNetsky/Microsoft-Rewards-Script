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
import { DISCORD } from './constants'

import { Login } from './functions/Login'
import { Workers } from './functions/Workers'
import Activities from './functions/Activities'

import { Account } from './interface/Account'
import Axios from './util/Axios'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import Humanizer from './util/Humanizer'
import { detectBanReason } from './util/BanDetector'


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
    public currentAccountRecoveryEmail?: string
    public compromisedModeActive: boolean = false
    public compromisedReason?: string
    public compromisedEmail?: string
    // Mutex-like flag to prevent parallel execution when config.parallel is accidentally misconfigured
    private isDesktopRunning: boolean = false
    private isMobileRunning: boolean = false

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
    private bannedTriggered: { email: string; reason: string } | null = null
    private globalStandby: { active: boolean; reason?: string } = { active: false }

    public axios!: Axios

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
 ╔═══════════════════════════════════════════════════════════════════════════╗
 ║                                                                           ║
 ║  ███╗   ███╗███████╗    ██████╗ ███████╗██╗    ██╗ █████╗ ██████╗ ██████╗ ███████╗  ║
 ║  ████╗ ████║██╔════╝    ██╔══██╗██╔════╝██║    ██║██╔══██╗██╔══██╗██╔══██╗██╔════╝  ║
 ║  ██╔████╔██║███████╗    ██████╔╝█████╗  ██║ █╗ ██║███████║██████╔╝██║  ██║███████╗  ║
 ║  ██║╚██╔╝██║╚════██║    ██╔══██╗██╔══╝  ██║███╗██║██╔══██║██╔══██╗██║  ██║╚════██║  ║
 ║  ██║ ╚═╝ ██║███████║    ██║  ██║███████╗╚███╔███╔╝██║  ██║██║  ██║██████╔╝███████║  ║
 ║  ╚═╝     ╚═╝╚══════╝    ╚═╝  ╚═╝╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚══════╝  ║
 ║                                                                           ║
 ║          TypeScript • Playwright • Intelligent Automation                ║
 ║                                                                           ║
 ╚═══════════════════════════════════════════════════════════════════════════╝
`


        // Read package version and build banner info
        const pkgPath = path.join(__dirname, '../', 'package.json')
        let version = 'unknown'
        try {
            if (fs.existsSync(pkgPath)) {
                const raw = fs.readFileSync(pkgPath, 'utf-8')
                const pkg = JSON.parse(raw)
                version = pkg.version || version
            }
        } catch {
            // Ignore version read errors
        }

        console.log(banner)
        console.log('='.repeat(80))
        console.log(`  Version: ${version} | Process: ${process.pid} | Clusters: ${this.config.clusters}`)
        // Replace visibility/parallel with concise enabled feature status
        const upd = this.config.update || {}
        const updTargets: string[] = []
        if (upd.git !== false) updTargets.push('Git')
        if (upd.docker) updTargets.push('Docker')
        if (updTargets.length > 0) {
            console.log(`  Update: ${updTargets.join(', ')}`)
        }

        console.log('='.repeat(80) + '\n')
    }    
    
    // Return summaries (used when clusters==1)
    public getSummaries() {
        return this.accountSummaries
    }

    private runMaster() {
        log('main', 'MAIN-PRIMARY', 'Primary process started')

        const totalAccounts = this.accounts.length
        
        // Validate accounts exist
        if (totalAccounts === 0) {
            log('main', 'MAIN-PRIMARY', 'No accounts found to process. Exiting.', 'warn')
            process.exit(0)
        }
        
        // If user over-specified clusters (e.g. 10 clusters but only 2 accounts), don't spawn useless idle workers.
        const workerCount = Math.min(this.config.clusters, totalAccounts)
        const accountChunks = this.utils.chunkArray(this.accounts, workerCount)
        // Reset activeWorkers to actual spawn count (constructor used raw clusters)
        this.activeWorkers = workerCount

        for (let i = 0; i < workerCount; i++) {
            const worker = cluster.fork()
            const chunk = accountChunks[i] || []
            
            // Validate chunk has accounts
            if (chunk.length === 0) {
                log('main', 'MAIN-PRIMARY', `Warning: Worker ${i} received empty account chunk`, 'warn')
            }
            
            (worker as unknown as { send?: (m: { chunk: Account[] }) => void }).send?.({ chunk })
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

            // Optional: restart crashed worker (basic heuristic) if crashRecovery allows
            try {
                const cr = this.config.crashRecovery
                if (cr?.restartFailedWorker && code !== 0) {
                    const attempts = (worker as unknown as { _restartAttempts?: number })._restartAttempts || 0
                    if (attempts < (cr.restartFailedWorkerAttempts ?? 1)) {
                        (worker as unknown as { _restartAttempts?: number })._restartAttempts = attempts + 1
                        log('main','CRASH-RECOVERY',`Respawning worker (attempt ${attempts + 1})`, 'warn','yellow')
                        const newW = cluster.fork()
                        // NOTE: account chunk re-assignment simplistic: unused; real mapping improvement todo
                        newW.on('message', (msg: unknown) => {
                            const m = msg as { type?: string; data?: AccountSummary[] }
                            if (m && m.type === 'summary' && Array.isArray(m.data)) this.accountSummaries.push(...m.data)
                        })
                    }
                }
            } catch { /* ignore */ }

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
            // If a global standby is active due to security/banned, stop processing further accounts
            if (this.globalStandby.active) {
                log('main','SECURITY',`Global standby active (${this.globalStandby.reason || 'security-issue'}). Not proceeding to next accounts until resolved.`, 'warn', 'yellow')
                break
            }
            // Optional global stop after first ban
            if (this.config?.humanization?.stopOnBan === true && this.bannedTriggered) {
                log('main','TASK',`Stopping remaining accounts due to ban on ${this.bannedTriggered.email}: ${this.bannedTriggered.reason}`,'warn')
                break
            }
            // Reset compromised state per account
            this.compromisedModeActive = false
            this.compromisedReason = undefined
            this.compromisedEmail = undefined
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
            this.currentAccountRecoveryEmail = account.recoveryEmail
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
                    const bd = detectBanReason(e)
                    if (bd.status) {
                        banned.status = true; banned.reason = bd.reason.substring(0,200)
                        void this.handleImmediateBanAlert(account.email, banned.reason)
                    }
                    errors.push(formatFullErr('desktop', e)); return null
                })
                const mobilePromise = mobileInstance.Mobile(account).catch(e => {
                    const msg = e instanceof Error ? e.message : String(e)
                    log(true, 'TASK', `Mobile flow failed early for ${account.email}: ${msg}`,'error')
                    const bd = detectBanReason(e)
                    if (bd.status) {
                        banned.status = true; banned.reason = bd.reason.substring(0,200)
                        void this.handleImmediateBanAlert(account.email, banned.reason)
                    }
                    errors.push(formatFullErr('mobile', e)); return null
                })
                const [desktopResult, mobileResult] = await Promise.allSettled([desktopPromise, mobilePromise])
                
                // Handle desktop result
                if (desktopResult.status === 'fulfilled' && desktopResult.value) {
                    desktopInitial = desktopResult.value.initialPoints
                    desktopCollected = desktopResult.value.collectedPoints
                } else if (desktopResult.status === 'rejected') {
                    log(false, 'TASK', `Desktop promise rejected unexpectedly: ${shortErr(desktopResult.reason)}`,'error')
                    errors.push(formatFullErr('desktop-rejected', desktopResult.reason))
                }
                
                // Handle mobile result
                if (mobileResult.status === 'fulfilled' && mobileResult.value) {
                    mobileInitial = mobileResult.value.initialPoints
                    mobileCollected = mobileResult.value.collectedPoints
                } else if (mobileResult.status === 'rejected') {
                    log(true, 'TASK', `Mobile promise rejected unexpectedly: ${shortErr(mobileResult.reason)}`,'error')
                    errors.push(formatFullErr('mobile-rejected', mobileResult.reason))
                }
            } else {
                // Sequential execution with safety checks
                if (this.isDesktopRunning || this.isMobileRunning) {
                    log('main', 'TASK', `Race condition detected: Desktop=${this.isDesktopRunning}, Mobile=${this.isMobileRunning}. Skipping to prevent conflicts.`, 'error')
                    errors.push('race-condition-detected')
                } else {
                    this.isMobile = false
                    this.isDesktopRunning = true
                    const desktopResult = await this.Desktop(account).catch(e => {
                        const msg = e instanceof Error ? e.message : String(e)
                        log(false, 'TASK', `Desktop flow failed early for ${account.email}: ${msg}`,'error')
                        const bd = detectBanReason(e)
                        if (bd.status) {
                            banned.status = true; banned.reason = bd.reason.substring(0,200)
                            void this.handleImmediateBanAlert(account.email, banned.reason)
                        }
                        errors.push(formatFullErr('desktop', e)); return null
                    })
                    if (desktopResult) {
                        desktopInitial = desktopResult.initialPoints
                        desktopCollected = desktopResult.collectedPoints
                    }
                    this.isDesktopRunning = false

                    // If banned or compromised detected, skip mobile to save time
                    if (!banned.status && !this.compromisedModeActive) {
                        this.isMobile = true
                        this.isMobileRunning = true
                        const mobileResult = await this.Mobile(account).catch(e => {
                            const msg = e instanceof Error ? e.message : String(e)
                            log(true, 'TASK', `Mobile flow failed early for ${account.email}: ${msg}`,'error')
                            const bd = detectBanReason(e)
                            if (bd.status) {
                                banned.status = true; banned.reason = bd.reason.substring(0,200)
                                void this.handleImmediateBanAlert(account.email, banned.reason)
                            }
                            errors.push(formatFullErr('mobile', e)); return null
                        })
                        if (mobileResult) {
                            mobileInitial = mobileResult.initialPoints
                            mobileCollected = mobileResult.collectedPoints
                        }
                        this.isMobileRunning = false
                    } else {
                        const why = banned.status ? 'banned status' : 'compromised status'
                        log(true, 'TASK', `Skipping mobile flow for ${account.email} due to ${why}`, 'warn')
                    }
                }
            }

            const accountEnd = Date.now()
            const durationMs = accountEnd - accountStart
            const totalCollected = desktopCollected + mobileCollected
            // Correct initial points (previous version double counted desktop+mobile baselines)
            // Strategy: pick the lowest non-zero baseline (desktopInitial or mobileInitial) as true start.
            // Sequential flow: desktopInitial < mobileInitial after gain -> min = original baseline.
            // Parallel flow: both baselines equal -> min is fine.
            const baselines: number[] = []
            if (desktopInitial) baselines.push(desktopInitial)
            if (mobileInitial) baselines.push(mobileInitial)
            let initialTotal = 0
            if (baselines.length === 1) initialTotal = baselines[0]!
            else if (baselines.length === 2) initialTotal = Math.min(baselines[0]!, baselines[1]!)
            // Fallback if both missing
            if (initialTotal === 0 && (desktopInitial || mobileInitial)) initialTotal = desktopInitial || mobileInitial || 0
            const endTotal = initialTotal + totalCollected
            this.accountSummaries.push({
                email: account.email,
                durationMs,
                desktopCollected,
                mobileCollected,
                totalCollected,
                initialTotal,
                endTotal,
                errors,
                banned
            })

            if (banned.status) {
                this.bannedTriggered = { email: account.email, reason: banned.reason }
                // Enter global standby: do not proceed to next accounts
                this.globalStandby = { active: true, reason: `banned:${banned.reason}` }
                await this.sendGlobalSecurityStandbyAlert(account.email, `Ban detected: ${banned.reason || 'unknown'}`)
            }

            await log('main', 'MAIN-WORKER', `Completed tasks for account ${account.email}`, 'log', 'green')
        }

    await log(this.isMobile, 'MAIN-PRIMARY', 'Completed tasks for ALL accounts', 'log', 'green')
        // Extra diagnostic summary when verbose
        if (process.env.DEBUG_REWARDS_VERBOSE === '1') {
            for (const summary of this.accountSummaries) {
                log('main','SUMMARY-DEBUG',`Account ${summary.email} collected D:${summary.desktopCollected} M:${summary.mobileCollected} TOTAL:${summary.totalCollected} ERRORS:${summary.errors.length ? summary.errors.join(';') : 'none'}`)
            }
        }
        // If any account is flagged compromised, do NOT exit; keep the process alive so the browser stays open
        if (this.compromisedModeActive || this.globalStandby.active) {
            log('main','SECURITY','Compromised or banned detected. Global standby engaged: we will NOT proceed to other accounts until resolved. Keeping process alive. Press CTRL+C to exit when done. Security check by @Light','warn','yellow')
            const standbyInterval = setInterval(() => {
                log('main','SECURITY','Still in standby: session(s) held open for manual recovery / review...','warn','yellow')
            }, 5 * 60 * 1000)
            
            // Cleanup on process exit
            process.once('SIGINT', () => { clearInterval(standbyInterval); process.exit(0) })
            process.once('SIGTERM', () => { clearInterval(standbyInterval); process.exit(0) })
            return
        }
        // If in worker mode (clusters>1) send summaries to primary
        if (this.config.clusters > 1 && !cluster.isPrimary) {
            if (process.send) {
                process.send({ type: 'summary', data: this.accountSummaries })
            }
        } else {
            // Single process mode -> build and send conclusion directly
            // After conclusion, run optional auto-update
            await this.runAutoUpdate().catch(() => {/* ignore update errors */})
        }
        process.exit()
    }

    /** Send immediate ban alert if configured. */
    private async handleImmediateBanAlert(email: string, reason: string): Promise<void> {
        try {
            const h = this.config?.humanization
            if (!h || h.immediateBanAlert === false) return
            const { ConclusionWebhook } = await import('./util/ConclusionWebhook')
            await ConclusionWebhook(
                this.config,
                '🚫 Ban Detected',
                `**Account:** ${email}\n**Reason:** ${reason || 'detected by heuristics'}`,
                undefined,
                DISCORD.COLOR_RED
            )
        } catch (e) {
            log('main','ALERT',`Failed to send ban alert: ${e instanceof Error ? e.message : e}`,'warn')
        }
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

        // Login into MS Rewards, then optionally stop if compromised
    await this.login.login(this.homePage, account.email, account.password, account.totp)

        if (this.compromisedModeActive) {
            // User wants the page to remain open for manual recovery. Do not proceed to tasks.
            const reason = this.compromisedReason || 'security-issue'
            log(this.isMobile, 'SECURITY', `Account flagged as compromised (${reason}). Leaving the browser open and skipping all activities for ${account.email}. Security check by @Light`, 'warn', 'yellow')
            try {
                const { ConclusionWebhook } = await import('./util/ConclusionWebhook')
                await ConclusionWebhook(
                    this.config,
                    '🔐 Security Alert (Post-Login)',
                    `**Account:** ${account.email}\n**Reason:** ${reason}\n**Action:** Leaving browser open; skipping tasks\n\n_Security check by @Light_`,
                    undefined,
                    0xFFAA00
                )
            } catch {/* ignore */}
            // Save session for convenience, but do not close the browser
            try { 
                await saveSessionData(this.config.sessionPath, this.homePage.context(), account.email, this.isMobile) 
            } catch (e) {
                log(this.isMobile, 'SECURITY', `Failed to save session: ${e instanceof Error ? e.message : String(e)}`, 'warn')
            }
            return { initialPoints: 0, collectedPoints: 0 }
        }

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

        if (this.pointsCanCollect === 0) {
            // Extra diagnostic breakdown so users know WHY it's zero
            log(this.isMobile, 'MAIN-POINTS', `Breakdown (desktop): dailySet=${browserEnarablePoints.dailySetPoints} search=${browserEnarablePoints.desktopSearchPoints} promotions=${browserEnarablePoints.morePromotionsPoints}`)
            log(this.isMobile, 'MAIN-POINTS', 'All desktop earnable buckets are zero. This usually means: tasks already completed today OR the daily reset has not happened yet for your time zone. If you still want to force run activities set execution.runOnZeroPoints=true in config.', 'log', 'yellow')
        }

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

        // Login into MS Rewards, then respect compromised mode
    await this.login.login(this.homePage, account.email, account.password, account.totp)
        if (this.compromisedModeActive) {
            const reason = this.compromisedReason || 'security-issue'
            log(this.isMobile, 'SECURITY', `Account flagged as compromised (${reason}). Leaving mobile browser open and skipping mobile activities for ${account.email}. Security check by @Light`, 'warn', 'yellow')
            try {
                const { ConclusionWebhook } = await import('./util/ConclusionWebhook')
                await ConclusionWebhook(
                    this.config,
                    '🔐 Security Alert (Mobile)',
                    `**Account:** ${account.email}\n**Reason:** ${reason}\n**Action:** Leaving mobile browser open; skipping tasks\n\n_Security check by @Light_`,
                    undefined,
                    0xFFAA00
                )
            } catch {/* ignore */}
            try { 
                await saveSessionData(this.config.sessionPath, this.homePage.context(), account.email, this.isMobile) 
            } catch (e) {
                log(this.isMobile, 'SECURITY', `Failed to save session: ${e instanceof Error ? e.message : String(e)}`, 'warn')
            }
            return { initialPoints: 0, collectedPoints: 0 }
        }
        this.accessToken = await this.login.getMobileAccessToken(this.homePage, account.email)

        await this.browser.func.goHome(this.homePage)

    const data = await this.browser.func.getDashboardData()
    const initialPoints = data.userStatus.availablePoints || this.pointsInitial || 0

        const browserEnarablePoints = await this.browser.func.getBrowserEarnablePoints()
        const appEarnablePoints = await this.browser.func.getAppEarnablePoints(this.accessToken)

        this.pointsCanCollect = browserEnarablePoints.mobileSearchPoints + appEarnablePoints.totalEarnablePoints

        log(this.isMobile, 'MAIN-POINTS', `You can earn ${this.pointsCanCollect} points today (Browser: ${browserEnarablePoints.mobileSearchPoints} points, App: ${appEarnablePoints.totalEarnablePoints} points)`)

        if (this.pointsCanCollect === 0) {
            log(this.isMobile, 'MAIN-POINTS', `Breakdown (mobile): browserSearch=${browserEnarablePoints.mobileSearchPoints} appTotal=${appEarnablePoints.totalEarnablePoints}`)
            log(this.isMobile, 'MAIN-POINTS', 'All mobile earnable buckets are zero. Causes: mobile searches already maxed, daily set finished, or daily rollover not reached yet. You can force execution by setting execution.runOnZeroPoints=true.', 'log', 'yellow')
        }

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
        const { ConclusionWebhookEnhanced } = await import('./util/ConclusionWebhook')
        const cfg = this.config

    const conclusionWebhookEnabled = !!(cfg.conclusionWebhook && cfg.conclusionWebhook.enabled)
    const ntfyEnabled = !!(cfg.ntfy && cfg.ntfy.enabled)
    const webhookEnabled = !!(cfg.webhook && cfg.webhook.enabled)

        const totalAccounts = summaries.length
        if (totalAccounts === 0) return

        let totalCollected = 0
        let totalInitial = 0
        let totalEnd = 0
        let totalDuration = 0
        let accountsWithErrors = 0
        let accountsBanned = 0
        let successes = 0

        // Calculate summary statistics
        for (const s of summaries) {
            totalCollected += s.totalCollected
            totalInitial += s.initialTotal
            totalEnd += s.endTotal
            totalDuration += s.durationMs
            if (s.banned?.status) accountsBanned++
            if (s.errors.length) accountsWithErrors++
            if (!s.banned?.status && !s.errors.length) successes++
        }

        const avgDuration = totalDuration / totalAccounts
        const avgPointsPerAccount = Math.round(totalCollected / totalAccounts)

        // Read package version
        let version = 'unknown'
        try {
            const pkgPath = path.join(process.cwd(), 'package.json')
            if (fs.existsSync(pkgPath)) {
                const raw = fs.readFileSync(pkgPath, 'utf-8')
                const pkg = JSON.parse(raw)
                version = pkg.version || version
            }
        } catch { /* ignore */ }

        // Send enhanced webhook
        if (conclusionWebhookEnabled || ntfyEnabled || webhookEnabled) {
            await ConclusionWebhookEnhanced(cfg, {
                version,
                runId: this.runId,
                totalAccounts,
                successes,
                accountsWithErrors,
                accountsBanned,
                totalCollected,
                totalInitial,
                totalEnd,
                avgPointsPerAccount,
                totalDuration,
                avgDuration,
                summaries
            })
        }

        // Write local JSON report
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


        // Optional community notice (shown randomly in ~15% of successful runs)
        if (Math.random() > 0.85 && successes > 0 && accountsWithErrors === 0) {
            log('main','INFO','Want faster updates & enhanced anti-detection? Community builds available: https://discord.gg/kn3695Kx32')
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

        const env = process.env

        await new Promise<void>((resolve) => {
            const child = spawn(process.execPath, [scriptAbs, ...args], { stdio: 'inherit', env })
            child.on('close', () => resolve())
            child.on('error', () => resolve())
        })
    }

    /** Public entry-point to engage global security standby from other modules (idempotent). */
    public async engageGlobalStandby(reason: string, email?: string): Promise<void> {
        try {
            if (this.globalStandby.active) return
            this.globalStandby = { active: true, reason }
            const who = email || this.currentAccountEmail || 'unknown'
            await this.sendGlobalSecurityStandbyAlert(who, reason)
        } catch {/* ignore */}
    }

    /** Send a strong alert to all channels and mention @everyone when entering global security standby. */
    private async sendGlobalSecurityStandbyAlert(email: string, reason: string): Promise<void> {
        try {
            const { ConclusionWebhook } = await import('./util/ConclusionWebhook')
            await ConclusionWebhook(
                this.config,
                '🚨 Global Security Standby Engaged',
                `@everyone\n\n**Account:** ${email}\n**Reason:** ${reason}\n**Action:** Pausing all further accounts. We will not proceed until this is resolved.\n\n_Security check by @Light_`,
                undefined,
                DISCORD.COLOR_RED
            )
        } catch (e) {
            log('main','ALERT',`Failed to send standby alert: ${e instanceof Error ? e.message : e}`,'warn')
        }
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

async function main() {
    const rewardsBot = new MicrosoftRewardsBot(false)

    const crashState = { restarts: 0 }
    const config = rewardsBot.config

    const attachHandlers = () => {
        process.on('unhandledRejection', (reason) => {
            log('main','FATAL','UnhandledRejection: ' + (reason instanceof Error ? reason.message : String(reason)), 'error')
            gracefulExit(1)
        })
        process.on('uncaughtException', (err) => {
            log('main','FATAL','UncaughtException: ' + err.message, 'error')
            gracefulExit(1)
        })
        process.on('SIGTERM', () => gracefulExit(0))
        process.on('SIGINT', () => gracefulExit(0))
    }

    const gracefulExit = (code: number) => {
        if (config?.crashRecovery?.autoRestart && code !== 0) {
            const max = config.crashRecovery.maxRestarts ?? 2
            if (crashState.restarts < max) {
                const backoff = (config.crashRecovery.backoffBaseMs ?? 2000) * (crashState.restarts + 1)
                log('main','CRASH-RECOVERY',`Scheduling restart in ${backoff}ms (attempt ${crashState.restarts + 1}/${max})`, 'warn','yellow')
                setTimeout(() => {
                    crashState.restarts++
                    bootstrap()
                }, backoff)
                return
            }
        }
        process.exit(code)
    }

    const bootstrap = async () => {
        try {
            await rewardsBot.initialize()
            await rewardsBot.run()
        } catch (e) {
            log('main','MAIN-ERROR','Fatal during run: ' + (e instanceof Error ? e.message : e),'error')
            gracefulExit(1)
        }
    }

    attachHandlers()
    await bootstrap()
}

// Start the bots
if (require.main === module) {
    main().catch(error => {
        log('main', 'MAIN-ERROR', `Error running bots: ${error}`, 'error')
        process.exit(1)
    })
}
