import { MicrosoftRewardsBot, executionContext } from '../../../index'
import type { Account } from '../../../interface/Account'
import { URLs } from '../../../constants/urls'
import { SearchProgress, type SearchQuota } from './SearchProgress'

interface SearchPlan {
    doMobile: boolean
    doDesktop: boolean
    mobileMissing: number
    desktopMissing: number
}

export class SearchManager {
    private readonly progress: SearchProgress

    constructor(private bot: MicrosoftRewardsBot) {
        this.progress = new SearchProgress(bot)
    }

    async getSearchPoints(): Promise<SearchPlan> {
        const counters = await this.progress.getCounters()
        const quotas = this.progress.calculateQuotas(counters)
        const mobileMissing = quotas.mobile.remaining
        const desktopQuota = this.combineQuotas(quotas.desktop, quotas.edge)
        const desktopMissing = desktopQuota.remaining

        const doMobile = this.bot.config.workers.doMobileSearch && mobileMissing > 0
        const doDesktop = this.bot.config.workers.doDesktopSearch && desktopMissing > 0

        this.bot.logger.info(
            'main',
            'SEARCH-MANAGER',
            `移动端: ${this.describeQuota(this.bot.config.workers.doMobileSearch, quotas.mobile)}` +
                ` | 桌面端: ${this.describeQuota(this.bot.config.workers.doDesktopSearch, desktopQuota)}` +
                `${quotas.edge.max > 0 ? ` | Edge: ${quotas.edge.earned}/${quotas.edge.max}` : ''}`
        )

        return { doMobile, doDesktop, mobileMissing, desktopMissing }
    }

    private combineQuotas(...quotas: SearchQuota[]): SearchQuota {
        return quotas.reduce(
            (total, quota) => ({
                earned: total.earned + quota.earned,
                max: total.max + quota.max,
                remaining: total.remaining + quota.remaining
            }),
            { earned: 0, max: 0, remaining: 0 }
        )
    }

    private describeQuota(enabled: boolean, quota: SearchQuota): string {
        if (!enabled) return `skip (disabled, ${quota.earned}/${quota.max})`
        if (quota.remaining <= 0) return `skip (complete, ${quota.earned}/${quota.max})`
        return `run (${quota.earned}/${quota.max}, missing ${quota.remaining})`
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
                    `${platform} 搜索失败 | ${error instanceof Error ? error.message : String(error)}`
                )
                return 0
            }
        })
    }

    async bonusMobile(account: Account): Promise<number> {
        this.bot.logger.info('main', 'SEARCH-MANAGER', '开始奖励搜索')

        const gained = await executionContext.run({ isMobile: true, account }, async () => {
            try {
                return await this.bot.activities.doBonusSearches(this.bot.mainMobilePage)
            } catch (error) {
                this.bot.logger.error(
                    'main',
                    'SEARCH-MANAGER',
                    `奖励搜索失败 | ${error instanceof Error ? error.message : String(error)}`
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
            `奖励搜索汇总 | 获得积分=${gained} | 当前余额=${this.bot.userData.currentPoints}`
        )
        return gained
    }
}
