import type { Dashboard } from '../../../interface/DashboardData'
import type { SearchTracker } from '../../../interface/Search'
import type { MicrosoftRewardsBot } from '../../../index'

const BONUS_STAGNANT_LIMIT = 20

const BING_TRACKING_PARAMS = new Set(['form', 'ocid', 'publ', 'crea', 'pc', 'channel', 'mkt', 'cc', 'setlang'])

export class BonusTracker implements SearchTracker {
    public readonly context = 'SEARCH-BONUS'
    public readonly maxSearches: number
    public readonly stagnantLimit = BONUS_STAGNANT_LIMIT

    public started = false

    public offerLost = false

    private offerId = ''
    private max = 0
    private current = 0
    private balance = 0

    constructor(
        private bot: MicrosoftRewardsBot,
        private isMobile: boolean
    ) {
        this.maxSearches = Math.max(0, Number(this.bot.config.searchSettings.maxBonusSearches ?? 0))
    }

    async prepare(): Promise<boolean> {
        if (this.maxSearches <= 0) {
            this.bot.logger.info(this.isMobile, this.context, 'maxBonusSearches is 0, skipping bonus farming')
            return false
        }

        let dashboard: Dashboard
        try {
            dashboard = (await this.bot.browser.func.getDashboardData()).dashboard
        } catch (error) {
            this.bot.logger.warn(
                this.isMobile,
                this.context,
                `Could not fetch dashboard, skipping bonus farming | ${error instanceof Error ? error.message : String(error)}`
            )
            return false
        }

        const offer = this.findSearchBonusOffer(dashboard)
        if (!offer) {
            this.bot.logger.info(this.isMobile, this.context, 'No active search-bonus offer in the dashboard, skipping')
            return false
        }

        this.offerId = offer.offerId
        this.max = offer.pointProgressMax
        this.current = offer.pointProgress
        this.balance = dashboard.userStatus.availablePoints
        this.started = true

        this.bot.logger.info(
            this.isMobile,
            this.context,
            `Found search bonus "${offer.title}" | offerId=${this.offerId} | progress=${this.current}/${this.max} | maxSearches=${this.maxSearches}`
        )
        return true
    }

    async measure(): Promise<number> {
        let dash: Dashboard
        try {
            dash = (await this.bot.browser.func.getDashboardData()).dashboard
        } catch {
            return 0
        }

        const newBalance = dash.userStatus.availablePoints
        const balanceGain = newBalance - this.balance
        if (balanceGain > 0) {
            this.bot.userData.currentPoints = newBalance
            this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + balanceGain
            this.balance = newBalance
        }

        const cur = this.findOfferById(dash, this.offerId)
        if (!cur) {
            this.bot.logger.warn(this.isMobile, this.context, `Offer ${this.offerId} no longer present, stopping`)
            this.offerLost = true
            return 0
        }

        const gained = cur.pointProgress - this.current
        if (gained > 0) this.current = cur.pointProgress
        return Math.max(0, gained)
    }

    done(): boolean {
        return this.offerLost || this.current >= this.max
    }

    progress(): string {
        return `progress=${this.current}/${this.max}`
    }

    private findSearchBonusOffer(dashboard: Dashboard) {
        const pools = [
            ...(dashboard.morePromotions ?? []),
            ...(dashboard.morePromotionsWithoutPromotionalItems ?? []),
            ...(dashboard.promotionalItems ?? [])
        ]

        return pools.find(p => {
            if (!p || p.complete) return false
            if (!(p.pointProgressMax > p.pointProgress)) return false
            if ((p.promotionType ?? '').toLowerCase() !== 'urlreward') return false
            return this.isBareBingSearchDestination(p.destinationUrl)
        })
    }

    private findOfferById(dashboard: Dashboard, offerId: string) {
        const pools = [
            ...Object.values(dashboard.dailySetPromotions ?? {}).flat(),
            ...(dashboard.morePromotions ?? []),
            ...(dashboard.morePromotionsWithoutPromotionalItems ?? []),
            ...(dashboard.promotionalItems ?? [])
        ]
        return pools.find(o => o.offerId === offerId)
    }

    private isBareBingSearchDestination(url?: string): boolean {
        if (!url) return false
        try {
            const u = new URL(url)
            const isBingHost = /(^|\.)bing\.com$/i.test(u.hostname)
            const isRootPath = u.pathname === '' || u.pathname === '/'
            if (!isBingHost || !isRootPath) return false
            for (const key of u.searchParams.keys()) {
                if (!BING_TRACKING_PARAMS.has(key.toLowerCase())) return false
            }
            return true
        } catch {
            return false
        }
    }
}
