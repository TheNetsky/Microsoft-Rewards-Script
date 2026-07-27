import { MicrosoftRewardsBot, executionContext } from '../index'
import type { Account } from '../interface/Account'
import { URLs } from '../constants/urls'

interface SearchPlan {
    doMobile: boolean
    doDesktop: boolean
    mobileMissing: number
    desktopMissing: number
}

export class SearchManager {
    constructor(private bot: MicrosoftRewardsBot) {}

    async getSearchPoints(): Promise<SearchPlan> {
        const counters = await this.bot.browser.func.getSearchPoints()
        const mobileMissing = this.bot.browser.func.missingSearchPoints(counters, true).totalPoints
        const desktopMissing = this.bot.browser.func.missingSearchPoints(counters, false).totalPoints

        const doMobile = this.bot.config.workers.doMobileSearch && mobileMissing > 0
        const doDesktop = this.bot.config.workers.doDesktopSearch && desktopMissing > 0

        this.bot.logger.info(
            'main',
            'SEARCH-MANAGER',
            `Mobile: ${
                !this.bot.config.workers.doMobileSearch
                    ? 'skip (disabled)'
                    : mobileMissing <= 0
                      ? 'skip (no points)'
                      : `run (missing ${mobileMissing})`
            } | Desktop: ${
                !this.bot.config.workers.doDesktopSearch
                    ? 'skip (disabled)'
                    : desktopMissing <= 0
                      ? 'skip (no points)'
                      : `run (missing ${desktopMissing})`
            }`
        )

        return { doMobile, doDesktop, mobileMissing, desktopMissing }
    }

    searchMobile(account: Account): Promise<number> {
        return this.search(account, true)
    }

    searchDesktop(account: Account): Promise<number> {
        return this.search(account, false)
    }

    private search(account: Account, isMobile: boolean): Promise<number> {
        const platform = isMobile ? 'Mobile' : 'Desktop'
        const page = isMobile ? this.bot.mainMobilePage : this.bot.mainDesktopPage

        return executionContext.run({ isMobile, account }, async () => {
            try {
                return await this.bot.activities.doSearch(page, isMobile)
            } catch (error) {
                this.bot.logger.error(
                    'main',
                    'SEARCH-MANAGER',
                    `${platform} search failed | ${error instanceof Error ? error.message : String(error)}`
                )
                return 0
            }
        })
    }

    async bonusMobile(account: Account): Promise<number> {
        this.bot.logger.info('main', 'SEARCH-MANAGER', 'Starting bonus search farming')

        const gained = await executionContext.run({ isMobile: true, account }, async () => {
            try {
                return await this.bot.activities.doBonusSearches(this.bot.mainMobilePage)
            } catch (error) {
                this.bot.logger.error(
                    'main',
                    'SEARCH-MANAGER',
                    `Bonus search failed | ${error instanceof Error ? error.message : String(error)}`
                )
                return 0
            } finally {
                if (!this.bot.mainMobilePage.isClosed()) {
                    await this.bot.mainMobilePage.goto(URLs.bing.origin).catch(() => {})
                }
            }
        })

        this.bot.logger.info(
            'main',
            'SEARCH-MANAGER',
            `Bonus search summary | pointsGained=${gained} | currentBalance=${this.bot.userData.currentPoints}`
        )
        return gained
    }
}
