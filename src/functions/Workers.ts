import { URLs } from '../constants/urls'
import type { MicrosoftRewardsBot } from '../bot/MicrosoftRewardsBot'
import type { DashboardData, PunchCard, BasePromotion } from '../interface/DashboardData'
import type { AppDashboardData } from '../interface/AppDashBoardData'
import type { QuestChild, ParentQuest } from '../browser/ReactFunc'

export class Workers {
    public bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    public async doDailySet(data: DashboardData) {
        const activitiesUncompleted = (data.dashboard.dailySetPromotions[this.bot.utils.getFormattedDate()] ?? []).filter(
            x => !x?.complete && x.pointProgressMax > 0
        )

        await this.runIfAny(activitiesUncompleted, 'DAILY-SET', 'Daily Set', () => this.solveActivities(activitiesUncompleted))
    }

    public async doMorePromotions(data: DashboardData) {
        const morePromotions = [...new Map((data.dashboard.morePromotions ?? []).concat(data.dashboard.morePromotionsWithoutPromotionalItems ?? []).filter(Boolean).map(p => [p.offerId, p as BasePromotion])).values()]

        const activitiesUncompleted = morePromotions.filter(x => {
            if (x.complete || x.pointProgressMax <= 0 || x.exclusiveLockedFeatureStatus === 'locked' || !x.promotionType) {
                return false
            }
            if (x.priority < 0 && x.exclusiveLockedFeatureStatus !== 'unlocked') return false
            return this.getPromotionAttribute(x, 'promotional') !== 'True'
        })

        await this.runIfAny(activitiesUncompleted, 'MORE-PROMOTIONS', 'More Promotions', () => this.solveActivities(activitiesUncompleted))
    }

    public async doAppPromotions(data: AppDashboardData) {
        const appRewards = data.response.promotions.filter(x => {
            const complete = x.attributes['complete']?.toLowerCase()
            const offerId = x.attributes['offerid']
            const type = x.attributes['type']
            return complete === 'false' && Boolean(offerId) && type === 'sapphire'
        })

        await this.runIfAny(appRewards, 'APP-PROMOTIONS', 'App Promotions', async () => {
            for (const reward of appRewards) {
                await this.bot.activities.doAppReward(reward)
                await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 15000))
            }
        })
    }

    public async doPunchCards(data: DashboardData) {
        let parents: ParentQuest[]

        try {
            const earn = await this.bot.browser.func.getRewardsPageHtml(URLs.rewards.earn, '/earn')
            if (!earn) {
                this.bot.logger.warn(this.bot.isMobile, 'PUNCHCARD', '/earn unavailable - cannot list quests')
                return
            }
            parents = this.bot.browser.react.snapshotQuestList(earn)

            if (!parents.length) {
                const dashboard = await this.bot.browser.func.getRewardsPageHtml(URLs.rewards.dashboard, '/dashboard')
                if (dashboard) parents = this.bot.browser.react.snapshotQuestList(earn, dashboard)
            }
        } catch (error) {
            this.bot.logger.warn(this.bot.isMobile, 'PUNCHCARD', `Failed fetching /earn for quest list | ${error instanceof Error ? error.message : String(error)}`)
            return
        }

        const apiById = new Map((data.dashboard.punchCards ?? []).filter(c => c.parentPromotion?.offerId).map(c => [c.parentPromotion.offerId, c] as const))
        const seen = new Set(parents.map(p => p.offerId))

        for (const card of apiById.values()) {
            const offerId = card.parentPromotion?.offerId
            if (!offerId || seen.has(offerId)) continue
            parents.push({ offerId, title: card.parentPromotion?.title ?? '', pointProgressMax: card.parentPromotion?.pointProgressMax ?? 0, complete: !!card.parentPromotion?.complete })
            seen.add(offerId)
        }

        parents.forEach(parent => {
            if (parent.pointProgressMax <= 0) {
                parent.pointProgressMax = apiById.get(parent.offerId)?.parentPromotion?.pointProgressMax ?? parent.pointProgressMax
            }
        })

        const incomplete = parents.filter(parent => !parent.complete && (!this.bot.config.skipNonPointTasks || parent.pointProgressMax > 0))
        if (!incomplete.length) {
            this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', 'No actionable quests')
            return
        }

        this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', `Found ${incomplete.length} incomplete quest(s) on /earn | api-matched=${incomplete.filter(parent => apiById.has(parent.offerId)).length}`)

        for (const parent of incomplete) {
            try {
                await this.solvePunchCard(parent, apiById.get(parent.offerId))
            } catch (error) {
                this.bot.logger.error(this.bot.isMobile, 'PUNCHCARD', `Error solving quest "${parent.title || parent.offerId}" | message=${error instanceof Error ? error.message : String(error)}`)
            }
        }

        this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', 'Finished processing quests')
    }

    public async doClaimBonusPoints() {
        // Let's just always try to do this
        await this.bot.activities.doClaimBonusPoints()
    }

    private async runIfAny<T>(items: T[], tag: string, label: string, action: () => Promise<void>) {
        if (!items.length) {
            this.bot.logger.info(this.bot.isMobile, tag, `All "${label}" items have already been completed`)
            return
        }

        this.bot.logger.info(this.bot.isMobile, tag, `Started solving ${items.length} "${label}" items`)
        await action()
        this.bot.logger.info(this.bot.isMobile, tag, `All "${label}" items have been completed`)
    }

    private async solvePunchCard(parent: ParentQuest, apiCard: PunchCard | undefined) {
        const parentId = parent.offerId
        const title = parent.title || apiCard?.parentPromotion?.title || parentId

        let questChildren: QuestChild[]
        try {
            const questUrl = URLs.rewards.quest(parentId)
            const html = await this.bot.browser.func.getRewardsPageHtml(questUrl, `/earn/quest/${parentId}`)
            if (!html) {
                this.bot.logger.warn(this.bot.isMobile, 'PUNCHCARD', `Quest page unavailable for "${title}" - skipping`)
                return
            }
            questChildren = this.bot.browser.react.snapshotQuestPage(html)
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'PUNCHCARD',
                `Failed fetching quest page for "${title}" | ${error instanceof Error ? error.message : String(error)}`
            )
            return
        }

        if (!questChildren.length) {
            this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', `No actionable children rendered for "${title}"`)
            return
        }

        const apiChildById = new Map(
            (apiCard?.childPromotions ?? []).filter(c => c.offerId).map(c => [c.offerId, c] as const)
        )
        const ordered = [...questChildren].sort(
            (a, b) =>
                (apiChildById.get(a.offerId)?.priority ?? Number.MAX_SAFE_INTEGER) -
                (apiChildById.get(b.offerId)?.priority ?? Number.MAX_SAFE_INTEGER)
        )

        this.bot.logger.info(
            this.bot.isMobile,
            'PUNCHCARD',
            `Solving "${title}" | children=${ordered.length} | reportable=${ordered.filter(c => c.reportable).length}`
        )

        const startBalance = this.bot.userData.currentPoints
        let reported = 0
        let remaining = 0

        for (const child of ordered) {
            const offerId = child.offerId
            const api = apiChildById.get(offerId)

            if (!child.reportable) {
                remaining++
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'PUNCHCARD',
                    `Skip ${offerId}: not reportable (locked=${child.isLocked} disabled=${child.isDisabled} done=${child.isCompleted} hash=${!!child.hash})`
                )
                continue
            }

            if (this.isSearchQuotaChild(offerId, api)) {
                remaining++
                this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', `Skip ${offerId}: multi-day search task`)
                continue
            }

            if (this.isClaimChild(offerId, api)) {
                if (!this.bot.config.autoClaimPunchcardRewards) {
                    remaining++
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'PUNCHCARD',
                        `Reward for "${title}" ready to claim - left for manual redemption (autoClaimPunchcardRewards=false) | ${offerId}`
                    )
                    continue
                }
                await this.bot.activities.doClaimReward(child, parentId)
                reported++
                continue
            }

            await this.reportQuestChild(child, parentId)
            reported++
            await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 15000))
        }

        const gained = this.bot.userData.currentPoints - startBalance
        this.bot.logger.info(
            this.bot.isMobile,
            'PUNCHCARD',
            `Quest "${title}" ${remaining === 0 ? 'COMPLETE' : 'in progress'} | reported=${reported}${remaining ? ` | remaining=${remaining}` : ''} | pointsGained=${gained} | currentBalance=${this.bot.userData.currentPoints}${parent.pointProgressMax > 0 ? ` | targetPoints=${parent.pointProgressMax}` : ''}`,
            gained > 0 ? 'green' : undefined
        )
    }

    private async reportQuestChild(child: QuestChild, parentId: string) {
        const offerId = child.offerId
        const actionId = this.bot.nextActions.reportActivity
        if (!actionId) {
            this.bot.logger.warn(this.bot.isMobile, 'PUNCHCARD', `Skip ${offerId}: "reportActivity" not discovered`)
            return
        }
        if (!child.hash) {
            this.bot.logger.warn(this.bot.isMobile, 'PUNCHCARD', `Skip ${offerId}: no live hash on quest child`)
            return
        }

        const oldBalance = this.bot.userData.currentPoints
        try {
            const questUrl = URLs.rewards.quest(parentId)
            const { status, acknowledged } = await this.bot.browser.func.reportServerAction(
                actionId,
                [
                    child.hash,
                    11,
                    { offerid: offerId, isPromotional: '$undefined', timezoneOffset: this.bot.userData.timezoneOffset }
                ],
                {
                    url: questUrl,
                    referer: questUrl,
                    routerStateTree: this.bot.browser.react.questRouterStateTree(parentId)
                }
            )

            const newBalance = await this.bot.browser.func.getCurrentPoints()
            const gained = newBalance - oldBalance
            if (gained > 0) {
                this.bot.userData.currentPoints = newBalance
                this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + gained
            }

            this.bot.logger.info(
                this.bot.isMobile,
                'PUNCHCARD',
                `Reported child | offerId=${offerId} | status=${status} | acknowledged=${acknowledged} | pointsGained=${gained} | currentBalance=${newBalance}`,
                gained > 0 || acknowledged ? 'green' : undefined
            )
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'PUNCHCARD',
                `Error reporting child | offerId=${offerId} | message=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async solveActivities(activities: BasePromotion[]) {
        for (const activity of activities) {
            try {
                const type = activity.promotionType?.toLowerCase() ?? ''
                const name = activity.name?.toLowerCase() ?? ''
                const offerId = activity.offerId

                this.bot.logger.debug(this.bot.isMobile, 'ACTIVITY', `Processing activity | title="${activity.title}" | offerId=${offerId} | type=${type}`)

                if (type !== 'urlreward') {
                    this.bot.logger.warn(this.bot.isMobile, 'ACTIVITY', `Skipped activity "${activity.title}" | offerId=${offerId} | Reason: Unsupported type "${activity.promotionType}"`)
                    continue
                }

                const isSearchOnBing = name.includes('exploreonbing')
                const enabled = isSearchOnBing ? this.bot.config.activities.searchOnBing : this.bot.config.activities.urlReward
                const disabledLabel = isSearchOnBing ? 'SearchOnBing' : 'UrlReward'

                if (!enabled) {
                    this.bot.logger.info(this.bot.isMobile, 'ACTIVITY', `Skipping "${disabledLabel}" (disabled in config) | offerId=${offerId}`)
                    continue
                }

                this.bot.logger.info(this.bot.isMobile, 'ACTIVITY', `Found activity type "${disabledLabel}" | title="${activity.title}" | offerId=${offerId}`)

                if (isSearchOnBing) {
                    const page = this.bot.isMobile ? this.bot.mainMobilePage : this.bot.mainDesktopPage
                    await this.bot.activities.doSearchOnBing(activity, page)
                } else {
                    await this.bot.activities.doUrlReward(activity)
                }

                await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 15000))
            } catch (error) {
                this.bot.logger.error(this.bot.isMobile, 'ACTIVITY', `Error while solving activity "${activity.title}" | message=${error instanceof Error ? error.message : String(error)}`)
            }
        }
    }

    // Util
    private getPromotionAttribute(promotion: BasePromotion, key: string): unknown {
        const attributes = promotion.attributes
        if (!attributes || typeof attributes !== 'object') return undefined
        return (attributes as Record<string, unknown>)[key]
    }

    private isSearchQuotaChild(offerId: string, api?: BasePromotion): boolean {
        if (api) {
            const type = (api.promotionType ?? '').toLowerCase()
            const attrType = String(this.getPromotionAttribute(api, 'type') ?? '').toLowerCase()
            const progressMax = Number(api.activityProgressMax ?? 0)
            if (type === 'search' || attrType === 'search' || progressMax > 1) {
                return true
            }
        }

        return /search/i.test(offerId) && /(day|streak|\dx)/i.test(offerId)
    }

    private isClaimChild(offerId: string, api?: BasePromotion): boolean {
        const dest = (api?.destinationUrl ?? '').toLowerCase()
        if (/\/redeem\//.test(dest)) return true
        return /(redeem|claim|(?<!url)reward)/i.test(offerId)
    }
}
