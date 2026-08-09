import cluster, { Worker } from 'cluster'

import type { Account } from '../interface/Account'
import type { IpcLog } from '../logging/Logger'
import { loadResolvedRegion } from '../util/SessionStore'
import { resolveAccountLocale } from '../util/Locale'
import { flushAllWebhooks } from './WebhookLifecycle'
import type { MicrosoftRewardsBot } from './MicrosoftRewardsBot'
import type { AccountStats } from './types'
import { sendDiscord } from '../logging/Discord'
import { sendNtfy } from '../logging/Ntfy'
import { sendTelegram } from '../logging/Telegram'
import HttpClient from '../util/Http'

export class ExecutionRuntime {
    private activeWorkers: number
    private exitedWorkers: number[]

    constructor(private readonly bot: MicrosoftRewardsBot) {
        this.activeWorkers = this.bot.config.clusters
        this.exitedWorkers = []
    }

    async run(): Promise<void> {
        const totalAccounts = this.bot.accounts.length
        const runStartTime = Date.now()

        this.bot.logger.info(
            'main',
            'RUN-START',
            `Starting Microsoft Rewards Script | v${this.bot.pkgVersion} | Accounts: ${totalAccounts} | Clusters: ${this.bot.config.clusters}`
        )

        if (this.bot.config.clusters > 1) {
            if (cluster.isPrimary) {
                await this.runMaster(runStartTime)
            } else {
                this.runWorker(runStartTime)
            }
        } else {
            await this.runTasks(this.bot.accounts, runStartTime)
        }
    }

    private async runMaster(runStartTime: number): Promise<void> {
        void this.bot.logger.info('main', 'CLUSTER-PRIMARY', `Primary process started | PID: ${process.pid}`)

        const rawChunks = this.bot.utils.chunkArray(this.bot.accounts, this.bot.config.clusters)
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
                    const { webhook } = this.bot.config
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

            this.bot.logger.warn(
                'main',
                'CLUSTER-WORKER-EXIT',
                `Worker ${pid} exit | Code: ${code ?? 'n/a'} | Signal: ${signal ?? 'n/a'} | Active workers: ${this.activeWorkers}`
            )

            if (this.activeWorkers <= 0) {
                const summary = this.summarizeStats(allAccountStats, runStartTime)

                this.bot.logger.info(
                    'main',
                    'RUN-END',
                    `Completed all accounts | accountsProcessed=${summary.accountsProcessed} | pointsGained=${summary.totalCollectedPoints} | previousBalance=${summary.totalInitialPoints} | currentBalance=${summary.totalFinalPoints} | runtimeMinutes=${summary.totalDurationMinutes}`,
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
            this.bot.logger.warn('main', 'CLUSTER-WORKER-DISCONNECT', `Worker ${pid ?? '?'} disconnected`)
        })
    }

    private runWorker(runStartTimeFromMaster?: number): void {
        void this.bot.logger.info('main', 'CLUSTER-WORKER-START', `Worker spawned | PID: ${process.pid}`)

        process.on('message', async ({ chunk, runStartTime }: { chunk: Account[]; runStartTime: number }) => {
            void this.bot.logger.info(
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
                this.bot.logger.error(
                    'main',
                    'CLUSTER-WORKER-ERROR',
                    `Worker task crash: ${error instanceof Error ? error.message : String(error)}`
                )

                await flushAllWebhooks()
                process.exit(1)
            }
        })
    }

    async runTasks(accounts: Account[], runStartTime: number): Promise<AccountStats[]> {
        const accountStats: AccountStats[] = []

        for (const [accountIndex, account] of accounts.entries()) {
            if (accountIndex > 0) {
                await this.waitBeforeNextAccount(account.email)
            }

            const accountStartTime = Date.now()
            const accountEmail = account.email
            this.bot.userData.userName = this.bot.utils.getEmailUsername(accountEmail)
            this.bot.userData.timezoneOffset = String(new Date().getTimezoneOffset())

            try {
                const cachedRegion =
                    account.geoLocale === 'auto' ? loadResolvedRegion(this.bot.config.sessionPath, accountEmail) : undefined
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

                this.bot.http = new HttpClient(account.proxy, {
                    'Accept-Language': this.bot.accountLocale.acceptLanguage
                })

                const result: { initialPoints: number; collectedPoints: number } | undefined = await this.bot
                    .Main(account)
                    .catch(error => {
                        void this.bot.logger.error(
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

                    accountStats.push(this.createAccountStats(accountEmail, accountInitialPoints, accountFinalPoints, collectedPoints, parseFloat(durationSeconds), true))

                    this.bot.logger.info(
                        'main',
                        'ACCOUNT-END',
                        `Completed account: ${accountEmail} | pointsGained=${collectedPoints} | previousBalance=${accountInitialPoints} | currentBalance=${accountFinalPoints} | durationSeconds=${durationSeconds}`,
                        'green'
                    )
                } else {
                    accountStats.push(this.createAccountStats(accountEmail, 0, 0, 0, parseFloat(durationSeconds), false, 'Flow failed'))
                }
            } catch (error) {
                const durationSeconds = ((Date.now() - accountStartTime) / 1000).toFixed(1)
                this.bot.logger.error(
                    'main',
                    'ACCOUNT-ERROR',
                    `${accountEmail}: ${error instanceof Error ? error.message : String(error)}`
                )

                accountStats.push(
                    this.createAccountStats(
                        accountEmail,
                        0,
                        0,
                        0,
                        parseFloat(durationSeconds),
                        false,
                        error instanceof Error ? error.message : String(error)
                    )
                )
            }
        }

        if (this.bot.config.clusters <= 1 && cluster.isPrimary) {
            const summary = this.summarizeStats(accountStats, runStartTime)

            this.bot.logger.info(
                'main',
                'RUN-END',
                `Completed all accounts | accountsProcessed=${summary.accountsProcessed} | pointsGained=${summary.totalCollectedPoints} | previousBalance=${summary.totalInitialPoints} | currentBalance=${summary.totalFinalPoints} | runtimeMinutes=${summary.totalDurationMinutes}`,
                'green'
            )

            await flushAllWebhooks()
            process.exit(0)
        }

        return accountStats
    }

    private createAccountStats(
        email: string,
        initialPoints: number,
        finalPoints: number,
        collectedPoints: number,
        duration: number,
        success: boolean,
        error?: string
    ): AccountStats {
        return {
            email,
            initialPoints,
            finalPoints,
            collectedPoints,
            duration,
            success,
            ...(error ? { error } : {})
        }
    }

    private summarizeStats(stats: AccountStats[], runStartTime: number) {
        return {
            accountsProcessed: stats.length,
            totalCollectedPoints: stats.reduce((sum, stat) => sum + stat.collectedPoints, 0),
            totalInitialPoints: stats.reduce((sum, stat) => sum + stat.initialPoints, 0),
            totalFinalPoints: stats.reduce((sum, stat) => sum + stat.finalPoints, 0),
            totalDurationMinutes: ((Date.now() - runStartTime) / 1000 / 60).toFixed(1)
        }
    }

    private async waitBeforeNextAccount(nextEmail?: string): Promise<void> {
        const { min, max } = this.bot.config.accountDelay
        const minMs = typeof min === 'number' ? min : this.bot.utils.stringToNumber(min)
        const maxMs = typeof max === 'number' ? max : this.bot.utils.stringToNumber(max)

        if (minMs < 0 || maxMs < 0 || maxMs < minMs) {
            throw new Error('accountDelay must use non-negative values with max greater than or equal to min')
        }

        const delayMs = this.bot.utils.randomNumber(Math.ceil(minMs), Math.floor(maxMs))
        this.bot.logger.info(
            'main',
            'ACCOUNT-DELAY',
            `Waiting ${(delayMs / 1000).toFixed(1)} seconds before starting the next account${
                nextEmail ? ` (${nextEmail})` : ''
            }`
        )
        await this.bot.utils.wait(delayMs)
    }
}
