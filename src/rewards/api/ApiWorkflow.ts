import type { AccountWorkflow } from '../../core/AccountWorkflow'
import type { BotContext } from '../../core/BotContext'
import type { Account } from '../../core/Account'
import type { AccountRunResult } from '../../core/RunTypes'
import { findActiveSearchBonus } from '../shared/search/SearchBonus'
import type { RewardsState } from '../types/RewardsState'
import { AppActivityRunner } from '../app/AppActivityRunner'
import { EdgeTask } from '../shared/edge/EdgeTask'
import { executionContext } from '../../core/ExecutionContext'

export class ApiWorkflow implements AccountWorkflow {
    private readonly edgeBrowsing: EdgeTask

    constructor(private readonly bot: BotContext) {
        this.edgeBrowsing = new EdgeTask(bot)
    }

    afterLogin(account: Account): Promise<void> {
        return this.closeLogin(account, false)
    }

    private async closeLogin(account: Account, isMobile: boolean): Promise<void> {
        await this.bot.sessions.closePlatform(account, isMobile)
        this.bot.logger.info(
            'main',
            'FLOW',
            `${isMobile ? 'Mobile' : 'Desktop'} sign-in browser closed; continuing with its saved cookies over HTTP`
        )
    }

    async run(account: Account, data: RewardsState): Promise<AccountRunResult> {
        const { workers, searchSettings } = this.bot.config
        const initialPoints = data.dashboard.userStatus.availablePoints
        const appWorkers = workers.doDailyCheckIn || workers.doAppPromotions || workers.doReadToEarn
        const doBonus =
            workers.doBonusSearches &&
            searchSettings.maxBonusSearches > 0 &&
            Boolean(findActiveSearchBonus(data.dashboard))
        let desktopPoints: number | null = 0
        let mobilePoints: number | null = 0
        let bonusPoints: number | null = 0

        try {
            const initialSearches = await this.bot.searchManager.planSearches(data)
            const mobileSearch =
                workers.doMobileSearch && (!initialSearches.mobileQuotaKnown || initialSearches.doMobile)
            const mobileNeeded =
                appWorkers ||
                (workers.doPunchCards && Boolean(data.dashboard.punchCards?.length)) ||
                mobileSearch ||
                doBonus
            if (mobileNeeded) {
                await this.bot.sessions.signIn(account, true, appWorkers)
                await this.closeLogin(account, true)
            }
            this.bot.signal.throwIfAborted()

            const earnable = await this.bot.rewards.getWebPoints(data)
            this.bot.logger.event(
                'main',
                'POINTS',
                `Earnable today | Mobile: ${initialSearches.mobileQuotaKnown ? earnable.mobileSearchPoints : 'unknown'}` +
                    ` | Browser: ${initialSearches.desktopQuotaKnown ? earnable.desktopSearchPoints : 'unknown'}` +
                    ` | App: ${appWorkers ? 'pending app data' : 'disabled'} | ${account.email} | locale: ${this.bot.accountLocale.locale}`,
                {
                    kind: 'quota',
                    mobile: initialSearches.mobileQuotaKnown ? earnable.mobileSearchPoints : null,
                    browser: initialSearches.desktopQuotaKnown ? earnable.desktopSearchPoints : null,
                    app: appWorkers ? null : 0,
                    appState: appWorkers ? 'pending' : 'disabled',
                    locale: this.bot.accountLocale.locale
                }
            )

            let taskData = data
            if (workers.doDailySet) taskData = await this.bot.activities.runDailySet(taskData)
            this.edgeBrowsing.start(taskData)
            await this.runDesktopTasks(account, taskData)
            const desktopSearches = await this.bot.searchManager.planSearches()

            const desktopWork = async (): Promise<void> => {
                if (desktopSearches.doDesktop) desktopPoints = await this.bot.searchManager.searchDesktop(account)
            }

            const mobileWork = (): Promise<void> =>
                executionContext.run({ isMobile: true, account }, async () => {
                    this.bot.signal.throwIfAborted()
                    const appRunner = new AppActivityRunner(this.bot)
                    const app = await appRunner.prepare()
                    await appRunner.run(app)
                    const mobileData = await this.bot.rewards.getDashboardData()
                    if (workers.doPunchCards) await this.bot.activities.runMobilePunchCards(mobileData)
                    const mobileSearches = await this.bot.searchManager.planSearches(mobileData)
                    if (mobileSearches.doMobile) mobilePoints = await this.bot.searchManager.searchMobile(account)
                    if (doBonus) bonusPoints = await this.bot.searchManager.bonusMobile(account)
                })

            if (searchSettings.parallelSearching && mobileNeeded) {
                this.bot.logger.debug(
                    'main',
                    'FLOW',
                    'Parallel HTTP work: desktop searches while mobile runs app tasks and searches; browsers are closed'
                )
                const results = await Promise.allSettled([desktopWork(), mobileWork()])
                const failed = results.find(result => result.status === 'rejected')
                if (failed?.status === 'rejected') throw failed.reason
            } else {
                await desktopWork()
                if (mobileNeeded) await mobileWork()
            }

            this.bot.searchManager.logSummary({ mobile: mobilePoints, desktop: desktopPoints, bonus: bonusPoints })

            const finalPoints = await executionContext.run({ isMobile: mobileNeeded, account }, async () => {
                if (workers.doClaimBonusPoints) await this.bot.activities.claimBonusPoints()
                if (this.edgeBrowsing.running) {
                    await this.edgeBrowsing.wait()
                    if (workers.doClaimBonusPoints) await this.bot.activities.claimBonusPoints()
                }
                await this.bot.rewards.logStreaks()
                return this.bot.rewards.getCurrentPoints()
            })
            const collectedPoints = finalPoints - initialPoints

            this.bot.logger.debug(
                'main',
                'FLOW',
                `Points collected | pointsGained=${collectedPoints} | currentBalance=${finalPoints} | account=${account.email}`
            )

            return { initialPoints, collectedPoints }
        } finally {
            await this.edgeBrowsing.cancel()
        }
    }

    private runDesktopTasks(account: Account, data: RewardsState): Promise<void> {
        return executionContext.run({ isMobile: false, account }, async () => {
            const { workers } = this.bot.config
            if (workers.doPunchCards) await this.bot.activities.runDesktopPunchCards()
            if (workers.doActivateSearchPerk) await this.bot.activities.activateSearchPerk(data)
            if (workers.doMorePromotions) await this.bot.activities.runMorePromotions(data)
            if (workers.doVisualSearch) await this.bot.activities.runVisualSearch(data)
        })
    }
}
