import { logAccountResult, logRunResult } from '../logging/RunSummary'
import type { WorkflowFactory } from './AccountWorkflow'
import { setTimeout as delay } from 'node:timers/promises'
import cluster, { type Worker } from 'node:cluster'
import pkg from '../../package.json'
import type { BotContext } from './BotContext'
import type { Account } from './Account'
import type { AccountStats, AccountRunResult } from './RunTypes'
import type { IpcLog } from '../logging/Logger'
import { loadAccounts } from '../config/Load'
import { loadResolvedRegion } from '../session/SessionStore'
import { resolveAccountLocale } from '../util/Locale'
import HttpClient from '../network/HttpClient'
import { sendNotifications } from '../logging/Notifications'
import { flushRunResources } from './ProcessLifecycle'
import { logExecutionMode } from './ExecutionModeLog'
import { AccountRunner } from './AccountRunner'

export class RunCoordinator {
    private accounts: Account[] = []
    private activeWorkers = 0
    private exitedWorkers: number[] = []

    constructor(
        private readonly bot: BotContext,
        private readonly createWorkflow: WorkflowFactory
    ) {}

    async initialize(): Promise<void> {
        this.accounts = loadAccounts()
        logExecutionMode(this.bot)
    }

    async run(): Promise<void> {
        const totalAccounts = this.accounts.length
        const runStartTime = Date.now()

        if (cluster.isPrimary)
            this.bot.logger.info(
                'main',
                'RUN-START',
                `Starting Microsoft Rewards Script | v${pkg.version} | Accounts: ${totalAccounts} | Clusters: ${this.bot.config.clusters}`
            )

        if (this.bot.config.clusters > 1) {
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
        void this.bot.logger.debug('main', 'CLUSTER-PRIMARY', `Primary process started | PID: ${process.pid}`)

        const rawChunks = this.bot.utils.chunkArray(this.accounts, this.bot.config.clusters)
        const accountChunks = rawChunks.filter(c => c && c.length > 0)
        this.activeWorkers = accountChunks.length

        const allAccountStats: AccountStats[] = []
        let hadWorkerFailure = false
        const assigned = new Map<number, Account[]>()

        if (!accountChunks.length) {
            logRunResult(this.bot.logger, this.accounts.length, [], runStartTime, this.bot.cancellation.signal.aborted)
            await flushRunResources()
            process.exitCode = this.bot.cancellation.signal.aborted ? 143 : 0
            return
        }
        this.exitedWorkers = []
        let complete!: () => void
        let fail!: (error: unknown) => void
        const completion = new Promise<void>((resolve, reject) => {
            complete = resolve
            fail = reject
        })
        const onWorkerExit = async (worker: Worker, code?: number, signal?: string): Promise<void> => {
            const { pid } = worker.process

            if (!pid || this.exitedWorkers.includes(pid)) {
                return
            }

            this.exitedWorkers.push(pid)
            this.activeWorkers -= 1
            for (const account of assigned.get(pid) ?? []) {
                if (!allAccountStats.some(stat => stat.email === account.email)) {
                    hadWorkerFailure = true
                    const stats: AccountStats = {
                        email: account.email,
                        initialPoints: 0,
                        finalPoints: 0,
                        collectedPoints: 0,
                        pointsKnown: false,
                        duration: 0,
                        success: false,
                        status: 'failed',
                        error: 'Worker exited before reporting account results'
                    }
                    allAccountStats.push(stats)
                    logAccountResult(this.bot, stats)
                }
            }

            const failed = (code ?? 0) !== 0 || Boolean(signal)
            if (failed) {
                hadWorkerFailure = true
            }

            this.bot.logger[failed ? 'warn' : 'debug'](
                'main',
                'CLUSTER-WORKER-EXIT',
                `Worker ${pid} exit | Code: ${code ?? 'n/a'} | Signal: ${signal ?? 'n/a'} | Active workers: ${this.activeWorkers}`
            )

            if (this.activeWorkers <= 0) {
                logRunResult(
                    this.bot.logger,
                    this.accounts.length,
                    allAccountStats,
                    runStartTime,
                    hadWorkerFailure || this.bot.cancellation.signal.aborted
                )

                await flushRunResources()

                cluster.removeListener('exit', exitListener)
                cluster.removeListener('disconnect', disconnectListener)
                process.exitCode = this.bot.cancellation.signal.aborted ? 143 : hadWorkerFailure ? 1 : 0
                complete()
            }
        }

        const exitListener = (worker: Worker, code: number, signal: string): void => {
            void onWorkerExit(worker, code, signal).catch(fail)
        }
        cluster.on('exit', exitListener)

        const disconnectListener = (worker: Worker): void => {
            const pid = worker.process?.pid
            this.bot.logger.debug('main', 'CLUSTER-WORKER-DISCONNECT', `Worker ${pid ?? '?'} disconnected`)
        }
        cluster.on('disconnect', disconnectListener)

        for (const [chunkIndex, chunk] of accountChunks.entries()) {
            if (chunkIndex > 0) {
                await this.waitBeforeNextAccount(chunk[0]?.email)
            }

            const worker = cluster.fork()
            if (worker.process.pid) assigned.set(worker.process.pid, chunk)
            worker.send?.({ chunk, runStartTime })

            worker.on('message', (msg: { __ipcLog?: IpcLog; __stats?: AccountStats[] }) => {
                if (msg.__stats) {
                    allAccountStats.push(...msg.__stats)
                }

                const log = msg.__ipcLog
                if (log && typeof log.content === 'string') {
                    const { webhook } = this.bot.config
                    const { content, level, color } = log

                    void sendNotifications(webhook, content, level, color)
                }
            })
        }

        await completion
    }

    private runWorker(runStartTimeFromMaster?: number): void {
        void this.bot.logger.debug('main', 'CLUSTER-WORKER-START', `Worker spawned | PID: ${process.pid}`)

        let receivedChunk = false
        process.on('message', async (message: { chunk?: Account[]; runStartTime?: number }) => {
            if (receivedChunk || !Array.isArray(message?.chunk)) return
            receivedChunk = true
            const { chunk, runStartTime } = message
            void this.bot.logger.debug(
                'main',
                'CLUSTER-WORKER-TASK',
                `Worker ${process.pid} received ${chunk.length} accounts.`
            )

            try {
                const stats = await this.runTasks(chunk, runStartTime ?? runStartTimeFromMaster ?? Date.now())

                if (process.send) {
                    await new Promise<void>((resolve, reject) =>
                        process.send!({ __stats: stats }, error => (error ? reject(error) : resolve()))
                    )
                }

                await flushRunResources()
                process.exit(this.bot.cancellation.signal.aborted ? 143 : 0)
            } catch (error) {
                this.bot.logger.error(
                    'main',
                    'CLUSTER-WORKER-ERROR',
                    `Worker task crash: ${error instanceof Error ? error.message : String(error)}`
                )

                await flushRunResources()
                process.exit(1)
            }
        })
    }

    private async runTasks(accounts: Account[], runStartTime: number): Promise<AccountStats[]> {
        const accountStats: AccountStats[] = []

        for (const [accountIndex, account] of accounts.entries()) {
            if (accountIndex > 0) {
                await this.waitBeforeNextAccount(account.email)
            }
            this.bot.cancellation.signal.throwIfAborted()

            const accountStartTime = Date.now()
            const accountEmail = account.email
            this.bot.userData.userName = accountEmail
            this.bot.userData.timezone = ''
            this.bot.userData.timezoneOffset = ''
            this.bot.accountState.reset()

            try {
                const cachedRegion =
                    account.geoLocale === 'auto'
                        ? loadResolvedRegion(this.bot.config.sessionPath, accountEmail)
                        : undefined
                this.bot.accountLocale = resolveAccountLocale(account, cachedRegion)
                this.bot.userData.langCode = this.bot.accountLocale.language
                this.bot.userData.geoLocale = this.bot.accountLocale.country ?? 'US'

                this.bot.logger.info(
                    'main',
                    'ACCOUNT-START',
                    `Starting account: ${accountEmail} | geoLocale: ${account.geoLocale} | locale: ${this.bot.accountLocale.locale}${
                        cachedRegion ? ` | cachedRegion: ${cachedRegion}` : ''
                    }`
                )

                this.bot.http = new HttpClient(
                    account.proxy,
                    {
                        'Accept-Language': this.bot.accountLocale.acceptLanguage
                    },
                    {
                        signal: () => this.bot.signal,
                        onError: (error, request) => {
                            const host = new URL(request.url!).hostname
                            if (
                                ![
                                    'rewards.bing.com',
                                    'www.bing.com',
                                    'prod.rewardsplatform.microsoft.com',
                                    'login.live.com',
                                    'login.microsoftonline.com'
                                ].includes(host)
                            )
                                return
                            if (error.status === 401 || error.status === 403)
                                this.bot.accountState.defer(`Service rejected account access (HTTP ${error.status})`)
                            if (error.status === 429)
                                this.bot.accountState.defer(
                                    `Service rate limit; retry after ${error.retryAfterMs === undefined ? 'the service cooldown' : new Date(Date.now() + error.retryAfterMs).toISOString()}`
                                )
                        }
                    }
                )

                let runError = 'Flow failed'
                const result: AccountRunResult | undefined = await new AccountRunner(this.bot, this.createWorkflow)
                    .run(account)
                    .catch(error => {
                        runError = error instanceof Error ? error.message : String(error)
                        void this.bot.logger.error(
                            'main',
                            'FLOW',
                            `Account flow failed for ${accountEmail}: ${error instanceof Error ? error.message : String(error)}`
                        )
                        return undefined
                    })

                const durationSeconds = ((Date.now() - accountStartTime) / 1000).toFixed(1)

                if (result) {
                    const collectedPoints = result.collectedPoints
                    const pointsKnown = result.pointsKnown !== false
                    const accountInitialPoints = result.initialPoints
                    const accountFinalPoints = accountInitialPoints + collectedPoints

                    if (result.deferredReason) {
                        const deferredStatus = this.bot.activityResults.length ? 'partial' : 'skipped'
                        const stats: AccountStats = {
                            email: accountEmail,
                            initialPoints: accountInitialPoints,
                            finalPoints: accountFinalPoints,
                            collectedPoints,
                            pointsKnown,
                            duration: parseFloat(durationSeconds),
                            success: false,
                            status: deferredStatus,
                            error: result.deferredReason
                        }
                        accountStats.push(stats)
                        logAccountResult(this.bot, stats)
                    } else {
                        const stats: AccountStats = {
                            email: accountEmail,
                            initialPoints: accountInitialPoints,
                            finalPoints: accountFinalPoints,
                            collectedPoints,
                            pointsKnown,
                            duration: parseFloat(durationSeconds),
                            success: this.bot.accountIssues.size === 0,
                            status: this.bot.accountIssues.size ? 'partial' : 'completed',
                            error: this.bot.accountIssues.size
                                ? [...this.bot.accountIssues.values()].join('; ')
                                : undefined
                        }
                        accountStats.push(stats)
                        logAccountResult(this.bot, stats)
                    }
                } else {
                    const initialPoints = this.bot.accountState.initialBalance ?? 0
                    const currentBalance =
                        this.bot.accountState.initialBalance === null ? 0 : this.bot.userData.currentPoints
                    const status = this.bot.cancellation.signal.aborted ? 'cancelled' : 'failed'
                    const stats: AccountStats = {
                        email: accountEmail,
                        initialPoints,
                        finalPoints: currentBalance,
                        collectedPoints: currentBalance - initialPoints,
                        pointsKnown: false,
                        duration: parseFloat(durationSeconds),
                        success: false,
                        status,
                        error: runError
                    }
                    accountStats.push(stats)
                    logAccountResult(this.bot, stats)
                }
            } catch (error) {
                const durationSeconds = ((Date.now() - accountStartTime) / 1000).toFixed(1)
                this.bot.logger.error(
                    'main',
                    'ACCOUNT-ERROR',
                    `${accountEmail}: ${error instanceof Error ? error.message : String(error)}`
                )

                const stats: AccountStats = {
                    email: accountEmail,
                    initialPoints: 0,
                    finalPoints: 0,
                    collectedPoints: 0,
                    pointsKnown: false,
                    duration: parseFloat(durationSeconds),
                    success: false,
                    status: 'failed',
                    error: error instanceof Error ? error.message : String(error)
                }
                accountStats.push(stats)
                logAccountResult(this.bot, stats)
            }
        }

        if (this.bot.config.clusters <= 1 && cluster.isPrimary) {
            logRunResult(
                this.bot.logger,
                this.accounts.length,
                accountStats,
                runStartTime,
                this.bot.cancellation.signal.aborted
            )

            await flushRunResources()
            process.exitCode = this.bot.cancellation.signal.aborted ? 143 : 0
        }

        return accountStats
    }

    private async waitBeforeNextAccount(nextEmail?: string): Promise<void> {
        const { min, max } = this.bot.config.accountDelay
        const minMs = typeof min === 'number' ? min : this.bot.utils.parseDuration(min)
        const maxMs = typeof max === 'number' ? max : this.bot.utils.parseDuration(max)

        if (minMs < 0 || maxMs < 0 || maxMs < minMs) {
            throw new Error('accountDelay must use non-negative values with max greater than or equal to min')
        }

        const delayMs = this.bot.utils.randomNumber(Math.ceil(minMs), Math.floor(maxMs))
        this.bot.logger.info(
            'main',
            'ACCOUNT-DELAY',
            `Waiting ${(delayMs / 1000).toFixed(1)} seconds before starting the next account${
                nextEmail ? ` (${nextEmail})` : ''
            } | waitMs=${delayMs}`
        )
        await delay(delayMs, undefined, { signal: this.bot.cancellation.signal })
    }
}
