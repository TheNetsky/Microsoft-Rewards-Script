import { activityResult, activityFailure } from '../ActivityResult'
import type { BotContext } from '../../../core/BotContext'
import { executionContext } from '../../../core/ExecutionContext'
import type { Account } from '../../../core/Account'
import { SearchProgress, type SearchQuota } from './SearchProgress'
import type { RewardsState } from '../../types/RewardsState'

export interface SearchPlan {
    mobileQuotaKnown: boolean
    desktopQuotaKnown: boolean
    doMobile: boolean
    doDesktop: boolean
    mobileMissing: number
    desktopMissing: number
}

export class SearchManager {
    private readonly progress: SearchProgress

    constructor(private bot: BotContext) {
        this.progress = new SearchProgress(bot)
    }

    async planSearches(data?: RewardsState): Promise<SearchPlan> {
        const counters = data?.dashboard.userStatus.counters ?? (await this.progress.getCounters())
        const quotas = this.progress.calculateQuotas(counters)
        const mobileMissing = quotas.mobile.remaining
        const desktopQuota = this.combineQuotas(quotas.desktop, quotas.edge)
        const desktopMissing = desktopQuota.remaining

        const doMobile =
            this.bot.config.workers.doMobileSearch &&
            quotas.mobile.available &&
            (mobileMissing > 0 || this.bot.config.searchSettings.runOnZeroPoints)
        const doDesktop =
            this.bot.config.workers.doDesktopSearch &&
            desktopQuota.available &&
            (desktopMissing > 0 || this.bot.config.searchSettings.runOnZeroPoints)

        for (const [name, enabled, available] of [
            ['mobile-search-quota', this.bot.config.workers.doMobileSearch, quotas.mobile.available],
            ['desktop-search-quota', this.bot.config.workers.doDesktopSearch, desktopQuota.available]
        ] as const) {
            if (enabled)
                this.bot.recordActivity(
                    name,
                    activityResult(
                        available ? 'confirmed' : 'unconfirmed',
                        available ? 'quota-available' : 'quota-unavailable'
                    )
                )
        }

        this.bot.logger.debug(
            'main',
            'SEARCH-MANAGER',
            `Mobile: ${this.describeQuota(this.bot.config.workers.doMobileSearch, quotas.mobile)}` +
                ` | Desktop: ${this.describeQuota(this.bot.config.workers.doDesktopSearch, desktopQuota)}` +
                `${quotas.edge.max > 0 ? ` | Edge: ${quotas.edge.earned}/${quotas.edge.max}` : ''}`
        )

        return {
            doMobile,
            doDesktop,
            mobileMissing,
            desktopMissing,
            mobileQuotaKnown: quotas.mobile.available,
            desktopQuotaKnown: desktopQuota.available
        }
    }

    private combineQuotas(...quotas: SearchQuota[]): SearchQuota {
        return quotas.reduce(
            (total, quota) => ({
                available: total.available && quota.available,
                earned: total.earned + quota.earned,
                max: total.max + quota.max,
                remaining: total.remaining + quota.remaining
            }),
            { available: true, earned: 0, max: 0, remaining: 0 }
        )
    }

    private describeQuota(enabled: boolean, quota: SearchQuota): string {
        if (!quota.available) return enabled ? 'skip (quota unavailable)' : 'skip (disabled, quota unavailable)'
        if (!enabled) return `skip (disabled, ${quota.earned}/${quota.max})`
        if (quota.remaining <= 0 && this.bot.config.searchSettings.runOnZeroPoints)
            return 'run (bounded zero-point searches)'
        if (quota.remaining <= 0) return `skip (complete, ${quota.earned}/${quota.max})`
        return `run (${quota.earned}/${quota.max}, missing ${quota.remaining})`
    }

    searchMobile(account: Account): Promise<number | null> {
        return this.search(account, true)
    }

    searchDesktop(account: Account): Promise<number | null> {
        return this.search(account, false)
    }

    private search(account: Account, isMobile: boolean): Promise<number | null> {
        const platform = isMobile ? 'Mobile' : 'Desktop'
        const page = isMobile ? this.bot.mainMobilePage : this.bot.mainDesktopPage

        return executionContext.run({ isMobile, account }, async () => {
            try {
                return await this.bot.activities.search(page, isMobile)
            } catch (error) {
                this.bot.recordActivity('search', activityFailure(error))
                this.bot.signal.throwIfAborted()
                this.bot.logger.error(
                    'main',
                    'SEARCH-MANAGER',
                    `${platform} search failed | ${error instanceof Error ? error.message : String(error)}`
                )
                return null
            }
        })
    }

    async bonusMobile(account: Account): Promise<number | null> {
        this.bot.logger.info('main', 'SEARCH-MANAGER', 'Starting bonus searches')

        const gained = await executionContext.run({ isMobile: true, account }, async () => {
            try {
                return await this.bot.activities.searchBonus(this.bot.mainMobilePage)
            } catch (error) {
                this.bot.recordActivity('bonus-search', activityFailure(error))
                this.bot.signal.throwIfAborted()
                this.bot.logger.error(
                    'main',
                    'SEARCH-MANAGER',
                    `Bonus search failed | ${error instanceof Error ? error.message : String(error)}`
                )
                return null
            }
        })

        this.bot.logger.debug(
            'main',
            'SEARCH-MANAGER',
            `Bonus search summary | pointsGained=${gained ?? 'unknown'} | currentBalance=${this.bot.userData.currentPoints}`
        )
        return gained
    }

    logSummary(points: {
        mobile: number | null
        desktop: number | null
        bonus: number | null
        apiReport?: number | null
    }): void {
        const total = Object.values(points).every(value => value !== null)
            ? points.mobile! + points.desktop! + points.bonus! + (points.apiReport ?? 0)
            : null
        this.bot.logger[total !== null && total > 0 ? 'success' : 'info'](
            'main',
            'SEARCH-MANAGER',
            `Search summary | mobile=${points.mobile ?? 'unknown'} | desktop=${points.desktop ?? 'unknown'}` +
                ` | bonus=${points.bonus ?? 'unknown'}` +
                (points.apiReport !== undefined ? ` | apiReport=${points.apiReport ?? 'unknown'}` : '') +
                ` | total=${total ?? 'unknown'}`
        )
    }
}
