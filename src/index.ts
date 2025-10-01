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

    private pointsCanCollect: number = 0
    private pointsInitial: number = 0

    private activeWorkers: number
    private mobileRetryAttempts: number
    private browserFactory: Browser = new Browser(this)
    private accounts: Account[]
    private workers: Workers
    private login = new Login(this)
    private accessToken: string = ''
    // Buy mode (manual spending) tracking
    private buyMode: { enabled: boolean; email?: string } = { enabled: false }

    // Summary collection (per process)
    private accountSummaries: AccountSummary[] = []
    private runId: string = Math.random().toString(36).slice(2)
    private diagCount: number = 0
    private bannedTriggered: { email: string; reason: string } | null = null
    private globalStandby: { active: boolean; reason?: string } = { active: false }
    // Scheduler heartbeat integration
    private heartbeatFile?: string
    private heartbeatTimer?: NodeJS.Timeout

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
        // Base buy mode from config
        const cfgAny = this.config as unknown as { buyMode?: { enabled?: boolean } }
        if (cfgAny.buyMode?.enabled === true) {
            this.buyMode.enabled = true
        }

        // CLI: detect buy mode flag and target email (overrides config)
        const idx = process.argv.indexOf('-buy')
        if (idx >= 0) {
            const target = process.argv[idx + 1]
            if (target && /@/.test(target)) {
                this.buyMode = { enabled: true, email: target }
            } else {
                this.buyMode = { enabled: true }
            }
        }
    }

    async initialize() {
        this.accounts = loadAccounts()
    }

    async run() {
        this.printBanner()
        log('main', 'MAIN', `Bot started with ${this.config.clusters} clusters`)

        // If scheduler provided a heartbeat file, update it periodically to signal liveness
        const hbFile = process.env.SCHEDULER_HEARTBEAT_FILE
        if (hbFile) {
            try {
                const dir = path.dirname(hbFile)
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
                fs.writeFileSync(hbFile, String(Date.now()))
                this.heartbeatFile = hbFile
                this.heartbeatTimer = setInterval(() => {
                    try { fs.writeFileSync(hbFile, String(Date.now())) } catch { /* ignore */ }
                }, 60_000)
            } catch { /* ignore */ }
        }

        // If buy mode is enabled, run single-account interactive session without automation
        if (this.buyMode.enabled) {
            const targetInfo = this.buyMode.email ? ` for ${this.buyMode.email}` : ''
            log('main', 'BUY-MODE', `Buy mode ENABLED${targetInfo}. We'll open 2 tabs: (1) a monitor tab that auto-refreshes to track points, (2) your browsing tab to redeem/purchase freely.`, 'log', 'green')
            log('main', 'BUY-MODE', 'The monitor tab may refresh every ~10s. Use the other tab for your actions; monitoring is passive and non-intrusive.', 'log', 'yellow')
            await this.runBuyMode()
            return
        }

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

    /** Manual spending session: login, then leave control to user while we passively monitor points. */
    private async runBuyMode() {
        try {
            await this.initialize()
            const email = this.buyMode.email || (this.accounts[0]?.email)
            const account = this.accounts.find(a => a.email === email) || this.accounts[0]
            if (!account) throw new Error('No account available for buy mode')

            this.isMobile = false
            this.axios = new Axios(account.proxy)
            const browser = await this.browserFactory.createBrowser(account.proxy, account.email)
            // Open the monitor tab FIRST so auto-refresh happens out of the way
            let monitor = await browser.newPage()
            await this.login.login(monitor, account.email, account.password, account.totp)
            await this.browser.func.goHome(monitor)
            this.log(false, 'BUY-MODE', 'Opened MONITOR tab (auto-refreshes to track points).', 'log', 'yellow')

            // Then open the user free-browsing tab SECOND so users don’t see the refreshes
            const page = await browser.newPage()
            await this.browser.func.goHome(page)
            this.log(false, 'BUY-MODE', 'Opened USER tab (use this one to redeem/purchase freely).', 'log', 'green')

            // Helper to recreate monitor tab if the user closes it
            const recreateMonitor = async () => {
                try { if (!monitor.isClosed()) await monitor.close() } catch { /* ignore */ }
                monitor = await browser.newPage()
                await this.browser.func.goHome(monitor)
            }

            // Helper to send an immediate spend notice via webhooks/NTFY
            const sendSpendNotice = async (delta: number, nowPts: number, cumulativeSpent: number) => {
                try {
                    const { ConclusionWebhook } = await import('./util/ConclusionWebhook')
                    const title = '💳 Spend detected (Buy Mode)'
                    const desc = [
                        `Account: ${account.email}`,
                        `Spent: -${delta} points`,
                        `Current: ${nowPts} points`,
                        `Session spent: ${cumulativeSpent} points`
                    ].join('\n')
                    await ConclusionWebhook(this.config, '', {
                        context: 'spend',
                        embeds: [
                            {
                                title,
                                description: desc,
                                // Use warn color so NTFY is sent as warn
                                color: 0xFFAA00
                            }
                        ]
                    })
                } catch (e) {
                    this.log(false, 'BUY-MODE', `Failed to send spend notice: ${e instanceof Error ? e.message : e}`, 'warn')
                }
            }
            let initial = 0
            try {
                const data = await this.browser.func.getDashboardData(monitor)
                initial = data.userStatus.availablePoints || 0
            } catch {/* ignore */}

            this.log(false, 'BUY-MODE', `Logged in as ${account.email}. Buy mode is active: monitor tab auto-refreshes; user tab is free for your actions. We'll observe points passively.`)

            // Passive watcher: poll points periodically without clicking.
            const start = Date.now()
            let last = initial
            let spent = 0

            const cfgAny = this.config as unknown as Record<string, unknown>
            const buyModeConfig = cfgAny['buyMode'] as Record<string, unknown> | undefined
            const maxMinutesRaw = buyModeConfig?.['maxMinutes'] ?? 45
            const maxMinutes = Math.max(10, Number(maxMinutesRaw))
            const endAt = start + maxMinutes * 60 * 1000

            while (Date.now() < endAt) {
                await this.utils.wait(10000)

                // If monitor tab was closed by user, recreate it quietly
                try {
                    if (monitor.isClosed()) {
                        this.log(false, 'BUY-MODE', 'Monitor tab was closed; reopening in background...', 'warn')
                        await recreateMonitor()
                    }
                } catch { /* ignore */ }

                try {
                    const data = await this.browser.func.getDashboardData(monitor)
                    const nowPts = data.userStatus.availablePoints || 0
                    if (nowPts < last) {
                        // Points decreased -> likely spent
                        const delta = last - nowPts
                        spent += delta
                        last = nowPts
                        this.log(false, 'BUY-MODE', `Detected spend: -${delta} points (current: ${nowPts})`)
                        // Immediate spend notice
                        await sendSpendNotice(delta, nowPts, spent)
                    } else if (nowPts > last) {
                        last = nowPts
                    }
                } catch (err) {
                    // If we lost the page context, recreate the monitor tab and continue
                    const msg = err instanceof Error ? err.message : String(err)
                    if (/Target closed|page has been closed|browser has been closed/i.test(msg)) {
                        this.log(false, 'BUY-MODE', 'Monitor page closed or lost; recreating...', 'warn')
                        try { await recreateMonitor() } catch { /* ignore */ }
                    }
                    // Swallow other errors to avoid disrupting the user
                }
            }

            // Save cookies and close monitor; keep main page open for user until they close it themselves
            try { await saveSessionData(this.config.sessionPath, browser, account.email, this.isMobile) } catch { /* ignore */ }
            try { if (!monitor.isClosed()) await monitor.close() } catch {/* ignore */}

            // Send a final minimal conclusion webhook for this manual session
            const summary: AccountSummary = {
                email: account.email,
                durationMs: Date.now() - start,
                desktopCollected: 0,
                mobileCollected: 0,
                totalCollected: -spent, // negative indicates spend
                initialTotal: initial,
                endTotal: last,
                errors: [],
                banned: { status: false, reason: '' }
            }
            await this.sendConclusion([summary])

            this.log(false, 'BUY-MODE', 'Buy mode session finished (monitoring period ended). You can close the browser when done.')
        } catch (e) {
            this.log(false, 'BUY-MODE', `Error in buy mode: ${e instanceof Error ? e.message : e}`, 'error')
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

        const buyModeBanner = `
 ███╗   ███╗███████╗    ██████╗ ██╗   ██╗██╗   ██╗
 ████╗ ████║██╔════╝    ██╔══██╗██║   ██║╚██╗ ██╔╝
 ██╔████╔██║███████╗    ██████╔╝██║   ██║ ╚████╔╝ 
 ██║╚██╔╝██║╚════██║    ██╔══██╗██║   ██║  ╚██╔╝  
 ██║ ╚═╝ ██║███████║    ██████╔╝╚██████╔╝   ██║   
 ╚═╝     ╚═╝╚══════╝    ╚═════╝  ╚═════╝    ╚═╝   
                                                   
            By @Light • Manual Purchase Mode • Passive Monitoring
`
        
        try {
            const pkgPath = path.join(__dirname, '../', 'package.json')
            let version = 'unknown'
            if (fs.existsSync(pkgPath)) {
                const raw = fs.readFileSync(pkgPath, 'utf-8')
                const pkg = JSON.parse(raw)
                version = pkg.version || version
            }
            
            // Show appropriate banner based on mode
            const displayBanner = this.buyMode.enabled ? buyModeBanner : banner
            console.log(displayBanner)
            console.log('='.repeat(80))
            
            if (this.buyMode.enabled) {
                console.log(`  Version: ${version} | Process: ${process.pid} | Buy Mode: Active`)
                console.log(`  Target: ${this.buyMode.email || 'First account'} | Documentation: buy-mode.md`)
            } else {
                console.log(`  Version: ${version} | Process: ${process.pid} | Clusters: ${this.config.clusters}`)
                // Replace visibility/parallel with concise enabled feature status
                const upd = this.config.update || {}
                const updTargets: string[] = []
                if (upd.git !== false) updTargets.push('Git')
                if (upd.docker) updTargets.push('Docker')
                if (updTargets.length > 0) {
                    console.log(`  Update: ${updTargets.join(', ')}`)
                }

                const sched = this.config.schedule || {}
                const schedEnabled = !!sched.enabled
                if (!schedEnabled) {
                    console.log('  Schedule: OFF')
                } else {
                    // Determine active format + time string to display
                    const tz = sched.timeZone || 'UTC'
                    let formatName = ''
                    let timeShown = ''
                    const srec: Record<string, unknown> = sched as unknown as Record<string, unknown>
                    const useAmPmVal = typeof srec['useAmPm'] === 'boolean' ? (srec['useAmPm'] as boolean) : undefined
                    const time12Val = typeof srec['time12'] === 'string' ? String(srec['time12']) : undefined
                    const time24Val = typeof srec['time24'] === 'string' ? String(srec['time24']) : undefined

                    if (useAmPmVal === true) {
                        formatName = 'AM/PM'
                        timeShown = time12Val || sched.time || '9:00 AM'
                    } else if (useAmPmVal === false) {
                        formatName = '24h'
                        timeShown = time24Val || sched.time || '09:00'
                    } else {
                        // Back-compat: infer from provided fields if possible
                        if (time24Val && time24Val.trim()) { formatName = '24h'; timeShown = time24Val }
                        else if (time12Val && time12Val.trim()) { formatName = 'AM/PM'; timeShown = time12Val }
                        else { formatName = 'legacy'; timeShown = sched.time || '09:00' }
                    }
                    console.log(`  Schedule: ON — ${formatName} • ${timeShown} • TZ=${tz}`)
                }
            }
            console.log('='.repeat(80) + '\n')
        } catch { 
            const displayBanner = this.buyMode.enabled ? buyModeBanner : banner
            console.log(displayBanner)
            console.log('='.repeat(50))
            if (this.buyMode.enabled) {
                console.log('  Microsoft Rewards Buy Mode Started')
                console.log('  See buy-mode.md for details')
            } else {
                console.log('  Microsoft Rewards Script Started')
            }
            console.log('='.repeat(50) + '\n')
        }
    }    // Return summaries (used when clusters==1)
    public getSummaries() {
        return this.accountSummaries
    }

    private runMaster() {
        log('main', 'MAIN-PRIMARY', 'Primary process started')

        const totalAccounts = this.accounts.length
        // If user over-specified clusters (e.g. 10 clusters but only 2 accounts), don't spawn useless idle workers.
        const workerCount = Math.min(this.config.clusters, totalAccounts || 1)
        const accountChunks = this.utils.chunkArray(this.accounts, workerCount)
        // Reset activeWorkers to actual spawn count (constructor used raw clusters)
        this.activeWorkers = workerCount

        for (let i = 0; i < workerCount; i++) {
            const worker = cluster.fork()
            const chunk = accountChunks[i] || []
            ;(worker as unknown as { send?: (m: { chunk: Account[] }) => void }).send?.({ chunk })
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

                // If banned or compromised detected, skip mobile to save time
                if (!banned.status && !this.compromisedModeActive) {
                    this.isMobile = true
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
                } else {
                    const why = banned.status ? 'banned status' : 'compromised status'
                    log(true, 'TASK', `Skipping mobile flow for ${account.email} due to ${why}`, 'warn')
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
            // Periodic heartbeat
            setInterval(() => {
                log('main','SECURITY','Still in standby: session(s) held open for manual recovery / review...','warn','yellow')
            }, 5 * 60 * 1000)
            return
        }
        // If in worker mode (clusters>1) send summaries to primary
        if (this.config.clusters > 1 && !cluster.isPrimary) {
            if (process.send) {
                process.send({ type: 'summary', data: this.accountSummaries })
            }
        } else {
            // Single process mode -> build and send conclusion directly
            await this.sendConclusion(this.accountSummaries)
            // Cleanup heartbeat timer/file at end of run
            if (this.heartbeatTimer) { try { clearInterval(this.heartbeatTimer) } catch { /* ignore */ } }
            if (this.heartbeatFile) { try { if (fs.existsSync(this.heartbeatFile)) fs.unlinkSync(this.heartbeatFile) } catch { /* ignore */ } }
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
            const title = '🚫 Ban detected'
            const desc = [`Account: ${email}`, `Reason: ${reason || 'detected by heuristics'}`].join('\n')
            await ConclusionWebhook(this.config, `${title}\n${desc}`, {
                embeds: [
                    {
                        title,
                        description: desc,
                        color: 0xFF0000
                    }
                ]
            })
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
                    await ConclusionWebhook(this.config, `Security issue on ${account.email} (${reason}). Logged in successfully; leaving browser open. Security check by @Light`, {
                        context: 'compromised',
                        embeds: [
                            {
                                title: '🔐 Security alert (post-login)',
                                description: `Account: ${account.email}\nReason: ${reason}\nAction: Leaving browser open; skipping tasks`,
                                color: 0xFFAA00
                            }
                        ]
                    })
            } catch {/* ignore */}
            // Save session for convenience, but do not close the browser
            try { await saveSessionData(this.config.sessionPath, this.homePage.context(), account.email, this.isMobile) } catch { /* ignore */ }
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
                    await ConclusionWebhook(this.config, `Security issue on ${account.email} (${reason}). Mobile flow halted; leaving browser open. Security check by @Light`, {
                        context: 'compromised',
                        embeds: [
                            {
                                title: '🔐 Security alert (mobile)',
                                description: `Account: ${account.email}\nReason: ${reason}\nAction: Leaving mobile browser open; skipping tasks`,
                                color: 0xFFAA00
                            }
                        ]
                    })
            } catch {/* ignore */}
            try { await saveSessionData(this.config.sessionPath, this.homePage.context(), account.email, this.isMobile) } catch { /* ignore */ }
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
        const { ConclusionWebhook } = await import('./util/ConclusionWebhook')
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

    // Send both when any channel is enabled: Discord gets embeds, NTFY gets fallback
    if (conclusionWebhookEnabled || ntfyEnabled || webhookEnabled) {
        await ConclusionWebhook(cfg, fallback, { embeds })
    }

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
            const title = '🚨 Global security standby engaged'
            const desc = [
                `Account: ${email}`,
                `Reason: ${reason}`,
                'Action: Pausing all further accounts. We will not proceed until this is resolved.',
                'Security check by @Light'
            ].join('\n')
            // Mention everyone in content for Discord visibility
            const content = '@everyone ' + title
            await ConclusionWebhook(this.config, content, {
                embeds: [
                    {
                        title,
                        description: desc,
                        color: 0xFF0000
                    }
                ]
            })
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
    // CommunityReporter disabled per project policy
    // (previously: init + global hooks for uncaughtException/unhandledRejection)
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
        try { rewardsBot['heartbeatTimer'] && clearInterval(rewardsBot['heartbeatTimer']) } catch { /* ignore */ }
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
        // CommunityReporter disabled
        process.exit(1)
    })
}