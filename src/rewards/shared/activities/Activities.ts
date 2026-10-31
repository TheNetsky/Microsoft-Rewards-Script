import { activityFailure, type ActivityResult } from '../ActivityResult'
import type { Page } from 'patchright'
import type { BotContext } from '../../../core/BotContext'
import type { BasePromotion, RewardsState } from '../../types/RewardsState'
import type { AppDashboardData, Promotion } from '../../app/types/AppDashboardData'
import type { QuestChild } from '../parsers/RewardsPageParser'
import type { PromotionSource } from '../../types/PromotionContext'
import { DailySet } from './DailySet'
import { MorePromotions } from './MorePromotions'
import { VisualSearch } from '../visual/VisualSearch'
import { DailyCheckIn } from '../../app/actions/DailyCheckIn'
import { AppReward } from '../../app/actions/AppReward'
import { AppPromotions } from '../../app/actions/AppPromotions'
import { EdgeBrowsing } from '../edge/EdgeBrowsing'
import { runTaskWithDelay } from '../TaskPacing'
import { withActivityBalance } from '../ActivityBalance'

export default class Activities {
    constructor(private readonly bot: BotContext) {}

    search(page: Page | undefined, isMobile: boolean) {
        return withActivityBalance(this.bot, () => this.bot.mode.actions.search(page, isMobile))
    }

    searchBonus(page: Page | undefined) {
        return withActivityBalance(this.bot, () => this.bot.mode.actions.bonusSearches(page))
    }

    searchOnBing(promotion: BasePromotion, source: PromotionSource = 'search-on-bing') {
        return runTaskWithDelay(this.bot, () => this.bot.mode.actions.searchOnBing(promotion, source), {
            source,
            promotion
        })
    }

    async runDailySet(data: RewardsState): Promise<RewardsState> {
        await new DailySet(this.bot).run(data)
        return this.bot.rewards.getTaskData()
    }

    runMorePromotions(data: RewardsState) {
        return new MorePromotions(this.bot).run(data)
    }

    runMobilePunchCards(data: RewardsState) {
        return this.bot.mode.actions.punchCardsMobile(data)
    }

    async runDesktopPunchCards(): Promise<void> {
        if (this.bot.config.workers.doPunchCards) await this.bot.mode.actions.punchCardsDesktop()
    }

    runUrlReward(promotion: BasePromotion, source: PromotionSource = 'other') {
        return runTaskWithDelay(this.bot, () => this.bot.mode.actions.urlReward(promotion, source), {
            source,
            promotion
        })
    }

    claimBonusPoints() {
        return this.runControl('doClaimBonusPoints', () => this.bot.mode.actions.claimBonusPoints())
    }

    ensureStreakProtection() {
        return this.runControl('doEnsureStreakProtection', () => this.bot.mode.actions.ensureStreakProtection())
    }

    claimReward(child: QuestChild, parentId: string) {
        return this.runControl('doClaimReward', () => this.bot.mode.actions.claimReward(child, parentId))
    }

    activateSearchPerk(data: RewardsState) {
        return this.runControl('doActivateSearchPerk', () => this.bot.mode.actions.activateSearchPerk(data))
    }

    runVisualSearch(data: RewardsState) {
        return runTaskWithDelay(this.bot, () => new VisualSearch(this.bot).run(data), 'visual-search')
    }

    runEdgeBrowsing(data: RewardsState, signal?: AbortSignal, onActivated?: () => void) {
        return withActivityBalance(this.bot, () => new EdgeBrowsing(this.bot).run(data, signal, onActivated))
    }

    private async runControl(name: string, operation: () => Promise<ActivityResult>): Promise<ActivityResult> {
        let result: ActivityResult
        try {
            this.bot.signal.throwIfAborted()
            result = await runTaskWithDelay(this.bot, operation, name)
        } catch (error) {
            this.bot.signal.throwIfAborted()
            this.bot.logger.debug(this.bot.isMobile, 'ACTIVITY-ERROR', error instanceof Error ? error : String(error))
            result = activityFailure(error)
        }
        this.bot.recordActivity(name, result)
        return result
    }

    runAppReward(promotion: Promotion) {
        return this.runControl('app-reward', () => new AppReward(this.bot).run(promotion))
    }

    readToEarn(promotion: Promotion) {
        return this.runControl('read-to-earn', () => this.bot.mode.actions.readToEarn(promotion))
    }

    dailyCheckIn(promotion: Promotion) {
        return (this.bot.accountState.dailyCheckIn ??= this.runControl('daily-check-in', () =>
            new DailyCheckIn(this.bot).run(promotion)
        ))
    }

    runAppPromotions(data: AppDashboardData) {
        return new AppPromotions(this.bot).run(data)
    }
}
