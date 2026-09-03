import { BaseActivity } from '../BaseActivity'

import type { ParsedOffer, StreakState } from '../../../browser/ReactFunc'
import type { DashboardData } from '../../../interface/DashboardData'
import { VisualSearchBrowser } from './VisualSearchBrowser'

const VISUAL_SEARCH_ACTIVATION_OFFER = 'visualsearch_streak_activation_v2'

const VERIFIED_ACTIVITY_TYPES = new Map<string, number>([
    ['ww_visualsearch_summerjuly26_activation_banner', 11],
    ['visualsearch_streak_activation_v2', 714]
])

const MAX_ATTEMPTS = 4
const MAX_ACQUISITION_FAILURES_PER_ATTEMPT = 3
const REGISTRATION_CHECKS = 3

type ActivationResult = 'activated' | 'already-active' | 'absent' | 'failed'

interface ActivationMetadata {
    activityType: number
    activityTypeSource: 'react' | 'streak' | 'dashboard' | 'verified-fallback'
    isPromotional: boolean
}

interface ActivationTarget extends ParsedOffer {
    activationSource: 'streak' | 'offer'
}

export class VisualSearch extends BaseActivity {
    private readonly browserFlow = new VisualSearchBrowser(this.bot)

    public async doVisualSearch(data: DashboardData): Promise<number> {
        if (this.bot.isMobile) {
            this.bot.logger.debug(this.bot.isMobile, 'VISUAL-SEARCH', '移动端跳过 - 仅限桌面端的活动')
            return 0
        }

        const streak = this.findStreak()
        this.logStreakState(streak)

        if (streak?.isCurrentDayCompleted) {
            this.bot.logger.info(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `今日已完成 | visualSearchStreak=${streak.completedDays}/${streak.totalDays}`,
                'green'
            )
            return 0
        }

        const activation = await this.activate(data)

        const available = streak?.isEnabled === true || activation === 'activated' || activation === 'already-active'
        if (!available) {
            this.bot.logger.info(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                '该账户无法使用视觉搜索，跳过'
            )
            return 0
        }

        return await this.performDailySearch()
    }

    private findStreak(streaks?: StreakState[]): StreakState | undefined {
        if (streaks) return streaks.find(s => /visual.?search/i.test(s.partner))

        const snapshots = [this.bot.reactSnapshot, this.bot.reactSnapshots.desktop, this.bot.reactSnapshots.mobile]

        for (const snapshot of snapshots) {
            const streak = snapshot?.streaks.find(s => /visual.?search/i.test(s.partner))
            if (streak) return streak
        }

        return undefined
    }

    private logStreakState(streak: StreakState | undefined): void {
        if (!streak) {
            this.bot.logger.info(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                '快照中没有视觉搜索连击 - 回退到激活优惠'
            )
            return
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'VISUAL-SEARCH',
            `连击状态 | partner="${streak.partner}" | enabled=${streak.isEnabled} | dayCompleted=${streak.isCurrentDayCompleted} | days=${streak.completedDays}/${streak.totalDays} | currentDay=${streak.currentDay} | activities=${streak.activitiesCompleted}/${streak.activitiesTotal}`
        )

        if (!streak.isEnabled) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                '连击存在但未启用 - 开启前搜索不会被记录'
            )
        }
    }

    private async activate(data: DashboardData): Promise<ActivationResult> {
        const offer = this.findActivationTarget()
        if (!offer) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                '当前、桌面或缓存的移动端 Rewards 快照的连击模型和通用优惠中均无视觉搜索激活元数据'
            )
            return 'absent'
        }

        if (offer.isCompleted) {
            this.bot.logger.info(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `视觉搜索激活优惠已完成 | offerId=${offer.offerId}`,
                'green'
            )
            return 'already-active'
        }

        if (!offer.hash) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `激活优惠存在但缺少 hash | offerId=${offer.offerId}`
            )
            return 'failed'
        }

        if (!offer.reportable && !offer.isLocked) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `激活优惠无法执行 | offerId=${offer.offerId}`
            )
            return 'failed'
        }

        const actionId = this.bot.nextActions.reportActivity
        if (!actionId) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                '跳过激活：bundle 中未发现 "reportActivity" action id'
            )
            return 'failed'
        }

        const dashboard = await this.resolveDashboard(data)
        const metadata = this.resolveActivationMetadata(offer, dashboard)
        if (!metadata) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `跳过激活：未找到有效的活动类型 | offerId=${offer.offerId}`
            )
            return 'failed'
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'VISUAL-SEARCH',
            `正在激活视觉搜索 | offerId=${offer.offerId} | activationSource=${offer.activationSource} | activityType=${metadata.activityType} | activityTypeSource=${metadata.activityTypeSource} | promotional=${metadata.isPromotional} | geo=${this.bot.userData.geoLocale}`
        )

        try {
            const { status, acknowledged } = await this.bot.browser.func.reportServerAction(actionId, [
                offer.hash,
                metadata.activityType,
                {
                    offerid: offer.offerId,
                    isPromotional: metadata.isPromotional ? 'true' : '$undefined',
                    timezoneOffset: this.bot.userData.timezoneOffset
                }
            ])

            await this.bot.utils.wait(this.bot.utils.randomDelay(3000, 6000))
            const confirmed = await this.confirmActivation(offer.offerId)

            if (acknowledged || confirmed) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `视觉搜索已激活 | offerId=${offer.offerId} | acknowledged=${acknowledged} | confirmed=${confirmed}`,
                    'green'
                )
                return 'activated'
            }

            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `激活未被确认 | offerId=${offer.offerId} | status=${status}`
            )
            return 'failed'
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `激活出错 | offerId=${offer.offerId} | ${error instanceof Error ? error.message : String(error)}`
            )
            return 'failed'
        }
    }

    private async confirmActivation(offerId: string): Promise<boolean> {
        try {
            const snapshot = await this.bot.browser.func.refreshEarnSnapshot()
            if (!snapshot) return false

            this.bot.reactSnapshot = snapshot

            const streak = this.findStreak(snapshot.streaks)
            const activationOffer = snapshot.offers.find(o => o.offerId === offerId)
            return streak?.isEnabled === true || activationOffer?.isCompleted === true
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `无法验证激活状态 | offerId=${offerId} | ${error instanceof Error ? error.message : String(error)}`
            )
            return false
        }
    }

    private async resolveDashboard(fallback: DashboardData): Promise<DashboardData> {
        try {
            return await this.bot.browser.func.getDashboardData(this.bot.cookies.desktop)
        } catch {
            this.bot.logger.debug(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                '桌面端 dashboard 获取失败 - 回退到移动端阶段获取的 dashboard'
            )
            return fallback
        }
    }

    private resolveActivationMetadata(offer: ActivationTarget, data: DashboardData): ActivationMetadata | null {
        const dashboardPromotion = this.findDashboardPromotion(data.dashboard, offer.offerId)

        if (offer.activityType !== null) {
            return {
                activityType: offer.activityType,
                activityTypeSource: offer.activationSource === 'streak' ? 'streak' : 'react',
                isPromotional: offer.isPromotional || this.dashboardPromotionIsPromotional(dashboardPromotion)
            }
        }

        const dashboardActivityType = this.dashboardPromotionActivityType(dashboardPromotion)
        if (dashboardActivityType !== null) {
            return {
                activityType: dashboardActivityType,
                activityTypeSource: 'dashboard',
                isPromotional: offer.isPromotional || this.dashboardPromotionIsPromotional(dashboardPromotion)
            }
        }

        const verifiedFallback = VERIFIED_ACTIVITY_TYPES.get(offer.offerId.toLowerCase())
        if (verifiedFallback !== undefined) {
            return {
                activityType: verifiedFallback,
                activityTypeSource: 'verified-fallback',
                isPromotional: offer.isPromotional || this.dashboardPromotionIsPromotional(dashboardPromotion)
            }
        }

        return null
    }

    private findDashboardPromotion(root: unknown, offerId: string): Record<string, unknown> | null {
        const target = offerId.toLowerCase()
        const pending: unknown[] = [root]
        const visited = new Set<object>()

        while (pending.length) {
            const value = pending.pop()
            if (!value || typeof value !== 'object' || visited.has(value)) continue
            visited.add(value)

            if (Array.isArray(value)) {
                for (const entry of value) pending.push(entry)
                continue
            }

            const record = value as Record<string, unknown>
            const attributes = this.asRecord(record.attributes)
            const candidateId = record.offerId ?? record.offerid ?? attributes?.offerid
            if (typeof candidateId === 'string' && candidateId.toLowerCase() === target) return record

            for (const entry of Object.values(record)) pending.push(entry)
        }

        return null
    }

    private dashboardPromotionActivityType(promotion: Record<string, unknown> | null): number | null {
        if (!promotion) return null
        const attributes = this.asRecord(promotion.attributes)
        return this.parseActivityType(
            promotion.activityType ?? promotion.activity_type ?? attributes?.activityType ?? attributes?.activity_type
        )
    }

    private dashboardPromotionIsPromotional(promotion: Record<string, unknown> | null): boolean {
        if (!promotion) return false
        const attributes = this.asRecord(promotion.attributes)
        const value = promotion.isPromotional ?? promotion.promotional ?? attributes?.promotional
        return value === true || (typeof value === 'string' && value.toLowerCase() === 'true')
    }

    private parseActivityType(value: unknown): number | null {
        const parsed = Number(value)
        return Number.isInteger(parsed) && parsed > 0 ? parsed : null
    }

    private asRecord(value: unknown): Record<string, unknown> | null {
        return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
    }

    private findActivationTarget(): ActivationTarget | null {
        const snapshots = [
            { source: 'current', snapshot: this.bot.reactSnapshot },
            { source: 'desktop', snapshot: this.bot.reactSnapshots.desktop },
            { source: 'mobile', snapshot: this.bot.reactSnapshots.mobile }
        ] as const

        const seen = new Set<unknown>()

        // New Rewards format: activation metadata is carried directly by the streak model.
        for (const { source, snapshot } of snapshots) {
            if (!snapshot || seen.has(snapshot)) continue
            seen.add(snapshot)

            const streak = this.findStreak(snapshot.streaks)
            if (!streak?.activationOfferId || !streak.activationHash) continue

            if (source !== 'current') {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `当前快照缺少激活元数据；使用缓存的 ${source} 连击快照 | offerId=${streak.activationOfferId}`
                )
            } else {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `使用来自连击模型的视觉搜索激活元数据 | offerId=${streak.activationOfferId}`
                )
            }

            return {
                offerId: streak.activationOfferId,
                hash: streak.activationHash,
                title: 'Visual Search Streak',
                description: '',
                points: 0,
                promotionSubtype: null,
                destination: streak.destinationUrl ?? '',
                isCompleted: streak.isEnabled,
                isPromotional: false,
                isLocked: false,
                unlockCriteria: null,
                date: null,
                activityType: streak.activationActivityType,
                reportable: true,
                activationSource: 'streak'
            }
        }

        // Legacy/current alternate format: activation appears as a regular Rewards offer.
        seen.clear()
        for (const { source, snapshot } of snapshots) {
            if (!snapshot || seen.has(snapshot)) continue
            seen.add(snapshot)

            const exact = snapshot.offers.find(o => o.offerId === VISUAL_SEARCH_ACTIVATION_OFFER)
            const fuzzy = snapshot.offers.find(o => {
                const id = o.offerId.toLowerCase()
                return id.includes('visualsearch') && id.includes('activation')
            })
            const offer = exact ?? fuzzy
            if (!offer) continue

            if (source !== 'current') {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `当前快照缺少激活优惠；使用缓存的 ${source} 优惠快照 | offerId=${offer.offerId}`
                )
            } else {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `使用来自通用优惠的视觉搜索激活元数据 | offerId=${offer.offerId}`
                )
            }

            return { ...offer, activationSource: 'offer' }
        }

        return null
    }

    private async performDailySearch(): Promise<number> {
        const seenBcids = new Set<string>()
        const candidateSeeds = await this.browserFlow.getSeedUrls()

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            const visual = await this.acquireFreshVisualSearch(seenBcids, candidateSeeds, attempt)
            if (!visual) {
                await this.bot.utils.wait(this.bot.utils.randomDelay(3000, 6000))
                continue
            }

            const res = await this.browserFlow.report(visual)

            if (res.balance != null) this.bot.userData.currentPoints = res.balance

            const gained = res.gained ?? 0
            if (gained >= 5) {
                this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + gained
                this.bot.logger.info(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `每日视觉搜索完成 | pointsGained=${gained} | currentBalance=${res.balance} | query="${visual.query}"`,
                    'green'
                )
                return gained
            }

            if (await this.waitForDayRegistration()) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `每日视觉搜索已记录 | pointsGained=0（连击在里程碑时发放积分） | query="${visual.query}"`,
                    'green'
                )
                return 0
            }

            if (res.acknowledged) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `视觉搜索已上报但未记分（第 ${attempt}/${MAX_ATTEMPTS} 次尝试） | query="${visual.query}"`
                )
            } else {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `reportActivity 未确认（第 ${attempt}/${MAX_ATTEMPTS} 次尝试） | query="${visual.query}"`
                )
            }

            await this.bot.utils.wait(this.bot.utils.randomDelay(3000, 6000))
        }

        this.bot.logger.warn(
            this.bot.isMobile,
            'VISUAL-SEARCH',
            `尝试 ${MAX_ATTEMPTS} 次后每日视觉搜索仍未记分`
        )
        return 0
    }

    // bcid is derived from the image bytes, so a repeated seed produces a blob bing already credited
    private async acquireFreshVisualSearch(
        seen: Set<string>,
        candidateSeeds: string[],
        attempt: number
    ): Promise<{ bcid: string; query: string; serpUrl: string } | null> {
        let acquisitionFailures = 0

        while (candidateSeeds.length) {
            const seed = candidateSeeds.shift()
            if (!seed) continue

            const visual = await this.browserFlow.acquire(seed)
            if (!visual) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `无法从该候选种子获取视觉搜索（第 ${attempt}/${MAX_ATTEMPTS} 次尝试）`
                )
                acquisitionFailures++
                if (acquisitionFailures >= MAX_ACQUISITION_FAILURES_PER_ATTEMPT) return null
                continue
            }

            if (!seen.has(visual.bcid)) {
                seen.add(visual.bcid)
                return visual
            }

            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `跳过已尝试过的 bcid=${visual.bcid.slice(0, 14)} | candidatesRemaining=${candidateSeeds.length}`
            )
            await this.bot.utils.wait(this.bot.utils.randomDelay(1000, 2000))
        }

        this.bot.logger.warn(
            this.bot.isMobile,
            'VISUAL-SEARCH',
            `没有剩余未使用的视觉搜索种子（第 ${attempt}/${MAX_ATTEMPTS} 次尝试）`
        )
        return null
    }

    private async waitForDayRegistration(): Promise<boolean> {
        for (let check = 1; check <= REGISTRATION_CHECKS; check++) {
            if (check > 1) {
                await this.bot.utils.wait(this.bot.utils.randomDelay(2000, 4000))
            }
            if (await this.dayRegistered()) return true
        }

        return false
    }

    private async dayRegistered(): Promise<boolean> {
        const snapshot = await this.bot.browser.func.refreshEarnSnapshot()
        if (!snapshot) return false

        const streak = this.findStreak(snapshot.streaks)
        if (!streak) return false
        if (streak.isCurrentDayCompleted) return true

        this.bot.logger.debug(
            this.bot.isMobile,
            'VISUAL-SEARCH',
            `上报后当日连击仍未完成 | days=${streak.completedDays}/${streak.totalDays} | activities=${streak.activitiesCompleted}/${streak.activitiesTotal}`
        )
        return false
    }
}
