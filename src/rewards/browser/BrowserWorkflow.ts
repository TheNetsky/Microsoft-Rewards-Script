import type { AccountWorkflow } from '../../core/AccountWorkflow'
import type { BotContext } from '../../core/BotContext'
import type { Account } from '../../core/Account'
import type { AccountRunResult } from '../../core/RunTypes'
import type { RewardsState } from '../types/RewardsState'
import { AppActivityRunner } from '../app/AppActivityRunner'
import { createBrowserPlan, type BrowserPlan } from './BrowserPlan'
import { executionContext } from '../../core/ExecutionContext'
import { markConfirmedBrowserOffers } from './BrowserTaskPass'
import { EdgeTask } from '../shared/edge/EdgeTask'
import { BrowserSearchApiReport } from './search/BrowserSearchApiReport'

interface MobileResult {
    mobilePoints: number | null
    bonusPoints: number | null
}

export class BrowserWorkflow implements AccountWorkflow {
    private readonly confirmed = new Set<string>()
    private readonly edgeBrowsing: EdgeTask

    constructor(private readonly bot: BotContext) {
        this.edgeBrowsing = new EdgeTask(bot)
    }

    async run(account: Account, initialData: RewardsState): Promise<AccountRunResult> {
        const initialPoints = initialData.dashboard.userStatus.availablePoints
        const parallel = this.bot.config.searchSettings.parallelSearching
        let desktopPoints: number | null = 0
        let mobile: MobileResult = { mobilePoints: 0, bonusPoints: 0 }
        let finalPoints: number
        const apiSearchReport = new BrowserSearchApiReport(this.bot)
        let apiReportPoints: number | null | undefined

        try {
            const earnable = await this.bot.rewards.getWebPoints(initialData)
            const workers = this.bot.config.workers
            const appWorkers = workers.doDailyCheckIn || workers.doAppPromotions || workers.doReadToEarn
            this.bot.logger.event(
                'main',
                'POINTS',
                `Earnable today | Mobile: ${earnable.mobileSearchAvailable ? earnable.mobileSearchPoints : 'unknown'}` +
                    ` | Browser: ${earnable.desktopSearchAvailable ? earnable.desktopSearchPoints : 'unknown'}` +
                    ` | App: ${appWorkers ? 'pending mobile sign-in' : 'disabled'} | ${account.email} | locale: ${this.bot.accountLocale.locale}`,
                {
                    kind: 'quota',
                    mobile: earnable.mobileSearchAvailable ? earnable.mobileSearchPoints : null,
                    browser: earnable.desktopSearchAvailable ? earnable.desktopSearchPoints : null,
                    app: appWorkers ? null : 0,
                    appState: appWorkers ? 'pending' : 'disabled',
                    locale: this.bot.accountLocale.locale
                }
            )
            this.edgeBrowsing.start(initialData)
            const taskData = await this.runWebTasks(initialData)
            const plan = await this.plan(taskData)
            this.bot.logger.debug(
                'main',
                'BROWSER-MODE',
                parallel
                    ? 'Parallel searching: desktop searches while mobile runs app tasks, remaining tasks and searches'
                    : 'Sequential sessions: finish and close desktop before opening mobile'
            )

            const runDesktop = async (): Promise<void> => {
                try {
                    if (plan.doDesktop) desktopPoints = await this.bot.searchManager.searchDesktop(account)
                } finally {
                    if (!this.bot.signal.aborted) apiReportPoints = await apiSearchReport.run(account)
                }
            }

            if (parallel) {
                const results = await Promise.allSettled([
                    runDesktop(),
                    (async () => {
                        if (plan.needsMobileSession) mobile = await this.runMobile(account, plan, taskData)
                    })()
                ])
                const failed = results.find(result => result.status === 'rejected')
                if (failed?.status === 'rejected') throw failed.reason
                finalPoints = await this.finishBalance()
                if (this.edgeBrowsing.running) {
                    await this.edgeBrowsing.wait()
                    finalPoints = await this.finishBalance()
                }
                await this.bot.sessions.closePlatform(account, false)
            } else {
                await runDesktop()
                const afterDesktop = await this.finishPhase()
                const mobilePlan = await this.plan(afterDesktop)
                finalPoints = afterDesktop.dashboard.userStatus.availablePoints
                if (!mobilePlan.needsMobileSession) {
                    if (this.edgeBrowsing.running || apiReportPoints !== undefined) {
                        await this.edgeBrowsing.wait()
                        finalPoints = await this.finishBalance()
                    }
                }
                await this.edgeBrowsing.desktopReleased()
                await this.bot.sessions.closePlatform(account, false)

                if (mobilePlan.needsMobileSession) {
                    mobile = await this.runMobile(account, mobilePlan, afterDesktop, async () => {
                        await this.edgeBrowsing.wait()
                        finalPoints = await this.finishBalance()
                    })
                } else {
                    this.bot.logger.debug(
                        'main',
                        'BROWSER-MODE',
                        'Mobile skipped: no remaining tasks, mobile searches or app work'
                    )
                }
            }

            this.bot.searchManager.logSummary({
                mobile: mobile.mobilePoints,
                desktop: desktopPoints,
                bonus: mobile.bonusPoints,
                ...(apiReportPoints !== undefined ? { apiReport: apiReportPoints } : {})
            })
            const collectedPoints = finalPoints - initialPoints
            this.bot.logger.debug(
                'main',
                'FLOW',
                `Points collected | pointsGained=${collectedPoints} | currentBalance=${finalPoints} | account=${account.email}`
            )
            return { initialPoints, collectedPoints }
        } finally {
            try {
                if (!this.bot.signal.aborted) await apiSearchReport.run(account)
            } finally {
                await this.edgeBrowsing.cancel()
            }
        }
    }

    private runMobile(
        account: Account,
        plan: BrowserPlan,
        data: RewardsState,
        finish?: () => Promise<void>
    ): Promise<MobileResult> {
        return executionContext.run({ isMobile: true, account }, async () => {
            try {
                await this.bot.sessions.signIn(account, true, plan.appApiWorkers.length > 0)
                this.bot.logger.info(
                    'main',
                    'BROWSER-MODE',
                    `Mobile opened for: ${plan.mobileSessionReasons.join(', ')}`
                )
                await this.runAppTasks()
                await this.runWebTasks(data)
                const searches = await this.plan()
                const result: MobileResult = {
                    mobilePoints: searches.doMobile ? await this.bot.searchManager.searchMobile(account) : 0,
                    bonusPoints: searches.doBonusSearches ? await this.bot.searchManager.bonusMobile(account) : 0
                }
                await finish?.()
                return result
            } finally {
                await this.bot.sessions.closePlatform(account, true)
            }
        })
    }

    private async plan(data?: RewardsState): Promise<BrowserPlan> {
        data ??= await this.bot.rewards.getTaskData()
        data = markConfirmedBrowserOffers(data, this.confirmed)
        const searches = await this.bot.searchManager.planSearches(data)
        return createBrowserPlan(
            this.bot.config,
            searches,
            data.dashboard,
            this.bot.utils.formatDate(Date.now(), this.bot.userData.timezone)
        )
    }

    private async runWebTasks(data: RewardsState): Promise<RewardsState> {
        const run = this.bot.mode.actions.runWebTasks
        if (!run) throw new Error('Browser task runner unavailable')
        return run(data, this.confirmed)
    }

    private async runAppTasks(): Promise<void> {
        const app = new AppActivityRunner(this.bot)
        const prepared = await app.prepare()
        await app.run(prepared)
    }

    private async finishBalance(): Promise<number> {
        if (this.bot.config.workers.doClaimBonusPoints) await this.bot.activities.claimBonusPoints()
        await this.bot.rewards.logStreaks()
        return this.bot.rewards.getCurrentPoints()
    }

    private async finishPhase(): Promise<RewardsState> {
        if (this.bot.config.workers.doClaimBonusPoints) await this.bot.activities.claimBonusPoints()
        const data = await this.bot.rewards.getTaskData()
        this.bot.userData.currentPoints = data.dashboard.userStatus.availablePoints
        await this.bot.rewards.logStreaks()
        return data
    }
}
