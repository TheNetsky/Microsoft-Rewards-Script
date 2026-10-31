import type { BotContext } from '../../../core/BotContext'
import type { Counters, BasePromotion } from '../../types/RewardsState'
import type { MissingSearchPoints } from '../../types/Points'
import { pointDelta, pointValue, promotionProgress } from '../PointAccounting'

export interface SearchQuota {
    available: boolean
    earned: number
    max: number
    remaining: number
    counterKey?: string
}

export interface SearchQuotas {
    mobile: SearchQuota
    desktop: SearchQuota
    edge: SearchQuota
}

export class SearchProgress {
    constructor(private readonly bot: BotContext) {}

    async getCounters(): Promise<Counters> {
        const dashboard = await this.bot.rewards.getDashboardData()
        const balance = dashboard.dashboard.userStatus.availablePoints
        if (this.bot.userData && Number.isFinite(balance)) this.bot.userData.currentPoints = balance
        return dashboard.dashboard.userStatus.counters
    }

    async getMissing(isMobile: boolean): Promise<MissingSearchPoints> {
        return this.calculateMissing(await this.getCounters(), isMobile)
    }

    calculateMissing(counters: Counters, isMobile: boolean): MissingSearchPoints {
        const quotas = this.calculateQuotas(counters)
        const mobilePoints = quotas.mobile.remaining
        const desktopPoints = quotas.desktop.remaining
        const edgePoints = this.bot.browser.userAgentManager.isRealEdge() ? quotas.edge.remaining : 0
        const selected = isMobile
            ? [quotas.mobile]
            : this.bot.browser.userAgentManager.isRealEdge()
              ? [quotas.desktop, quotas.edge]
              : [quotas.desktop]

        return {
            available: selected.every(quota => quota.available),
            earnedPoints: selected.reduce((sum, quota) => sum + quota.earned, 0),
            counterKey: JSON.stringify(selected.map(quota => quota.counterKey)),
            mobilePoints,
            desktopPoints,
            edgePoints,
            totalPoints: isMobile ? mobilePoints : desktopPoints + edgePoints
        }
    }

    gained(before: MissingSearchPoints, after: MissingSearchPoints): number | null {
        if (
            before.available === false ||
            after.available === false ||
            !before.counterKey ||
            before.counterKey !== after.counterKey
        )
            return null
        return pointDelta(before.earnedPoints, after.earnedPoints)
    }

    calculateQuotas(counters: Counters): SearchQuotas {
        const pcCounters = counters.pcSearch ?? []
        const explicitEdgeCounters = pcCounters.filter(counter => this.isEdgeCounter(counter))
        const desktopCounters = explicitEdgeCounters.length
            ? pcCounters.filter(counter => !this.isEdgeCounter(counter))
            : pcCounters

        return {
            mobile: this.summarize(counters.mobileSearch),
            desktop: this.summarize(counters.pcSearch === undefined ? undefined : desktopCounters),
            edge: this.summarize(counters.pcSearch === undefined ? undefined : explicitEdgeCounters)
        }
    }

    private summarize(counters: BasePromotion[] | undefined): SearchQuota {
        if (counters === undefined) return { available: false, earned: 0, max: 0, remaining: 0 }
        const quota: SearchQuota = { available: true, earned: 0, max: 0, remaining: 0 }
        const identities: string[] = []
        for (const counter of counters) {
            const max = pointValue(counter.pointProgressMax)
            const earned = promotionProgress(counter)
            if (max === null || earned === null || earned > max)
                return { available: false, earned: 0, max: 0, remaining: 0 }
            quota.earned += earned
            quota.max += max
            quota.remaining += max - earned
            identities.push(JSON.stringify([counter.offerId, counter.name, max]))
        }
        quota.counterKey = JSON.stringify(identities.sort())
        return quota
    }

    private isEdgeCounter(counter: BasePromotion): boolean {
        return [counter.offerId, counter.name, counter.title, counter.promotionSubtype].some(
            value => typeof value === 'string' && /(^|[_\s-])edge([_\s-]|$)/i.test(value)
        )
    }
}
