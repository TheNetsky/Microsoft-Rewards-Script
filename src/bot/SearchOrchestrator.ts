import type { Account } from '../interface/Account'
import type { AppDashboardData } from '../interface/AppDashBoardData'
import type { DashboardData } from '../interface/DashboardData'
import type { MicrosoftRewardsBot } from './MicrosoftRewardsBot'
import { executionContext } from './ExecutionContextStore'
import { SessionManager } from './SessionManager'

export interface SearchExecutionResult {
    mobilePoints: number
    desktopPoints: number
    bonusPoints: number
}

interface SearchExecutionPlan {
    doMobile: boolean
    doDesktop: boolean
}

export class SearchOrchestrator {
    constructor(
        private readonly bot: MicrosoftRewardsBot,
        private readonly sessions: SessionManager,
        private readonly account: Account,
        private readonly accountEmail: string,
        private readonly data: DashboardData,
        private readonly appData: AppDashboardData | null,
        private readonly appAvailable: boolean,
        private readonly fullApi: boolean,
        private readonly apiSearch: boolean,
        private readonly doVisualSearch: boolean,
        private readonly doBonus: boolean
    ) {}

    async run(): Promise<SearchExecutionResult> {
        const plan = await this.bot.searchManager.getSearchPoints()
        const result = this.fullApi
            ? await this.runFullApiWorkflow(plan)
            : await this.runLegacyWorkflow(plan, this.bot.config.searchSettings.parallelSearching)

        this.bot.logger.info(
            'main',
            'SEARCH-MANAGER',
            `Search summary | mobile=${result.mobilePoints} | desktop=${result.desktopPoints} | bonus=${result.bonusPoints} | total=${
                result.mobilePoints + result.desktopPoints + result.bonusPoints
            }`
        )

        return result
    }

    private async runFullApiWorkflow(plan: SearchExecutionPlan): Promise<SearchExecutionResult> {
        await this.runFullApiPreparation()

        if (this.shouldOpenDesktopBrowser(plan.doDesktop, true)) {
            await this.runDesktopBrowserWorkflow()
        }

        await this.runLateActivities()
        return this.runSequentialSearches(plan, { closeMobileAtEnd: false, runDesktopSearchInsideBrowser: false }, true)
    }

    private async runLegacyWorkflow(plan: SearchExecutionPlan, parallel: boolean): Promise<SearchExecutionResult> {
        await this.runLegacyPreparation()

        if (parallel && !this.apiSearch && plan.doMobile && plan.doDesktop) {
            return this.runParallelSearches()
        }

        return this.runSequentialSearches(plan, { closeMobileAtEnd: true, runDesktopSearchInsideBrowser: true }, false)
    }

    private async runFullApiPreparation(): Promise<void> {
        await this.runPreparation({ includeActivateSearchPerk: true, includePunchCards: true })
    }

    private async runLegacyPreparation(): Promise<void> {
        await this.runPreparation({
            includeDailySet: true,
            includeActivateSearchPerk: true,
            includeMorePromotions: true,
            includeAppPromotions: true,
            includePunchCards: true
        })
    }

    private async runLateActivities(): Promise<void> {
        await this.runPreparation({ includeDailySet: true, includeMorePromotions: true, includeAppPromotions: true })
    }

    private async runPreparation(options: {
        includeDailySet?: boolean
        includeActivateSearchPerk?: boolean
        includeMorePromotions?: boolean
        includeAppPromotions?: boolean
        includePunchCards?: boolean
    }): Promise<void> {
        if (this.bot.config.ensureStreakProtection) {
            await this.bot.activities.doEnsureStreakProtection()
        }
        if (options.includeDailySet && this.bot.config.workers.doDailySet) {
            await this.bot.workers.doDailySet(this.data)
        }
        if (options.includeActivateSearchPerk && this.bot.config.workers.doActivateSearchPerk) {
            await this.bot.activities.doActivateSearchPerk(this.data)
        }
        if (options.includeMorePromotions && this.bot.config.workers.doMorePromotions) {
            await this.bot.workers.doMorePromotions(this.data)
        }
        if (options.includeAppPromotions) {
            await this.runAppPromotionActivities()
        }
        if (options.includePunchCards && this.bot.config.workers.doPunchCards) {
            await this.bot.punchcardManager.runMobile(this.data)
        }
    }

    private async runAppPromotionActivities(): Promise<void> {
        if (!this.appAvailable) return

        if (this.bot.config.workers.doDailyCheckIn) {
            await this.bot.activities.doDailyCheckIn()
        }
        if (this.bot.config.workers.doAppPromotions && this.appData) {
            await this.bot.workers.doAppPromotions(this.appData)
        }
        if (this.bot.config.workers.doReadToEarn) {
            await this.bot.activities.doReadToEarn()
        }
    }

    private async runParallelSearches(): Promise<SearchExecutionResult> {
        await this.runDesktopBrowserWorkflow()

        const mobileWork = async (): Promise<[number, number]> => {
            try {
                const searchPoints = await this.bot.searchManager.searchMobile(this.account)
                const extraPoints = this.doBonus ? await this.bot.searchManager.bonusMobile(this.account) : 0
                return [searchPoints, extraPoints]
            } finally {
                await this.sessions.closeMobileSession(this.account, this.accountEmail)
            }
        }

        const desktopWork = async (): Promise<number> => {
            try {
                return await this.bot.searchManager.searchDesktop(this.account)
            } finally {
                await this.sessions.closeDesktopSession(this.account, this.accountEmail)
            }
        }

        const [[mobilePoints, bonusPoints], desktopPoints] = await Promise.all([mobileWork(), desktopWork()])
        return { mobilePoints, desktopPoints, bonusPoints }
    }

    private async runSequentialSearches(
        plan: SearchExecutionPlan,
        options: { closeMobileAtEnd: boolean; runDesktopSearchInsideBrowser: boolean },
        fullApi: boolean
    ): Promise<SearchExecutionResult> {
        if (this.apiSearch) {
            await this.sessions.closeMobileSession(this.account, this.accountEmail)
        }

        const mobilePoints = plan.doMobile ? await this.bot.searchManager.searchMobile(this.account) : 0
        const bonusPoints = plan.doMobile && this.doBonus ? await this.bot.searchManager.bonusMobile(this.account) : 0

        if (options.closeMobileAtEnd && !this.apiSearch) {
            await this.sessions.closeMobileSession(this.account, this.accountEmail)
        }

        let desktopPoints = 0
        if (this.shouldOpenDesktopBrowser(plan.doDesktop, fullApi)) {
            await this.runDesktopBrowserWorkflow(async () => {
                if (options.runDesktopSearchInsideBrowser && plan.doDesktop && !this.apiSearch) {
                    desktopPoints = await this.bot.searchManager.searchDesktop(this.account)
                }
            })
        }

        if (plan.doDesktop && this.apiSearch) {
            desktopPoints = await this.bot.searchManager.searchDesktop(this.account)
        }

        return { mobilePoints, desktopPoints, bonusPoints }
    }

    private shouldOpenDesktopBrowser(doDesktopSearch: boolean, fullApi: boolean): boolean {
        if (fullApi) {
            return this.bot.config.workers.doPunchCards || this.doVisualSearch
        }

        return this.bot.config.workers.doPunchCards || this.doVisualSearch || (doDesktopSearch && !this.apiSearch)
    }

    private async runDesktopBrowserWorkflow(callback?: () => Promise<void>): Promise<void> {
        await executionContext.run({ isMobile: false, account: this.account }, async () => {
            const desktopSession = await this.bot.createDesktopSession(this.account)
            this.sessions.setDesktopSession(desktopSession)

            await this.bot.punchcardManager.runDesktop()
            if (this.doVisualSearch) {
                await this.bot.activities.doVisualSearch(this.data)
            }
            if (callback) {
                await callback()
            }
        })

        await this.sessions.closeDesktopSession(this.account, this.accountEmail)
    }
}
