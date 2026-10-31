import { ClaimReward } from './ClaimReward'
import { activityFailure, activityResult } from '../../shared/ActivityResult'
import { URLs } from '../../../constants/urls'
import { BaseActivity } from '../../shared/activities/BaseActivity'
import { isSkippedOffer } from '../../shared/PromotionEligibility'
import { runTaskWithDelay } from '../../shared/TaskPacing'
import type { ParentQuest, QuestChild } from '../../shared/parsers/RewardsPageParser'
import type { BasePromotion, RewardsState, PunchCard } from '../../types/RewardsState'
import { observePunchCard } from '../../shared/PunchCardProgress'

export class ApiPunchCards extends BaseActivity {
    async runMobile(data: RewardsState): Promise<void> {
        try {
            await this.run(data)
        } catch (error) {
            this.bot.recordActivity('punchcards', activityFailure(error))
            this.bot.signal.throwIfAborted()
            this.bot.logger.error(
                'main',
                'PUNCHCARD',
                `Mobile punchcards failed | ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    async runDesktop(): Promise<void> {
        if (!this.bot.config.workers.doPunchCards) return

        let data: RewardsState
        try {
            data = await this.bot.rewards.getDashboardData()
        } catch (error) {
            this.bot.recordActivity('punchcards', activityFailure(error))
            this.bot.signal.throwIfAborted()
            this.bot.logger.warn(
                'main',
                'PUNCHCARD',
                `Desktop punchcard data unavailable | ${error instanceof Error ? error.message : String(error)}`
            )
            return
        }

        try {
            await this.run(data)
        } catch (error) {
            this.bot.recordActivity('punchcards', activityFailure(error))
            this.bot.signal.throwIfAborted()
            this.bot.logger.error(
                'main',
                'PUNCHCARD',
                `Desktop punchcards failed | ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async run(data: RewardsState): Promise<void> {
        const parents = await this.getParentQuests()
        if (!parents) {
            this.bot.recordActivity('punchcard-data', activityResult('unconfirmed', 'quest-list-unavailable'))
            return
        }
        this.bot.recordActivity('punchcard-data', activityResult('confirmed', 'quest-list-loaded'))

        const apiById = new Map(
            (data.dashboard.punchCards ?? [])
                .filter(card => card.parentPromotion?.offerId)
                .map(card => [card.parentPromotion.offerId, card] as const)
        )

        this.mergeApiParents(parents, apiById)
        for (const parent of parents) {
            const card = apiById.get(parent.offerId)
            const steps = card?.childPromotions.length
                ? card.childPromotions.map(child => ({
                      complete: child.complete,
                      locked: child.exclusiveLockedFeatureStatus.toLowerCase() === 'locked'
                  }))
                : undefined
            observePunchCard(this.bot, parent, steps, card?.parentPromotion)
        }
        const pending = parents.filter(parent => {
            if (parent.complete || isSkippedOffer(parent.offerId)) return false
            return !this.bot.config.skipNonPointTasks || parent.pointProgressMax > 0
        })

        if (!pending.length) {
            this.bot.logger.debug(this.bot.isMobile, 'PUNCHCARD', 'No actionable quests')
            return
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'PUNCHCARD',
            `Found ${pending.length} incomplete quest(s) | apiMatched=${pending.filter(parent => apiById.has(parent.offerId)).length}`
        )

        for (const parent of pending) {
            try {
                await this.solvePunchCard(parent, apiById.get(parent.offerId))
            } catch (error) {
                this.bot.recordActivity('punchcard', activityFailure(error, parent.offerId))
                this.bot.signal.throwIfAborted()
                this.bot.logger.error(
                    this.bot.isMobile,
                    'PUNCHCARD',
                    `Error solving quest "${parent.title || parent.offerId}" | message=${
                        error instanceof Error ? error.message : String(error)
                    }`
                )
            }
        }

        this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', 'Finished processing quests')
    }

    private async getParentQuests(): Promise<ParentQuest[] | null> {
        try {
            const earn = await this.bot.rewards.getRewardsPageHtml(URLs.rewards.earn, '/earn')
            if (!earn) {
                this.bot.logger.warn(this.bot.isMobile, 'PUNCHCARD', '/earn unavailable - cannot list quests')
                return null
            }

            const parents = this.bot.pageParser.snapshotQuestList(earn)
            if (parents.length) return parents

            const dashboard = await this.bot.rewards.getRewardsPageHtml(URLs.rewards.dashboard, '/dashboard')
            return dashboard ? this.bot.pageParser.snapshotQuestList(earn, dashboard) : parents
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'PUNCHCARD',
                `Failed fetching quest list | ${error instanceof Error ? error.message : String(error)}`
            )
            return null
        }
    }

    private mergeApiParents(parents: ParentQuest[], apiById: Map<string, PunchCard>): void {
        const seen = new Set(parents.map(parent => parent.offerId))

        for (const card of apiById.values()) {
            const promotion = card.parentPromotion
            if (!promotion?.offerId || seen.has(promotion.offerId)) continue

            parents.push({
                offerId: promotion.offerId,
                title: promotion.title ?? '',
                pointProgressMax: promotion.pointProgressMax ?? 0,
                pointProgressMaxKnown: promotion.pointProgressMaxKnown,
                complete: Boolean(promotion.complete)
            })
            seen.add(promotion.offerId)
        }

        for (const parent of parents) {
            if (parent.pointProgressMax > 0) continue
            parent.pointProgressMax = apiById.get(parent.offerId)?.parentPromotion?.pointProgressMax ?? 0
            parent.pointProgressMaxKnown = apiById.get(parent.offerId)?.parentPromotion?.pointProgressMaxKnown
        }
    }

    private async solvePunchCard(parent: ParentQuest, apiCard: PunchCard | undefined): Promise<void> {
        const parentId = parent.offerId
        const title = parent.title || apiCard?.parentPromotion?.title || parentId
        const children = await this.getQuestChildren(parentId, title)
        if (!children) {
            this.bot.recordActivity('punchcard', activityResult('unconfirmed', 'quest-children-unavailable', parentId))
            return
        }

        const apiChildById = new Map(
            (apiCard?.childPromotions ?? [])
                .filter(child => child.offerId)
                .map(child => [child.offerId, child] as const)
        )
        const ordered = [...children].sort(
            (left, right) =>
                (apiChildById.get(left.offerId)?.priority ?? Number.MAX_SAFE_INTEGER) -
                (apiChildById.get(right.offerId)?.priority ?? Number.MAX_SAFE_INTEGER)
        )

        this.bot.logger.info(
            this.bot.isMobile,
            'PUNCHCARD',
            `Solving "${title}" | children=${ordered.length} | reportable=${ordered.filter(child => child.reportable).length}`
        )

        let reported = 0
        let remaining = 0

        for (const child of ordered) {
            const apiChild = apiChildById.get(child.offerId)
            if (isSkippedOffer(child.offerId, child.destination)) continue

            if (!child.reportable) {
                remaining += 1
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'PUNCHCARD',
                    `Skip ${child.offerId}: not reportable (locked=${child.isLocked} disabled=${child.isDisabled} done=${child.isCompleted} hash=${Boolean(child.hash)})`
                )
                continue
            }

            if (this.isSearchQuotaChild(child.offerId, apiChild)) {
                remaining += 1
                this.bot.logger.debug(this.bot.isMobile, 'PUNCHCARD', `Skip ${child.offerId}: multi-day search task`)
                continue
            }

            const attemptKey = `${parentId}:${child.offerId}`
            if (this.bot.attemptedPunchcardChildren.has(attemptKey)) {
                remaining += 1
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'PUNCHCARD',
                    `Skip ${child.offerId}: already attempted in another browser context`
                )
                continue
            }

            if (this.isClaimChild(child.offerId, apiChild)) {
                if (!this.bot.config.autoClaimPunchcardRewards) {
                    remaining += 1
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'PUNCHCARD',
                        `Reward for "${title}" is ready for manual redemption | offerId=${child.offerId}`
                    )
                    continue
                }
                this.bot.attemptedPunchcardChildren.add(attemptKey)
                await this.bot.activities.claimReward(child, parentId)
            } else {
                this.bot.attemptedPunchcardChildren.add(attemptKey)
                await runTaskWithDelay(this.bot, () => this.reportQuestChild(child, parentId), 'punchcard-child')
            }

            reported += 1
        }

        if (reported > 0) await this.getQuestChildren(parentId, title)

        this.bot.logger.info(
            this.bot.isMobile,
            'PUNCHCARD',
            `Quest "${title}" processed | reported=${reported}` +
                `${remaining ? ` | remaining=${remaining}` : ''}` +
                ` | currentBalance=${this.bot.userData.currentPoints}` +
                `${parent.pointProgressMax > 0 ? ` | targetPoints=${parent.pointProgressMax}` : ''}`
        )
    }

    private async getQuestChildren(parentId: string, title: string): Promise<QuestChild[] | null> {
        try {
            const questUrl = URLs.rewards.quest(parentId)
            const html = await this.bot.rewards.getRewardsPageHtml(questUrl, `/earn/quest/${parentId}`)
            if (!html) {
                this.bot.logger.warn(this.bot.isMobile, 'PUNCHCARD', `Quest page unavailable for "${title}"`)
                return null
            }

            const children = this.bot.pageParser.snapshotQuestPage(html, {
                offerId: parentId,
                title,
                pointProgressMax: 0,
                complete: false
            })
            if (!children.length) {
                this.bot.logger.debug(this.bot.isMobile, 'PUNCHCARD', `No actionable children for "${title}"`)
                return null
            }
            return children
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'PUNCHCARD',
                `Failed fetching quest page for "${title}" | ${error instanceof Error ? error.message : String(error)}`
            )
            return null
        }
    }

    private async reportQuestChild(child: QuestChild, parentId: string): Promise<void> {
        const result = await new ClaimReward(this.bot).run(child, parentId)
        this.bot.recordActivity('punchcard-child', result)
    }

    private isSearchQuotaChild(offerId: string, promotion?: BasePromotion): boolean {
        if (promotion) {
            const type = (promotion.promotionType ?? '').toLowerCase()
            const attributeType = String(this.getAttribute(promotion, 'type') ?? '').toLowerCase()
            const progressMax = Number(promotion.activityProgressMax ?? 0)
            if (type === 'search' || attributeType === 'search' || progressMax > 1) return true
        }
        return /search/i.test(offerId) && /(day|streak|\dx)/i.test(offerId)
    }

    private isClaimChild(offerId: string, promotion?: BasePromotion): boolean {
        if (/\/redeem\//.test((promotion?.destinationUrl ?? '').toLowerCase())) return true
        return /(redeem|claim|(?<!url)reward)/i.test(offerId)
    }

    private getAttribute(promotion: BasePromotion, key: string): unknown {
        const attributes = promotion.attributes
        if (!attributes || typeof attributes !== 'object') return undefined
        return (attributes as Record<string, unknown>)[key]
    }
}
