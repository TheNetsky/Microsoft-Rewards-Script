import type { WorkflowFactory } from './AccountWorkflow'
import { AccountDeferredError } from './AccountState'
import type { BotContext } from './BotContext'
import type { Account } from './Account'
import type { AccountRunResult } from './RunTypes'
import type { RewardsState } from '../rewards/types/RewardsState'
import { createAppIdentity } from '../rewards/app/AppIdentity'
import { normalizeCountry, resolveAccountLocale } from '../util/Locale'
import { saveResolvedRegion } from '../session/SessionStore'
import { executionContext } from './ExecutionContext'

export class AccountRunner {
    constructor(
        private readonly bot: BotContext,
        private readonly createWorkflow: WorkflowFactory
    ) {}

    async run(account: Account): Promise<AccountRunResult> {
        const accountEmail = account.email
        this.bot.logger.debug('main', 'FLOW', `Starting session for ${accountEmail}`)

        this.bot.cancellation?.signal.throwIfAborted()
        this.bot.accountState.reset()
        this.bot.userData.initialPoints = 0
        this.bot.userData.currentPoints = 0
        this.bot.accessTokens = { mobile: '', desktop: '' }
        this.bot.appIdentity = createAppIdentity(accountEmail)
        this.bot.browser.userAgentManager.reset()
        this.bot.cookies = { mobile: [], desktop: [] }
        this.bot.resetRewardsPageStates()
        this.bot.searchTopicsCache = null
        this.bot.attemptedPunchcardChildren.clear()
        this.bot.rewards.reset()

        try {
            return await executionContext.run({ isMobile: false, account }, async () => {
                await this.bot.sessions.signIn(account, false, this.bot.config.experimental.edgeBrowsing)
                this.bot.logger.debug(
                    'main',
                    'FLOW',
                    `Desktop signed in; session saved | rewardsMode=${this.bot.config.rewardsMode}`
                )

                const workflow = this.createWorkflow(this.bot)
                await workflow.afterLogin?.(account)

                const data: RewardsState = await this.bot.rewards.getDashboardData()
                this.bot.logger.debug(
                    'main',
                    'GET-DASHBOARD-DATA',
                    `User data loaded | source=${data.sourceInfo.source} | rewardsMode=${this.bot.config.rewardsMode}` +
                        ` | currentBalance=${data.dashboard.userStatus.availablePoints}` +
                        ` | warnings=${data.dashboard.userWarnings.map(warning => warning.name).join(',') || (data.sourceInfo.missingSections.includes('userWarnings') ? 'unavailable' : 'none')}`
                )
                this.bot.userData.initialPoints = data.dashboard.userStatus.availablePoints
                this.bot.userData.currentPoints = data.dashboard.userStatus.availablePoints
                this.bot.signal.throwIfAborted()

                const profileCountry = normalizeCountry(data.dashboard.userProfile.attributes.country)

                if (account.geoLocale === 'auto') {
                    if (profileCountry) {
                        saveResolvedRegion(this.bot.config.sessionPath, accountEmail, profileCountry)
                    } else {
                        this.bot.logger.warn(
                            'main',
                            'GEO-LOCALE',
                            `Microsoft profile returned an invalid country; retaining ${
                                this.bot.accountLocale.country ?? 'US fallback'
                            }`
                        )
                    }
                }

                this.bot.accountLocale = resolveAccountLocale(account, profileCountry ?? this.bot.accountLocale.country)
                this.bot.userData.langCode = this.bot.accountLocale.language
                this.bot.userData.geoLocale = this.bot.accountLocale.country ?? 'US'
                this.bot.http.setDefaultHeaders({
                    'Accept-Language': this.bot.accountLocale.acceptLanguage
                })

                if (this.bot.config.ensureStreakProtection) {
                    await this.bot.activities.ensureStreakProtection()
                    this.bot.observeStreaks(this.bot.reactSnapshot?.streaks ?? [])
                }

                return await workflow.run(account, data)
            })
        } catch (error) {
            const reason = this.bot.accountState.signal.reason
            if (!(reason instanceof AccountDeferredError)) throw error
            return {
                initialPoints: this.bot.userData.initialPoints,
                collectedPoints: this.bot.userData.currentPoints - this.bot.userData.initialPoints,
                pointsKnown: false,
                deferredReason: reason.reason
            }
        } finally {
            await this.bot.sessions.closeAll()
        }
    }
}
