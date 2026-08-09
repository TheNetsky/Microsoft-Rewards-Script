import type { BrowserContext } from 'patchright'

import type { Account } from '../interface/Account'
import type { MicrosoftRewardsBot } from './MicrosoftRewardsBot'
import type { BrowserSession } from './types'
import { executionContext } from './ExecutionContextStore'
import { prepareAccountContext } from './AccountBootstrap'
import { SearchOrchestrator } from './SearchOrchestrator'
import { SessionManager } from './SessionManager'

export class AccountFlowRunner {
    constructor(private readonly bot: MicrosoftRewardsBot) {}

    async run(account: Account): Promise<{ initialPoints: number; collectedPoints: number }> {
        const accountEmail = account.email
        this.bot.logger.info('main', 'FLOW', `Starting session for ${accountEmail}`)

        this.bot.browser.func.resetHttpJars()
        this.bot.accessToken = ''

        const apiSearch = this.bot.config.experimental.apiSearch
        const fullApi = apiSearch && (this.bot.config.experimental.apiSearchOnBing || !this.bot.config.activities.searchOnBing)

        const sessions = new SessionManager(this.bot)
        let mobileSession: BrowserSession | null = null

        try {
            return await executionContext.run({ isMobile: true, account }, async () => {
                mobileSession = await this.bot.browserFactory.createBrowser(account)
                sessions.setMobileSession(mobileSession)
                const initialContext: BrowserContext = mobileSession.context
                this.bot.mainMobilePage = await initialContext.newPage()

                this.bot.logger.info('main', 'BROWSER', `Mobile Browser started | ${accountEmail}`)

                await this.bootstrapMobileSession(account, accountEmail, mobileSession, initialContext)

                if (fullApi) {
                    await sessions.closeMobileSession(account, accountEmail)
                    this.bot.logger.info('main', 'FLOW', 'Mobile login browser closed; continuing with the saved session and HTTP requests')
                }

                const { dashboardData, appData, initialPoints, appAvailable } = await prepareAccountContext(
                    this.bot,
                    account,
                    accountEmail
                )

                await this.runSearchFlow(sessions, account, accountEmail, dashboardData, appData, appAvailable, fullApi, apiSearch)

                const finalPoints = await this.bot.browser.func.getCurrentPoints()
                const collectedPoints = finalPoints - initialPoints

                this.bot.logger.info(
                    'main',
                    'FLOW',
                    `Points collected | pointsGained=${collectedPoints} | currentBalance=${finalPoints} | account=${accountEmail}`
                )

                return {
                    initialPoints,
                    collectedPoints: collectedPoints || 0
                }
            })
        } finally {
            await this.closeSessionSafely(() => sessions.closeMobileSession(account, accountEmail), 'Mobile')
            await this.closeSessionSafely(() => sessions.closeDesktopSession(account, accountEmail), 'Desktop')
        }
    }

    private async bootstrapMobileSession(
        account: Account,
        accountEmail: string,
        mobileSession: BrowserSession,
        initialContext: BrowserContext
    ): Promise<void> {
        await this.bot.login.login(this.bot.mainMobilePage, account)

        try {
            this.bot.accessToken = await this.bot.login.getAppAccessToken(this.bot.mainMobilePage, accountEmail)
        } catch (error) {
            this.bot.logger.error(
                'main',
                'FLOW',
                `Failed to get mobile access token: ${error instanceof Error ? error.message : String(error)}`
            )
            this.bot.accessToken = ''
        }

        await this.bot.browser.func.checkpointActiveSession('LOGIN-CHECKPOINT')
        this.bot.cookies.mobile = await initialContext.cookies()
        this.bot.fingerprintMobile = mobileSession.fingerprint
    }

    private async runSearchFlow(
        sessions: SessionManager,
        account: Account,
        accountEmail: string,
        dashboardData: Awaited<ReturnType<typeof prepareAccountContext>>['dashboardData'],
        appData: Awaited<ReturnType<typeof prepareAccountContext>>['appData'],
        appAvailable: boolean,
        fullApi: boolean,
        apiSearch: boolean
    ): Promise<void> {
        const searchOrchestrator = new SearchOrchestrator(
            this.bot,
            sessions,
            account,
            accountEmail,
            dashboardData,
            appData,
            appAvailable,
            fullApi,
            apiSearch,
            this.bot.config.workers.doVisualSearch,
            this.bot.config.workers.doBonusSearches
        )

        await searchOrchestrator.run()

        if (this.bot.config.workers.doClaimBonusPoints) {
            await this.bot.workers.doClaimBonusPoints()
        }
    }

    private async closeSessionSafely(closeSession: () => Promise<void>, label: 'Mobile' | 'Desktop'): Promise<void> {
        try {
            await closeSession()
        } catch (error) {
            this.bot.logger.debug(
                'main',
                'CLEANUP',
                `${label} context close failed | ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }
}
