import { getMorePromotions } from './shared/Promotion'
import { isEligiblePromotion } from './shared/PromotionEligibility'
import type { Page } from 'patchright'
import type { BotContext } from '../core/BotContext'
import type { ModeServices } from './types/ModeServices'
import type { RewardsState } from './types/RewardsState'
import type { WebPoints } from './types/Points'
import type { PageSnapshot, ParsedOffer } from './shared/parsers/RewardsPageParser'
import { URLs } from '../constants/urls'
import { observeActivityBalance } from './shared/ActivityBalance'

export default class RewardsService {
    private readonly reads = new Map<boolean, Promise<RewardsState>>()

    constructor(
        private readonly bot: BotContext,
        private readonly mode: ModeServices
    ) {}

    reset(): void {
        this.reads.clear()
        this.mode.accountData.reset()
        if (this.mode.data !== this.mode.accountData) this.mode.data.reset()
    }

    async getDashboardData(): Promise<RewardsState> {
        const platform = this.bot.isMobile
        let read = this.reads.get(platform)
        if (!read) {
            const request = this.mode.accountData.getDashboardData().finally(() => {
                if (this.reads.get(platform) === request) this.reads.delete(platform)
            })
            this.reads.set(platform, request)
            read = request
        }
        const data = await read
        observeActivityBalance(data.dashboard.userStatus.availablePoints)
        return data
    }

    getTaskData(): Promise<RewardsState> {
        return this.mode.data.getTaskData?.() ?? this.getDashboardData()
    }

    bootstrap(page: Page): Promise<void> {
        return this.mode.data.bootstrap(page)
    }

    getRewardsPageHtml(url: string, route: string): Promise<string | null> {
        return this.mode.data.getPageHtml(url, route)
    }

    async reportServerAction(
        actionId: string,
        body: unknown[],
        opts?: { url?: string; referer?: string; routerStateTree?: string }
    ): Promise<{ status: number; acknowledged: boolean; availablePoints: number | null }> {
        if (!this.mode.serverActions)
            throw new Error('Direct Rewards server actions are disabled while rewardsMode="browser"')
        return this.mode.serverActions.reportServerAction(actionId, body, opts)
    }

    async reportStreakProtection(
        html: string
    ): Promise<{ status: number; acknowledged: boolean; availablePoints: number | null }> {
        return this.mode.reportStreakProtection(html)
    }

    async refreshEarnSnapshot(): Promise<PageSnapshot | null> {
        const pages = await Promise.all(
            this.mode.snapshotRoutes.map(route => this.mode.data.getPageHtml(URLs.rewards.path(route), route))
        )
        const available = pages.filter((html): html is string => html !== null)
        return available.length ? this.bot.pageParser.snapshotPage(available) : null
    }

    async logStreaks(): Promise<void> {
        try {
            await this.refreshEarnSnapshot()
        } catch (error) {
            this.bot.signal.throwIfAborted()
            this.bot.logger.debug(
                this.bot.isMobile,
                'STREAKS',
                `Streak completion refresh unavailable | ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    async getWebPoints(data?: RewardsState): Promise<WebPoints> {
        data ??= await this.getDashboardData()

        const desktopSearchPoints =
            data.dashboard.userStatus.counters.pcSearch?.reduce(
                (sum: number, x: { pointProgressMax: number; pointProgress: number }) =>
                    sum + Math.max(0, x.pointProgressMax - x.pointProgress),
                0
            ) ?? 0

        const mobileSearchPoints =
            data.dashboard.userStatus.counters.mobileSearch?.reduce(
                (sum: number, x: { pointProgressMax: number; pointProgress: number }) =>
                    sum + Math.max(0, x.pointProgressMax - x.pointProgress),
                0
            ) ?? 0

        const todayDate = this.bot.utils.formatDate(Date.now(), this.bot.userData.timezone)
        const dailySetPoints =
            data.dashboard.dailySetPromotions[todayDate]
                ?.filter(item => isEligiblePromotion(item, this.bot.config.skipNonPointTasks))
                .reduce(
                    (sum: number, x: { pointProgressMax: number; pointProgress: number }) =>
                        sum + Math.max(0, x.pointProgressMax - x.pointProgress),
                    0
                ) ?? 0

        const morePromotionsPoints = getMorePromotions(data.dashboard)
            .filter(item => isEligiblePromotion(item, this.bot.config.skipNonPointTasks))
            .reduce((sum, item) => sum + Math.max(0, item.pointProgressMax - item.pointProgress), 0)

        const available = {
            desktopSearchPoints: this.bot.config.workers.doDesktopSearch ? desktopSearchPoints : 0,
            mobileSearchPoints: this.bot.config.workers.doMobileSearch ? mobileSearchPoints : 0,
            dailySetPoints: this.bot.config.workers.doDailySet ? dailySetPoints : 0,
            morePromotionsPoints: this.bot.config.workers.doMorePromotions ? morePromotionsPoints : 0
        }
        const totalEarnablePoints = Object.values(available).reduce((sum, points) => sum + points, 0)

        return {
            ...available,
            desktopSearchAvailable: data.dashboard.userStatus.counters.pcSearch !== undefined,
            mobileSearchAvailable: data.dashboard.userStatus.counters.mobileSearch !== undefined,
            totalEarnablePoints
        }
    }

    async getCurrentPoints(): Promise<number> {
        const data = await this.getDashboardData()
        return data.dashboard.userStatus.availablePoints
    }

    async resolveOffer(offerId: string): Promise<ParsedOffer | null> {
        const cached = this.bot.reactSnapshot?.offers.find(o => o.offerId === offerId)
        if (cached) return cached

        this.bot.logger.debug(
            this.bot.isMobile,
            'EARN-SNAPSHOT',
            `${offerId} absent from the cached snapshot (offers=${this.bot.reactSnapshot?.offers.length ?? 0}) - refetching /earn and /dashboard`
        )

        const refreshed = await this.refreshEarnSnapshot()
        if (!refreshed) return null

        if (!this.bot.reactSnapshot || refreshed.offers.length >= this.bot.reactSnapshot.offers.length) {
            this.bot.reactSnapshot = refreshed
        }

        const live = refreshed.offers.find(o => o.offerId === offerId) ?? null

        this.bot.logger.debug(
            this.bot.isMobile,
            'EARN-SNAPSHOT',
            `Refetched /earn and /dashboard | offers=${refreshed.offers.length} | ${offerId} found=${!!live}`
        )

        return live
    }
}
