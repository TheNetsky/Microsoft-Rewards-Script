import { creditedPoints, pointValue, promotionPoints } from '../PointAccounting'
import type { BasePromotion } from '../Promotion'
import { activityResult } from '../ActivityResult'
import type { RewardsDashboard } from '../../types/RewardsState'
import type { SearchTracker } from './SearchTypes'
import type { BotContext } from '../../../core/BotContext'
import { findActiveSearchBonus, findSearchBonusById } from './SearchBonus'

const BONUS_STAGNANT_LIMIT = 20

export class BonusTracker implements SearchTracker {
    readonly context = 'SEARCH-BONUS'
    readonly maxSearches: number
    readonly stagnantLimit = BONUS_STAGNANT_LIMIT

    started = false

    offerLost = false

    pointsGained: number | null = 0
    private baseline?: BasePromotion
    private baselineBalance: number | null = null
    private measuredTotal = 0
    private complete = false
    private offerId = ''
    private max = 0
    private current = 0

    constructor(
        private bot: BotContext,
        private isMobile: boolean
    ) {
        this.maxSearches = Math.max(0, Number(this.bot.config.searchSettings.maxBonusSearches ?? 0))
    }

    async prepare(): Promise<boolean> {
        if (this.maxSearches <= 0) {
            this.bot.logger.debug(this.isMobile, this.context, 'maxBonusSearches is 0, skipping bonus farming')
            return false
        }

        let dashboard: RewardsDashboard
        try {
            dashboard = (await this.bot.rewards.getTaskData()).dashboard
        } catch (error) {
            this.bot.recordActivity('bonus-search', activityResult('unconfirmed', 'offer-data-unavailable'))
            this.bot.signal.throwIfAborted()
            this.bot.logger.warn(
                this.isMobile,
                this.context,
                `Could not fetch dashboard, skipping bonus farming | ${error instanceof Error ? error.message : String(error)}`
            )
            return false
        }

        this.baselineBalance = pointValue(dashboard.userStatus?.availablePoints)
        const offer = findActiveSearchBonus(dashboard)
        if (!offer) {
            this.bot.logger.debug(
                this.isMobile,
                this.context,
                'No active search-bonus offer in the dashboard, skipping'
            )
            return false
        }

        try {
            const data = (await this.bot.rewards.getDashboardData()).dashboard
            this.baseline = findSearchBonusById(data, offer.offerId) ?? offer
            this.baselineBalance = pointValue(data.userStatus?.availablePoints)
        } catch {
            this.bot.signal.throwIfAborted()
            this.baseline = offer
        }
        this.offerId = offer.offerId
        this.max = this.baseline.pointProgressMax
        this.current = this.baseline.pointProgress
        this.complete = this.baseline.complete || (this.max > 0 && this.current >= this.max)
        this.started = true

        this.bot.logger.info(
            this.isMobile,
            this.context,
            `Found search bonus "${offer.title}" | offerId=${this.offerId} | progress=${this.current}/${this.max} | maxSearches=${this.maxSearches}`
        )
        return true
    }

    async measure(): Promise<number | null> {
        let dash: RewardsDashboard
        try {
            dash = (await this.bot.rewards.getDashboardData()).dashboard
            if (!findSearchBonusById(dash, this.offerId)) dash = (await this.bot.rewards.getTaskData()).dashboard
        } catch {
            this.bot.signal.throwIfAborted()
            this.pointsGained = null
            return null
        }

        const cur = findSearchBonusById(dash, this.offerId)
        if (!cur) {
            this.bot.logger.warn(this.isMobile, this.context, `Offer ${this.offerId} no longer present, stopping`)
            this.offerLost = true
            this.pointsGained = null
            return null
        }

        const total = creditedPoints(
            promotionPoints(this.baseline, cur),
            this.baselineBalance,
            dash.userStatus?.availablePoints
        )
        this.pointsGained = total
        this.current = cur.pointProgress
        this.complete = cur.complete || (cur.pointProgressMax > 0 && cur.pointProgress >= cur.pointProgressMax)
        if (total === null || total < this.measuredTotal) {
            this.pointsGained = null
            return null
        }
        const gained = total - this.measuredTotal
        this.measuredTotal = total
        return gained
    }

    done(): boolean {
        return this.offerLost || this.complete
    }

    progress(): string {
        return `progress=${this.current}/${this.max}`
    }
}
