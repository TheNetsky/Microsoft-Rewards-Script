import type { Page } from 'patchright'
import type { AxiosRequestConfig } from 'axios'
import * as fs from 'fs'
import type { MicrosoftRewardsBot } from '../index'
import type {
    DashboardData,
    PunchCard,
    BasePromotion,
    FindClippyPromotion,
    PurplePromotionalItem
} from '../interface/DashboardData'
import type { AppDashboardData } from '../interface/AppDashBoardData'
import type { FlyoutPromotion } from '../interface/PanelFlyoutData'

interface PanelMappedPromotionForSolver extends Partial<BasePromotion> {
    offerId: string
    title: string
    complete: boolean
    promotionType: string
    attributes: Record<string, unknown>
    destinationUrl: string
    exclusiveLockedFeatureStatus: NonNullable<BasePromotion['exclusiveLockedFeatureStatus']>
    pointProgressMax: number
    pointProgress: number
    activityProgress: number
    activityProgressMax: number
    name?: string
    description?: string
    linkText?: string
    hash?: string
}

export class Workers {
    public bot: MicrosoftRewardsBot
    private readonly extraSearchOfferIds = new Set([
        'ww_rewards_banner_search_april_202604'
    ])

    private isExtraSearchOffer(offerId: unknown): boolean {
        return this.extraSearchOfferIds.has(String(offerId ?? '').toLowerCase())
    }

    private filterOutExtraSearchOffers<T extends { offerId?: unknown }>(activities: T[]): T[] {
        return activities.filter(a => !this.isExtraSearchOffer(a.offerId))
    }

    private isModernPunchCardOfferId(offerId: unknown): boolean {
        const value = String(offerId ?? '').toLowerCase()
        if (!value) return false
        return /_pcchild\d+_/i.test(value) || /_pcparent_/i.test(value)
    }

    private isModernPunchCardDestination(destinationUrl: unknown): boolean {
        const value = String(destinationUrl ?? '').toLowerCase()
        if (!value) return false
        return /\/earn\/quest\/[^"\s]*pcparent/i.test(value)
    }

    private isModernPunchCardActivity(activity: BasePromotion): boolean {
        return (
            this.isModernPunchCardOfferId(activity.offerId) ||
            this.isModernPunchCardDestination(activity.destinationUrl) ||
            this.isModernPunchCardOfferId(this.getAttributes(activity.attributes).offerid)
        )
    }

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    protected getAttributes(attributes: unknown): Record<string, unknown> {
        if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
            return {}
        }
        return attributes as Record<string, unknown>
    }

    protected mapPanelPromotion(p: FlyoutPromotion): BasePromotion {
        return ({
            ...p,
            // Some panel payloads use activityType while solver expects promotionType.
            promotionType: p.promotionType || p.activityType || 'urlreward',
            attributes: p.attributes ?? {},
            destinationUrl: p.destinationUrl ?? '',
            exclusiveLockedFeatureStatus: p.exclusiveLockedFeatureStatus ?? 'unlocked',
            pointProgressMax: Number(p.pointProgressMax ?? 0),
            pointProgress: Number(p.pointProgress ?? 0),
            activityProgress: Number(p.activityProgress ?? 0),
            activityProgressMax: Number(p.activityProgressMax ?? 0)
        } as PanelMappedPromotionForSolver) as BasePromotion
    }

    private dedupePromotionsByOfferId(promotions: BasePromotion[]): BasePromotion[] {
        const seen = new Map<string, BasePromotion>()

        promotions.forEach((promotion, index) => {
            const attrs = this.getAttributes(promotion.attributes)
            const key = String(promotion.offerId ?? attrs.offerid ?? attrs.offerId ?? '').toLowerCase() || `__idx_${index}`
            seen.set(key, promotion)
        })

        return [...seen.values()]
    }

    private getPanelMorePromotions(): BasePromotion[] {
        const panelMorePromotions = this.bot.panelData?.flyoutResult?.morePromotions ?? []
        return this.dedupePromotionsByOfferId(panelMorePromotions.filter(Boolean).map(p => this.mapPanelPromotion(p)))
    }

    private getDashboardMorePromotions(data: DashboardData): BasePromotion[] {
        return this.dedupePromotionsByOfferId(
            [...(data.morePromotions ?? []), ...(data.morePromotionsWithoutPromotionalItems ?? [])]
                .filter(Boolean)
                .map(p => p as BasePromotion)
        )
    }

    private isExploreOnBingActivationOffer(activity: BasePromotion): boolean {
        const attrs = this.getAttributes(activity.attributes)
        const name = String(activity.name ?? '').toLowerCase()
        const offerId = String(activity.offerId ?? '').toLowerCase()
        const attrsOfferId = String(attrs.offerid ?? attrs.offerId ?? '').toLowerCase()

        return (
            name.includes('exploreonbing_activation') ||
            offerId.includes('exploreonbing_activation') ||
            attrsOfferId.includes('exploreonbing_activation')
        )
    }

    protected isCompletedByAttributesOrProgress(activity: BasePromotion): boolean {
        const attrs = this.getAttributes(activity.attributes)
        const progress = Number(activity.pointProgress ?? attrs.progress ?? 0)
        const max = Number(activity.pointProgressMax ?? attrs.max ?? 0)
        const completeRaw = attrs.complete
        const attrsComplete =
            typeof completeRaw === 'string' ? completeRaw.toLowerCase() === 'true' : Boolean(completeRaw)

        return attrsComplete || (max > 0 && progress >= max)
    }

    private async readDashboardCompletion(offerId: string): Promise<{ complete: boolean; progress: number; max: number }> {
        try {
            const dashboard = await this.bot.browser.func.getDashboardData()
            const allDaily = Object.values(dashboard.dailySetPromotions ?? {}).flat()
            const allMore = [
                ...(dashboard.morePromotions ?? []),
                ...(dashboard.morePromotionsWithoutPromotionalItems ?? []),
                ...(dashboard.promotionalItems ?? [])
            ]
            const allPunch = (dashboard.punchCards ?? []).flatMap(pc => [pc.parentPromotion, ...(pc.childPromotions ?? [])])
            const all = [...allDaily, ...allMore, ...allPunch] as unknown as BasePromotion[]
            const key = offerId.toLowerCase()

            const found = all.find(x => {
                const attrs = this.getAttributes(x.attributes)
                const top = String(x.offerId ?? '').toLowerCase()
                const attrOffer = String(attrs.offerid ?? attrs.offerId ?? '').toLowerCase()
                return top === key || attrOffer === key
            })

            if (!found) {
                return { complete: false, progress: 0, max: 0 }
            }

            const attrs = this.getAttributes(found.attributes)
            const progress = Number(found.pointProgress ?? attrs.progress ?? 0)
            const max = Number(found.pointProgressMax ?? attrs.max ?? 0)
            return {
                complete: this.isCompletedByAttributesOrProgress(found),
                progress,
                max
            }
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'ACTIVITY',
                `Dashboard recheck failed | offerId=${offerId} | error=${error instanceof Error ? error.message : String(error)}`
            )
            return { complete: false, progress: 0, max: 0 }
        }
    }

    private async refreshSessionCookiesFromPage(page: Page): Promise<void> {
        try {
            const latestCookies = await page.context().cookies()
            if (this.bot.isMobile) {
                this.bot.cookies.mobile = latestCookies
            } else {
                this.bot.cookies.desktop = latestCookies
            }
            this.bot.logger.debug(
                this.bot.isMobile,
                'PUNCHCARD',
                `Refreshed cookie jar from active page context | count=${latestCookies.length}`
            )
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'PUNCHCARD',
                `Failed to refresh cookies from active page context | error=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private getActiveRewardsPage(preferredPage?: Page): Page {
        if (preferredPage && !preferredPage.isClosed()) {
            return preferredPage
        }

        const fallbackPage = this.bot.isMobile ? this.bot.mainMobilePage : this.bot.mainDesktopPage
        if (fallbackPage && !fallbackPage.isClosed()) {
            return fallbackPage
        }

        throw new Error('No active rewards page available for browser-context request')
    }

    private async fetchRscWithBrowserContext(
        page: Page,
        url: string,
        headers: Record<string, string>
    ): Promise<{ status: number; text: string }> {
        try {
            const response = await page.context().request.get(url, {
                failOnStatusCode: false,
                headers
            })

            return {
                status: response.status(),
                text: await response.text()
            }
        } catch (contextRequestError) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'PUNCHCARD',
                `Context request failed, using page fetch fallback | error=${
                    contextRequestError instanceof Error ? contextRequestError.message : String(contextRequestError)
                }`
            )

            return await page.evaluate(
                async ({ requestUrl, requestHeaders }) => {
                    const response = await fetch(requestUrl, {
                        method: 'GET',
                        credentials: 'include',
                        cache: 'no-store',
                        headers: requestHeaders
                    })

                    return {
                        status: response.status,
                        text: await response.text()
                    }
                },
                {
                    requestUrl: url,
                    requestHeaders: headers
                }
            )
        }
    }

    public async doDailySet(data: DashboardData, page: Page) {
        const todayKey = this.bot.utils.getFormattedDate()
        const todayData = data.dailySetPromotions[todayKey]

        const activitiesUncompleted =
            todayData?.filter(x => {
                const activity = x as BasePromotion
                const isCompleted = this.isCompletedByAttributesOrProgress(activity)
                return !isCompleted && x.pointProgressMax > 0
            }) ?? []
        const activitiesUncompletedFiltered = this.filterOutExtraSearchOffers(activitiesUncompleted)

        if (!activitiesUncompletedFiltered.length) {
            this.bot.logger.info(this.bot.isMobile, 'DAILY-SET', 'All "Daily Set" items have already been completed')
            return
        }

        this.bot.logger.info(this.bot.isMobile, 'DAILY-SET', 'Started solving "Daily Set" items')

        await this.solveActivities(activitiesUncompletedFiltered, page)

        this.bot.logger.info(this.bot.isMobile, 'DAILY-SET', 'All "Daily Set" items have been completed')
    }

    public async doMorePromotions(data: DashboardData, page: Page) {
        const panelSource = this.getPanelMorePromotions()
        const dashboardSource = this.getDashboardMorePromotions(data)
        const morePromotions: BasePromotion[] = panelSource.length > 0 ? panelSource : dashboardSource

        if (panelSource.length > 0) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'MORE-PROMOTIONS',
                `Using panel flyout source for more promotions | count=${morePromotions.length}`
            )
        } else {
            this.bot.logger.debug(
                this.bot.isMobile,
                'MORE-PROMOTIONS',
                `Panel flyout source unavailable, using dashboard source | count=${morePromotions.length}`
            )
        }

        const activitiesUncompleted: BasePromotion[] =
            morePromotions?.filter(x => {
                const isCompleted = this.isCompletedByAttributesOrProgress(x)
                if (isCompleted) return false
                if (this.bot.config.workers.doExploreOnBingActivation && this.isExploreOnBingActivationOffer(x)) {
                    return false
                }
                const attrs = this.getAttributes(x.attributes)
                const maxPoints = x?.pointProgressMax || Number(attrs.max ?? 0) || 0
                if (maxPoints <= 0 && x.exclusiveLockedFeatureStatus !== 'notsupported') return false
                if (x.exclusiveLockedFeatureStatus === 'locked') return false

                const type = x.promotionType || String(attrs.type ?? '')
                if (!type) return false

                return true
            }) ?? []

        const filteredActivities = this.filterOutExtraSearchOffers(activitiesUncompleted)

        if (!filteredActivities.length) {
            this.bot.logger.info(
                this.bot.isMobile,
                'MORE-PROMOTIONS',
                'All "More Promotion" items have already been completed'
            )
            return
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'MORE-PROMOTIONS',
            `Started solving ${filteredActivities.length} "More Promotions" items`
        )

        await this.solveActivities(filteredActivities, page)

        this.bot.logger.info(this.bot.isMobile, 'MORE-PROMOTIONS', 'All "More Promotion" items have been completed')
    }

    public async doExploreOnBingActivation(data: DashboardData, page: Page) {
        const panelSource = this.getPanelMorePromotions()
        const dashboardSource = this.getDashboardMorePromotions(data)

        // Merge panel + dashboard so activation offers missing in panel are still discoverable.
        const sourcePromotions = this.dedupePromotionsByOfferId([...panelSource, ...dashboardSource])

        this.bot.logger.debug(
            this.bot.isMobile,
            'EXPLOREONBING-ACTIVATION',
            `Activation source merge | panel=${panelSource.length} | dashboard=${dashboardSource.length} | merged=${sourcePromotions.length}`
        )

        const activationActivities = sourcePromotions.filter(x => {
            if (!this.isExploreOnBingActivationOffer(x)) return false
            if (this.isCompletedByAttributesOrProgress(x)) return false
            if (x.exclusiveLockedFeatureStatus === 'locked') return false

            const attrs = this.getAttributes(x.attributes)
            const type = (x.promotionType || String(attrs.type ?? '')).toLowerCase()
            return type === 'urlreward'
        })

        if (!activationActivities.length) {
            this.bot.logger.info(
                this.bot.isMobile,
                'EXPLOREONBING-ACTIVATION',
                'No pending exploreonbing_activation activities found'
            )
            return
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'EXPLOREONBING-ACTIVATION',
            `Started separate exploreonbing_activation worker | count=${activationActivities.length}`
        )

        await this.solveActivities(activationActivities, page)

        this.bot.logger.info(
            this.bot.isMobile,
            'EXPLOREONBING-ACTIVATION',
            'Completed separate exploreonbing_activation worker'
        )
    }

    /**
     * Run the deferred "extra search" banner offer after normal search counters are done.
     * Called from `SearchManager` while browser sessions are still open.
     */
    public async doDeferredExtraSearch(page: Page): Promise<void> {
        const data = await this.bot.browser.func.getDashboardData()

        const allDaily = Object.values(data.dailySetPromotions ?? {}).flat()
        const allMore = [
            ...(data.morePromotions ?? []),
            ...(data.morePromotionsWithoutPromotionalItems ?? []),
            ...(data.promotionalItems ?? [])
        ]

        const allPunchCardPromos = (data.punchCards ?? []).flatMap(pc => [pc.parentPromotion, ...(pc.childPromotions ?? [])])

        // Dashboard promotion types are structurally compatible, but TS generics differ; cast to the solver shape.
        const allPromotions: BasePromotion[] = ([...allDaily, ...allMore, ...allPunchCardPromos] as unknown) as BasePromotion[]

        const extraOffers = [
            ...new Map(
                allPromotions
                    .filter(p => this.isExtraSearchOffer(p.offerId))
                    .filter(p => !p.complete)
                    .map(p => [p.offerId, p] as const)
            ).values()
        ]

        if (!extraOffers.length) {
            this.bot.logger.debug(this.bot.isMobile, 'DEFERRED-EXTRA', 'No pending extra-search offers found')
            return
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'DEFERRED-EXTRA',
            `Solving deferred extra-search offers | count=${extraOffers.length}`
        )
        await this.solveActivities(extraOffers, page)
    }

    public async doAppPromotions(data: AppDashboardData) {
        const appRewards = data.response.promotions.filter(x => {
            if (x.attributes['complete']?.toLowerCase() !== 'false') return false
            if (!x.attributes['offerid']) return false
            if (!x.attributes['type']) return false
            if (x.attributes['type'] !== 'sapphire') return false

            return true
        })

        if (!appRewards.length) {
            this.bot.logger.info(
                this.bot.isMobile,
                'APP-PROMOTIONS',
                'All "App Promotions" items have already been completed'
            )
            return
        }

        for (const reward of appRewards) {
            await this.bot.activities.doAppReward(reward)
            // A delay between completing each activity
            await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 15000))
        }

        this.bot.logger.info(this.bot.isMobile, 'APP-PROMOTIONS', 'All "App Promotions" items have been completed')
    }

    public async doSpecialPromotions(data: DashboardData) {
        const specialPromotions: PurplePromotionalItem[] = [
            ...new Map(
                [...(data.promotionalItems ?? [])]
                    .filter(Boolean)
                    .map(p => [p.offerId, p as PurplePromotionalItem] as const)
            ).values()
        ]

        const supportedPromotions = ['ww_banner_optin_2x']

        const specialPromotionsUncompleted: PurplePromotionalItem[] =
            specialPromotions?.filter(x => {
                if (x?.complete) return false
                if (x?.exclusiveLockedFeatureStatus === 'locked') return false
                if (!x.promotionType) return false

                const offerId = (x.offerId ?? '').toLowerCase()
                return supportedPromotions.some(s => offerId.includes(s))
            }) ?? []

        for (const activity of specialPromotionsUncompleted) {
            try {
                const type = activity.promotionType?.toLowerCase() ?? ''
                const name = activity.name?.toLowerCase() ?? ''
                const offerId = (activity as PurplePromotionalItem).offerId

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SPECIAL-ACTIVITY',
                    `Processing activity | title="${activity.title}" | offerId=${offerId} | type=${type}"`
                )

                switch (type) {
                    // UrlReward
                    case 'urlreward': {
                        // Special "Double Search Points" activation
                        if (name.includes('ww_banner_optin_2x')) {
                            this.bot.logger.info(
                                this.bot.isMobile,
                                'ACTIVITY',
                                `Found activity type "Double Search Points" | title="${activity.title}" | offerId=${offerId}`
                            )

                            await this.bot.activities.doDoubleSearchPoints(activity)
                        }
                        break
                    }

                    // Unsupported types
                    default: {
                        this.bot.logger.warn(
                            this.bot.isMobile,
                            'SPECIAL-ACTIVITY',
                            `Skipped activity "${activity.title}" | offerId=${offerId} | Reason: Unsupported type "${activity.promotionType}"`
                        )
                        break
                    }
                }
            } catch (error) {
                this.bot.logger.error(
                    this.bot.isMobile,
                    'SPECIAL-ACTIVITY',
                    `Error while solving activity "${activity.title}" | message=${error instanceof Error ? error.message : String(error)}`
                )
            }
        }

        this.bot.logger.info(this.bot.isMobile, 'SPECIAL-ACTIVITY', 'All "Special Activites" items have been completed')
    }

    public async doPunchCards(data: DashboardData, page: Page) {
        await this.refreshSessionCookiesFromPage(page)
        this.bot.logger.info(
            this.bot.isMobile,
            'PUNCHCARD',
            `Punchcard flow selected | rewardsVersion=${this.bot.rewardsVersion}`
        )

        if (this.bot.rewardsVersion === 'modern') {
            const modernActivities = await this.getModernPunchCardActivitiesFromRsc(page)

            if (!modernActivities.length) {
                this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', 'No modern punchcard activities found in earn RSC')
                return
            }

            this.bot.logger.info(
                this.bot.isMobile,
                'PUNCHCARD',
                `Started solving ${modernActivities.length} "Punch Card" items (modern RSC)`
            )

            const filteredModernActivities = this.filterOutExtraSearchOffers(
                modernActivities.filter(activity => !activity.complete)
            )
            if (!filteredModernActivities.length) {
                this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', 'All modern punchcard activities already completed (extra-search filtered)')
                return
            }

            await this.solveActivities(filteredModernActivities, page)
            this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', 'All "Punch Card" items have been completed')
            return
        }

        const punchCards = data.punchCards ?? []

        const getLegacyChildType = (x: BasePromotion): string =>
            (x.promotionType || String(this.getAttributes(x.attributes).type ?? '')).toLowerCase()

        const isLegacyChildCandidate = (x: BasePromotion): boolean => {
            if (x?.complete) return false
            if (x?.exclusiveLockedFeatureStatus === 'locked') return false

            // Some legacy payloads have missing/empty promotionType while still being valid punchcard children.
            const type = getLegacyChildType(x)
            if (type) return true

            return /_pcchild\d+_/i.test(x.offerId ?? '')
        }

        const totalActivitiesUncompleted = punchCards.reduce((count, punchCard) => {
            const uncompleted =
                punchCard.childPromotions?.filter(x => isLegacyChildCandidate(x as BasePromotion)) ?? []
            return count + this.filterOutExtraSearchOffers(uncompleted).length
        }, 0)

        if (!totalActivitiesUncompleted) {
            this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', 'All "Punch Card" items have already been completed')
            return
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'PUNCHCARD',
            `Started solving ${totalActivitiesUncompleted} "Punch Card" items`
        )

        for (const punchCard of punchCards) {
            const activitiesUncompleted: BasePromotion[] =
                punchCard.childPromotions?.filter(x => isLegacyChildCandidate(x as BasePromotion)) ?? []

            const activitiesUncompletedFiltered = this.filterOutExtraSearchOffers(activitiesUncompleted)
            if (!activitiesUncompletedFiltered.length) continue

            await this.solveLegacyPunchCardActivities(activitiesUncompletedFiltered, page, punchCard)
        }

        this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', 'All "Punch Card" items have been completed')
    }

    private buildLegacyPunchCardParentUrl(parentOfferId: string): string {
        return `https://rewards.bing.com/dashboard/${parentOfferId}`
    }

    private async fetchLegacyPunchCardParentHtml(parentOfferId: string): Promise<string> {
        const parentUrl = this.buildLegacyPunchCardParentUrl(parentOfferId)
        const headers = {
            ...(this.bot.fingerprint?.headers ?? {}),
            Cookie: this.bot.browser.func.buildCookieHeader(
                this.bot.isMobile ? this.bot.cookies.mobile : this.bot.cookies.desktop,
                ['bing.com', 'live.com', 'microsoftonline.com']
            ),
            Referer: 'https://rewards.bing.com/dashboard',
            Origin: 'https://rewards.bing.com'
        }

        for (let attempt = 0; attempt < 2; attempt++) {
            const url = attempt === 0 ? parentUrl : `${parentUrl}?refresh=${Date.now()}`
            try {
                const response = await this.bot.axios.request({
                    method: 'GET',
                    url,
                    headers
                })
                const html = typeof response.data === 'string' ? response.data : String(response.data ?? '')
                if (html) {
                    return html
                }
            } catch (error) {
                const status = (error as { response?: { status?: number } })?.response?.status
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'PUNCHCARD',
                    `Parent HTML fetch failed | parentOfferId=${parentOfferId} | attempt=${attempt + 1} | status=${status ?? 'n/a'} | error=${error instanceof Error ? error.message : String(error)}`
                )
            }
        }

        return ''
    }

    private inspectLegacyPunchCardChildState(
        parentHtml: string,
        child: BasePromotion
    ): {
        complete: boolean
        isTimeGated: boolean
        waitingWindow: boolean
        parentName: string
    } {
        const parentName =
            child.offerId.replace(/_pcchild\d+_.*/i, '_pcparent') ||
            child.offerId.replace(/_pcchild\d+/i, '_pcparent')
        const lcHtml = parentHtml.toLowerCase()
        const childKey = String(child.offerId ?? '').toLowerCase()
        const childPos = childKey ? lcHtml.indexOf(childKey) : -1
        const windowText =
            childPos >= 0
                ? lcHtml.slice(Math.max(0, childPos - 5000), Math.min(lcHtml.length, childPos + 10000))
                : lcHtml

        const complete =
            windowText.includes('offer-complete-card-button') ||
            windowText.includes('see what\'s inside') ||
            windowText.includes('win-icon-checkmark') ||
            child.complete

        const isTimeGated =
            /\b24\s*hours?\b/i.test(windowText) ||
            /\b\d+\s*\/\s*\d+\s*days?\b/i.test(windowText) ||
            /\bconsecutive\s+days?\b/i.test(windowText)
        const waitingWindow =
            /\bwait\s+24\s*hours?\b/i.test(windowText) ||
            /\bcome\s+back\b/i.test(windowText) ||
            /\bnext\s+punch\b/i.test(windowText)

        return { complete, isTimeGated, waitingWindow, parentName }
    }

    private async clickLegacyPunchCardCta(
        page: Page,
        parentOfferId: string,
        childIndex: number,
        child: BasePromotion
    ): Promise<boolean> {
        const parentUrl = this.buildLegacyPunchCardParentUrl(parentOfferId)
        await page.goto(parentUrl, { waitUntil: 'domcontentloaded' })
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
        await this.bot.browser.utils.tryDismissAllMessages(page)

        const clicked = await page.evaluate(
            ({ offerId, index }) => {
                const normalize = (s: string) => (s ?? '').toLowerCase()
                const ctas = Array.from(document.querySelectorAll('div.punchcard-cta.btn'))
                if (!ctas.length) return false

                const findCardForOffer = () => {
                    const key = normalize(offerId)
                    const all = Array.from(document.querySelectorAll('div,section,article,li'))
                    for (const node of all) {
                        const text = normalize(node.textContent ?? '')
                        const html = normalize(node.innerHTML ?? '')
                        if (!key || (!text.includes(key) && !html.includes(key))) continue
                        const cta = node.querySelector('div.punchcard-cta.btn') as HTMLElement | null
                        if (cta) return cta
                    }
                    return null
                }

                const offerCardCta = findCardForOffer()
                if (offerCardCta) {
                    offerCardCta.click()
                    return true
                }

                const fallback = ctas[index] as HTMLElement | undefined
                if (!fallback) return false
                fallback.click()
                return true
            },
            { offerId: child.offerId, index: childIndex }
        )

        if (!clicked) {
            return false
        }

        await this.bot.utils.wait(this.bot.utils.randomDelay(2000, 3500))
        const pages = page.context().pages()
        for (const p of pages) {
            if (p !== page && !p.isClosed()) {
                await p.close().catch(() => {})
            }
        }
        await page.goto(parentUrl, { waitUntil: 'domcontentloaded' }).catch(() => {})
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
        return true
    }

    private async solveLegacyPunchCardActivities(activities: BasePromotion[], page: Page, punchCard: PunchCard) {
        const parentOfferId = String(punchCard.parentPromotion?.offerId ?? '').trim()
        if (!parentOfferId) {
            await this.solveActivities(activities, page, punchCard)
            return
        }

        let resolvedTimedActivity = false
        for (let i = 0; i < activities.length; i++) {
            const activity = activities[i]
            if (!activity || activity.complete) continue

            try {
                const parentHtml = await this.fetchLegacyPunchCardParentHtml(parentOfferId)
                const childState = this.inspectLegacyPunchCardChildState(parentHtml, activity)
                const progressLabel = `${activity.activityProgress ?? 0}/${activity.activityProgressMax ?? 0}`
                const scopedName = `${childState.parentName} :: ${activity.offerId}`

                if (childState.complete) {
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'PUNCHCARD',
                        `Skipping completed legacy child | child=${scopedName} | progress=${progressLabel}`
                    )
                    continue
                }

                if (childState.isTimeGated && (childState.waitingWindow || resolvedTimedActivity)) {
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'PUNCHCARD',
                        `Skipping gated legacy child for now | child=${scopedName} | waiting=${childState.waitingWindow} | alreadyRanTimed=${resolvedTimedActivity}`
                    )
                    continue
                }

                this.bot.logger.info(
                    this.bot.isMobile,
                    'PUNCHCARD',
                    `Processing legacy child via parent CTA | parent=${parentOfferId} | child=${scopedName}`
                )

                const clicked = await this.clickLegacyPunchCardCta(page, parentOfferId, i, activity)
                if (!clicked) {
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'PUNCHCARD',
                        `CTA click failed for legacy child | parent=${parentOfferId} | child=${scopedName}`
                    )
                    continue
                }

                const attrs = this.getAttributes(activity.attributes)
                const type = (activity.promotionType || String(attrs.type ?? '')).toLowerCase()
                const titleLower = String(activity.title ?? '').toLowerCase()
                const descriptionLower = String(activity.description ?? '').toLowerCase()
                const destinationUrl = String(activity.destinationUrl ?? '').toLowerCase()
                const isSearchChild =
                    titleLower.includes('search on bing') ||
                    descriptionLower.includes('search on bing') ||
                    destinationUrl.includes('search?q=') ||
                    String(attrs.isExploreOnBingTask ?? '') === 'True'

                // Legacy punchcard flow should not use UrlReward API fallbacks.
                if (type === 'urlreward' && isSearchChild) {
                    await this.bot.activities.doSearchOnBing(activity, page)
                }

                if (childState.isTimeGated) {
                    resolvedTimedActivity = true
                }
            } catch (error) {
                this.bot.logger.error(
                    this.bot.isMobile,
                    'PUNCHCARD',
                    `Legacy punchcard child failed | parent=${parentOfferId} | child=${activity.offerId} | error=${error instanceof Error ? error.message : String(error)}`
                )
            }
        }
    }

    private buildQuestStateTree(questId: string): string {
        const tree = [
            '',
            {
                children: [
                    '(nav)',
                    {
                        children: [
                            'earn',
                            {
                                children: [
                                    'quest',
                                    {
                                        children: [
                                            ['questId', questId, 'd', null],
                                            { children: ['__PAGE__', {}, null, null, 0] },
                                            null,
                                            null,
                                            0
                                        ]
                                    },
                                    null,
                                    null,
                                    0
                                ]
                            },
                            null,
                            null,
                            0
                        ]
                    },
                    null,
                    null,
                    0
                ]
            },
            null,
            'refetch',
            16
        ]
        return encodeURIComponent(JSON.stringify(tree))
    }

    private parseModernActionTuples(responseText: string): Array<{
        offerId: string
        hash: string
        isPromotional: boolean
        timezoneOffset: string
    }> {
        const tuples: Array<{ offerId: string; hash: string; isPromotional: boolean; timezoneOffset: string }> = []
        const tupleRegex = /\["([a-f0-9]{40,128})",11,\{([^]*?)\}\]/gi

        for (const match of responseText.matchAll(tupleRegex)) {
            const hash = match[1] ?? ''
            const body = match[2] ?? ''
            const offerIdMatch = body.match(/"offerid":"([^"]+)"/i)
            if (!offerIdMatch?.[1]) {
                continue
            }

            const offerId = offerIdMatch[1]
            const isPromotionalRaw = body.match(/"isPromotional":"([^"]*)"/i)?.[1] ?? '$undefined'
            const timezoneOffset = body.match(/"timezoneOffset":"([^"]*)"/i)?.[1] ?? ''
            const isPromotional = isPromotionalRaw.toLowerCase() === 'true'

            tuples.push({ offerId, hash, isPromotional, timezoneOffset })
        }

        return tuples
    }

    private parseModernActivityCardsFromRsc(responseText: string): BasePromotion[] {
        const activities: BasePromotion[] = []
        const seenOfferIds = new Set<string>()
        let totalCardsDetected = 0
        let nonActionableCards = 0
        // RSC payload can be heavily escaped and span lines; use [\s\S]*? instead of dot-only matching.
        const cardRegex =
            /\{\\?"destination\\?":"[\s\S]*?"(?:offerId|offerid)\\?":"[^"]+"[\s\S]*?"hash\\?":"[a-f0-9]{40,128}"[\s\S]*?\}/gi
        const unescapeValue = (value: string): string =>
            value
                .replace(/\\u0026/gi, '&')
                .replace(/\\u003d/gi, '=')
                .replace(/\\\//g, '/')
                .replace(/\\"/g, '"')

        const readField = (card: string, field: string): string => {
            const escaped = card.match(new RegExp(`\\\\"${field}\\\\":\\"([^\\"]*)\\"`, 'i'))?.[1]
            if (escaped !== undefined) return unescapeValue(escaped)
            const plain = card.match(new RegExp(`"${field}":"([^"]*)"`, 'i'))?.[1]
            return plain ? unescapeValue(plain) : ''
        }
        const readBooleanField = (card: string, field: string): boolean => {
            const escaped = card.match(new RegExp(`\\\\"${field}\\\\":(true|false)`, 'i'))?.[1]
            const plain = card.match(new RegExp(`"${field}":(true|false)`, 'i'))?.[1]
            return (escaped ?? plain ?? '').toLowerCase() === 'true'
        }
        const readNumericField = (card: string, field: string): number => {
            const escaped = card.match(new RegExp(`\\\\"${field}\\\\":(-?\\d+)`, 'i'))?.[1]
            const plain = card.match(new RegExp(`"${field}":(-?\\d+)`, 'i'))?.[1]
            return Number(escaped ?? plain ?? 0)
        }

        for (const match of responseText.matchAll(cardRegex)) {
            const card = match[0] ?? ''
            totalCardsDetected++
            const offerId = readField(card, 'offerId')
            if (!offerId || seenOfferIds.has(offerId)) continue

            const destinationUrl = readField(card, 'destination')
            const hash = readField(card, 'hash')
            if (!destinationUrl || !hash) continue

            const isPromotionalRaw = readField(card, 'isPromotional').toLowerCase()
            const isPromotional = isPromotionalRaw === 'true'
            const points = readNumericField(card, 'points')
            seenOfferIds.add(offerId)
            const title = readField(card, 'title') || offerId
            const description = readField(card, 'description')
            const isCompleted = readBooleanField(card, 'isCompleted')
            const isLocked = readBooleanField(card, 'isLocked')
            const isActionable = !isPromotional && points > 0
            if (!isActionable) {
                nonActionableCards++
            }

            activities.push(({
                offerId,
                title,
                description,
                name: readField(card, 'name') || offerId,
                destinationUrl,
                promotionType: 'urlreward',
                // Keep non-actionable cards detectable in logs while skipping execution safely.
                complete: isCompleted || !isActionable,
                exclusiveLockedFeatureStatus: isLocked ? 'locked' : 'unlocked',
                hash,
                pointProgress: 0,
                pointProgressMax: Math.max(points, 0),
                activityProgress: 0,
                activityProgressMax: 0,
                attributes: {
                    offerid: offerId,
                    destination: destinationUrl,
                    description,
                    title,
                    max: String(Math.max(points, 0)),
                    points: String(Math.max(points, 0)),
                    isActionable: isActionable ? 'true' : 'false',
                    isPromotional: isPromotional ? 'true' : '$undefined'
                }
            } as unknown) as BasePromotion)
        }

        this.bot.logger.debug(
            this.bot.isMobile,
            'PUNCHCARD',
            `Modern activityCards parsed | detected=${totalCardsDetected} | mapped=${activities.length} | nonActionable=${nonActionableCards}`
        )

        return activities
    }

    private parseModernQuestCtaActivitiesFromRsc(responseText: string, questId: string): BasePromotion[] {
        const activities: BasePromotion[] = []
        const seenOfferIds = new Set<string>()
        const offerRegex = /\\?"offerId\\?":"([^"]+)"/gi
        const getField = (chunk: string, key: string): string => {
            const escaped = chunk.match(new RegExp(`\\\\"${key}\\\\":\\"([^\\"]*)\\"`, 'i'))?.[1]
            if (escaped !== undefined) return escaped
            return chunk.match(new RegExp(`"${key}":"([^"]*)"`, 'i'))?.[1] ?? ''
        }
        const getBoolField = (chunk: string, key: string): boolean => {
            const escaped = chunk.match(new RegExp(`\\\\"${key}\\\\":(true|false)`, 'i'))?.[1]
            const plain = chunk.match(new RegExp(`"${key}":(true|false)`, 'i'))?.[1]
            return (escaped ?? plain ?? '').toLowerCase() === 'true'
        }
        const decode = (value: string): string =>
            value
                .replace(/\\u0026/gi, '&')
                .replace(/\\u003d/gi, '=')
                .replace(/\\\//g, '/')
                .replace(/\\"/g, '"')

        for (const match of responseText.matchAll(offerRegex)) {
            const offerId = String(match[1] ?? '')
            if (!offerId || offerId === '$undefined' || seenOfferIds.has(offerId)) continue

            const idx = match.index ?? 0
            const chunk = responseText.slice(Math.max(0, idx - 1800), Math.min(responseText.length, idx + 2200))
            const hash = getField(chunk, 'hash')
            if (!hash || hash === '$undefined') continue

            // Quest detail page uses "href" for CTA target rather than "destination".
            const href = decode(getField(chunk, 'href'))
            const title = decode(getField(chunk, 'title')) || `Quest activity ${offerId}`
            const description = decode(getField(chunk, 'description'))
            const isCompleted = getBoolField(chunk, 'isCompleted')
            const isLocked = getBoolField(chunk, 'isLocked')
            const isPromotional = getBoolField(chunk, 'isPromotional')

            if (isPromotional) continue
            seenOfferIds.add(offerId)

            activities.push(({
                offerId,
                title,
                description,
                name: offerId,
                destinationUrl: href || `https://rewards.bing.com/earn/quest/${questId}`,
                promotionType: 'urlreward',
                complete: isCompleted,
                exclusiveLockedFeatureStatus: isLocked ? 'locked' : 'unlocked',
                hash,
                pointProgress: 0,
                pointProgressMax: 0,
                activityProgress: 0,
                activityProgressMax: 0,
                attributes: {
                    offerid: offerId,
                    destination: href,
                    description,
                    title,
                    isPromotional: '$undefined'
                }
            } as unknown) as BasePromotion)
        }

        return activities
    }

    private parseParentQuestIdsFromRsc(responseText: string): string[] {
        const normalize = (value: string): string =>
            value
                .replace(/\\\//g, '/')
                .replace(/\?.*$/, '')
                .trim()

        const fromLinks = [...responseText.matchAll(/\\?\/earn\\?\/quest\\?\/([^"\\?]+?pcparent[^"\\?]*)/gi)].map(m =>
            normalize(m[1] ?? '')
        )
        const fromQuestKey = [...responseText.matchAll(/"questId","([^"]*?pcparent[^"]*)"/gi)].map(m =>
            normalize(m[1] ?? '')
        )
        const fromBareParent = [...responseText.matchAll(/\b([A-Za-z0-9]+_pcparent_[A-Za-z0-9_]+)\b/gi)].map(m =>
            normalize(m[1] ?? '')
        )

        return [...new Set([...fromLinks, ...fromQuestKey, ...fromBareParent].filter(Boolean))]
    }

    private parseModernQuestHashPairsFromRsc(responseText: string, questId: string): BasePromotion[] {
        const activities: BasePromotion[] = []
        const seenOfferIds = new Set<string>()

        const pushFromPair = (offerIdRaw: string, hashRaw: string): void => {
            const offerId = String(offerIdRaw ?? '').trim()
            const hash = String(hashRaw ?? '').trim().toLowerCase()
            if (!offerId || !hash || seenOfferIds.has(offerId)) return
            if (!this.isModernPunchCardOfferId(offerId) && !this.isModernPunchCardOfferId(questId)) return

            seenOfferIds.add(offerId)
            activities.push(({
                offerId,
                title: `Quest activity ${offerId}`,
                name: offerId,
                destinationUrl: `https://rewards.bing.com/earn/quest/${questId}`,
                promotionType: 'urlreward',
                complete: false,
                exclusiveLockedFeatureStatus: 'unlocked',
                hash,
                pointProgress: 0,
                pointProgressMax: 0,
                activityProgress: 0,
                activityProgressMax: 0,
                attributes: {
                    offerid: offerId,
                    isPromotional: '$undefined'
                }
            } as unknown) as BasePromotion)
        }

        const plainRegex = /"offerId":"([^"]+)"[^]*?"hash":"([a-f0-9]{40,128})"/gi
        for (const match of responseText.matchAll(plainRegex)) {
            pushFromPair(match[1] ?? '', match[2] ?? '')
        }

        const escapedRegex = /\\"offerId\\":\\"([^\\"]+)\\"[^]*?\\"hash\\":\\"([a-f0-9]{40,128})\\"/gi
        for (const match of responseText.matchAll(escapedRegex)) {
            pushFromPair(match[1] ?? '', match[2] ?? '')
        }

        return activities
    }

    private buildModernEarnRscRequest(cookieHeader: string): AxiosRequestConfig {
        const fingerprintUserAgent = String(
            this.bot.fingerprint?.headers?.['user-agent'] ?? this.bot.fingerprint?.headers?.['User-Agent'] ?? ''
        ).trim()
        return {
            url: 'https://rewards.bing.com/earn?_rsc=b1l97',
            method: 'GET',
            headers: {
                accept: '*/*',
                rsc: '1',
                Cookie: cookieHeader,
                Referer: 'https://rewards.bing.com/earn',
                Origin: 'https://rewards.bing.com',
                ...(fingerprintUserAgent ? { 'user-agent': fingerprintUserAgent } : {})
            }
        }
    }

    private async fetchModernEarnRsc(
        preferredPage?: Page
    ): Promise<{ text: string; cookieHeader: string; status: number; requestUrl: string }> {
        const page = this.getActiveRewardsPage(preferredPage)
        await this.refreshSessionCookiesFromPage(page)

        const cookieHeader = this.bot.browser.func.buildCookieHeader(
            this.bot.isMobile ? this.bot.cookies.mobile : this.bot.cookies.desktop,
            ['bing.com', 'live.com', 'microsoftonline.com']
        )
        const earnRequest = this.buildModernEarnRscRequest(cookieHeader)
        const requestUrl = String(earnRequest.url ?? 'https://rewards.bing.com/earn?_rsc=b1l97')

        const earnResult = await this.fetchRscWithBrowserContext(page, requestUrl, {
            accept: '*/*',
            rsc: '1',
            Referer: 'https://rewards.bing.com/earn',
            Origin: 'https://rewards.bing.com',
            ...(typeof earnRequest.headers?.['user-agent'] === 'string'
                ? { 'user-agent': earnRequest.headers['user-agent'] }
                : {})
        })

        return {
            text: earnResult.text,
            cookieHeader,
            status: earnResult.status,
            requestUrl
        }
    }

    private async getModernPunchCardActivitiesFromRsc(preferredPage?: Page): Promise<BasePromotion[]> {
        try {
            const page = this.getActiveRewardsPage(preferredPage)
            this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', 'Fetching modern earn RSC activity list')
            const { text: earnText, cookieHeader, status: earnStatus, requestUrl: earnRequestUrl } =
                await this.fetchModernEarnRsc(page)
            const hasAuthCookieInHeader = /(?:^|;\s*)_C_Auth=[^;]+/i.test(cookieHeader)
            this.bot.logger.info(
                this.bot.isMobile,
                'PUNCHCARD',
                `Cookie header snapshot | length=${cookieHeader.length} | hasNonEmpty_C_Auth=${hasAuthCookieInHeader}`
            )
            const parsedEarnRscId = (() => {
                try {
                    const earnId = new URL(earnRequestUrl).searchParams.get('_rsc')
                    const normalized = String(earnId ?? '').trim()
                    return normalized ? normalized.replace(/[^a-zA-Z0-9_-]/g, '_') : 'unknown'
                } catch {
                    return 'unknown'
                }
            })()
            const responseDumpPath = `response_${parsedEarnRscId}.json`
            const questResponseDumps: Array<{
                questId: string
                url: string
                status?: number
                body?: string
                error?: string
            }> = []
            const writeModernRscDump = (parentQuestIds: string[]): void => {
                try {
                    const responseDump = {
                        fetchedAt: new Date().toISOString(),
                        earn: {
                            url: earnRequestUrl,
                            status: earnStatus,
                            body: earnText
                        },
                        parentQuestIds,
                        quests: questResponseDumps
                    }
                    fs.writeFileSync(responseDumpPath, JSON.stringify(responseDump, null, 2), 'utf8')
                    this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', `Wrote full RSC response dump to ${responseDumpPath}`)
                } catch (writeError) {
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'PUNCHCARD',
                        `Failed writing full RSC response dump | error=${writeError instanceof Error ? writeError.message : String(writeError)}`
                    )
                }
            }
            this.bot.logger.info(
                this.bot.isMobile,
                'PUNCHCARD',
                `Fetched modern earn RSC activity list | status=${earnStatus}`
            )
            const earnSnippet = earnText.replace(/\s+/g, ' ').slice(0, 1500)
            const parentPatternHits = (earnText.match(/pcparent/gi) ?? []).length
            const questLinkHits = (earnText.match(/\/earn\/quest\//gi) ?? []).length
            this.bot.logger.info(
                this.bot.isMobile,
                'PUNCHCARD',
                `EARN RSC echo | length=${earnText.length} | pcparentHits=${parentPatternHits} | questLinkHits=${questLinkHits}`
            )
            this.bot.logger.info(
                this.bot.isMobile,
                'PUNCHCARD',
                `EARN RSC snippet: ${earnSnippet}`
            )
            const activityCardActivities = this.parseModernActivityCardsFromRsc(earnText).filter(activity =>
                this.isModernPunchCardActivity(activity)
            )

            let questIds: string[] = this.parseParentQuestIdsFromRsc(earnText)

            if (!questIds.length) {
                const derivedParents = [
                    ...new Set(
                        [...earnText.matchAll(/([A-Za-z0-9]+_pcchild\d+_[A-Za-z0-9_]+)/gi)]
                            .map(m => m[1] ?? '')
                            .filter(Boolean)
                            .map(offerId =>
                                offerId
                                    .replace(/_pcchild\d+_.*/i, match => match.replace(/_pcchild\d+_.*/i, '_pcparent'))
                                    .replace(/_pcchild\d+_/i, '_pcparent_')
                            )
                            .filter(parentId => /pcparent/i.test(parentId))
                    )
                ]
                if (derivedParents.length) {
                    questIds = derivedParents
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'PUNCHCARD',
                        `Recovered parent quest IDs from child offerIds | count=${questIds.length}`
                    )
                }
            }

            this.bot.logger.info(
                this.bot.isMobile,
                'PUNCHCARD',
                `Detected parent quest IDs from earn RSC | count=${questIds.length} | ids=${questIds.join(', ') || 'none'}`
            )

            if (!questIds.length && !activityCardActivities.length) {
                writeModernRscDump(questIds)
                return []
            }

            const activities: BasePromotion[] = [...activityCardActivities]
            const seenOfferIds = new Set<string>(activityCardActivities.map(x => x.offerId))

            for (const questId of questIds) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'PUNCHCARD',
                    `Fetching parent quest details via RSC | parent=${questId}`
                )
                const questUrl = `https://rewards.bing.com/earn/quest/${questId}`
                const fingerprintUserAgent = String(
                    this.bot.fingerprint?.headers?.['user-agent'] ?? this.bot.fingerprint?.headers?.['User-Agent'] ?? ''
                ).trim()

                let questText = ''
                const questRequestUrl = `${questUrl}?_rsc=178ia`
                try {
                    const stateTree = this.buildQuestStateTree(questId)
                    const questResponse = await this.fetchRscWithBrowserContext(page, questRequestUrl, {
                        accept: '*/*',
                        rsc: '1',
                        'next-router-state-tree': stateTree,
                        Referer: questUrl,
                        ...(fingerprintUserAgent ? { 'user-agent': fingerprintUserAgent } : {})
                    })
                    questText = questResponse.text

                    const isAuthRedirectPayload =
                        /NEXT_REDIRECT;replace;https:\/\/login\.windows\.net\/consumers\/oauth2\/v2\.0\/authorize/i.test(
                            questText
                        ) || /"HeaderProfile_Login"/i.test(questText)
                    if (isAuthRedirectPayload) {
                        this.bot.logger.warn(
                            this.bot.isMobile,
                            'PUNCHCARD',
                            `Parent quest RSC returned login redirect payload | parent=${questId}`
                        )

                        // Retry once with simplified headers (without state-tree) to avoid fragile server-side route checks.
                        const retryResponse = await this.fetchRscWithBrowserContext(page, questRequestUrl, {
                            accept: '*/*',
                            rsc: '1',
                            Referer: questUrl,
                            ...(fingerprintUserAgent ? { 'user-agent': fingerprintUserAgent } : {})
                        })
                        const retryText = retryResponse.text
                        const retryStillRedirect =
                            /NEXT_REDIRECT;replace;https:\/\/login\.windows\.net\/consumers\/oauth2\/v2\.0\/authorize/i.test(
                                retryText
                            ) || /"HeaderProfile_Login"/i.test(retryText)

                        if (!retryStillRedirect) {
                            questText = retryText
                            this.bot.logger.info(
                                this.bot.isMobile,
                                'PUNCHCARD',
                                `Recovered parent quest RSC payload on retry | parent=${questId} | status=${retryResponse.status}`
                            )
                        } else {
                            this.bot.logger.warn(
                                this.bot.isMobile,
                                'PUNCHCARD',
                                `Retry also returned login redirect payload | parent=${questId}`
                            )
                        }
                    }

                    questResponseDumps.push({
                        questId,
                        url: questRequestUrl,
                        status: questResponse.status,
                        body: questText
                    })
                } catch (questRscError) {
                    questResponseDumps.push({
                        questId,
                        url: questRequestUrl,
                        error: questRscError instanceof Error ? questRscError.message : String(questRscError)
                    })
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'PUNCHCARD',
                        `Parent quest RSC fetch failed | parent=${questId} | error=${questRscError instanceof Error ? questRscError.message : String(questRscError)}`
                    )
                    continue
                }

                const questCtaActivities = this.parseModernQuestCtaActivitiesFromRsc(questText, questId)
                for (const activity of questCtaActivities) {
                    if (seenOfferIds.has(activity.offerId)) continue
                    seenOfferIds.add(activity.offerId)
                    activities.push(activity)
                }

                const questCardActivities = this.parseModernActivityCardsFromRsc(questText)
                for (const activity of questCardActivities) {
                    if (!this.isModernPunchCardActivity(activity)) continue
                    if (seenOfferIds.has(activity.offerId)) continue
                    seenOfferIds.add(activity.offerId)
                    activities.push(activity)
                }

                const tupleEntries = this.parseModernActionTuples(questText).filter(entry => !entry.isPromotional)
                const tupleByOfferId = new Map(tupleEntries.map(entry => [entry.offerId, entry] as const))
                const allOfferIds = [...new Set(tupleEntries.map(entry => entry.offerId))]

                for (const offerId of allOfferIds) {
                    if (seenOfferIds.has(offerId)) continue
                    seenOfferIds.add(offerId)
                    const tupleEntry = tupleByOfferId.get(offerId)

                    activities.push(({
                        offerId,
                        title: `Quest activity ${offerId}`,
                        name: offerId,
                        destinationUrl: `https://rewards.bing.com/earn/quest/${questId}`,
                        promotionType: 'urlreward',
                        complete: false,
                        exclusiveLockedFeatureStatus: 'unlocked',
                        hash: tupleEntry?.hash,
                        attributes: {
                            offerid: offerId,
                            ...(tupleEntry
                                ? {
                                      isPromotional: tupleEntry.isPromotional ? 'true' : '$undefined',
                                      timezoneOffset: tupleEntry.timezoneOffset
                                  }
                                : {})
                        }
                    } as unknown) as BasePromotion)
                }

                const fallbackQuestHashActivities = this.parseModernQuestHashPairsFromRsc(questText, questId)
                for (const activity of fallbackQuestHashActivities) {
                    if (seenOfferIds.has(activity.offerId)) continue
                    seenOfferIds.add(activity.offerId)
                    activities.push(activity)
                }
            }

            writeModernRscDump(questIds)

            this.bot.logger.debug(
                this.bot.isMobile,
                'PUNCHCARD',
                `Modern RSC detection | quests=${questIds.length} | activityCards=${activityCardActivities.length} | activities=${activities.length}`
            )

            return activities
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'PUNCHCARD',
                `Failed to detect modern punchcards from RSC | message=${error instanceof Error ? error.message : String(error)}`
            )
            return []
        }
    }


    private shouldSkipTimeGatedPunchCardActivity(activity: BasePromotion, punchCard?: PunchCard): boolean {
        if (!punchCard) {
            return false
        }
        const attrs = this.getAttributes(activity.attributes)

        const descriptionText = [
            activity.title,
            activity.description,
            activity.linkText,
            punchCard.parentPromotion?.title,
            punchCard.parentPromotion?.description,
            String(attrs.description ?? ''),
            String(attrs.title ?? '')
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()

        const isTimeGated =
            /\b\d+\s*\/\s*\d+\s*days?\s*complete\b/i.test(descriptionText) ||
            /\b24\s*hours?\b/i.test(descriptionText)

        if (!isTimeGated) {
            return false
        }

        const progress = Number(activity.activityProgress ?? 0)
        const progressMax = Number(activity.activityProgressMax ?? 0)

        // If already partially progressed on a day-based quest, avoid retrying in the same run.
        return progress > 0 && progress < progressMax
    }

    private async solveActivities(activities: BasePromotion[], page: Page, punchCard?: PunchCard) {
        for (const activity of activities) {
            try {
                const attrs = this.getAttributes(activity.attributes)
                const type = (activity.promotionType || String(attrs.type ?? '')).toLowerCase()
                const name = activity.name?.toLowerCase() ?? ''
                const offerId = activity.offerId
                const destinationUrl = activity.destinationUrl?.toLowerCase() ?? ''
                const isPunchCardChildOffer = /_pcchild\d+_/i.test(offerId)

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'ACTIVITY',
                    `Processing activity | title="${activity.title}" | offerId=${offerId} | type=${type} | punchCard="${punchCard?.parentPromotion?.title ?? 'none'}"`
                )

                if (this.shouldSkipTimeGatedPunchCardActivity(activity, punchCard)) {
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'ACTIVITY',
                        `Skipping time-gated punchcard activity for now | title="${activity.title}" | offerId=${offerId} | progress=${activity.activityProgress}/${activity.activityProgressMax}`
                    )
                    continue
                }

                switch (type) {
                    // Quiz-like activities (Poll / regular quiz variants)
                    case 'quiz': {
                        const basePromotion = activity

                        // Poll (usually 10 points, pollscenarioid in URL)
                        if (activity.pointProgressMax === 10 && destinationUrl.includes('pollscenarioid')) {
                            this.bot.logger.info(
                                this.bot.isMobile,
                                'ACTIVITY',
                                `Found activity type "Poll" | title="${activity.title}" | offerId=${offerId}`
                            )

                            //await this.bot.activities.doPoll(basePromotion)
                            break
                        }

                        // All other quizzes handled via Quiz API
                        this.bot.logger.info(
                            this.bot.isMobile,
                            'ACTIVITY',
                            `Found activity type "Quiz" | title="${activity.title}" | offerId=${offerId}`
                        )

                        await this.bot.activities.doQuiz(basePromotion)
                        break
                    }

                    // UrlReward
                    case 'urlreward': {
                        const basePromotion = activity

                        // Search on Bing are subtypes of "urlreward"
                        const titleLower = activity.title?.toLowerCase() ?? ''
                        const descriptionLower = activity.description?.toLowerCase() ?? ''
                        const isExploreOnBingActivationOffer = this.isExploreOnBingActivationOffer(basePromotion)
                        const isExtraSearchOffer = this.extraSearchOfferIds.has(offerId.toLowerCase())
                        const isExploreOnBing =
                            name.includes('exploreonbing') ||
                            offerId.toLowerCase().includes('exploreonbing') ||
                            String(attrs.isExploreOnBingTask ?? '') === 'True' ||
                            titleLower.includes('search on bing') ||
                            descriptionLower.includes('search on bing') ||
                            destinationUrl.includes('search?q=') ||
                            isExtraSearchOffer

                        if (isExploreOnBing) {
                            const pointProgress = Number(basePromotion.pointProgress ?? attrs.progress ?? 0)
                            const pointProgressMax = Number(basePromotion.pointProgressMax ?? attrs.max ?? 0)
                            const completeRaw = attrs.complete
                            const attrsComplete =
                                typeof completeRaw === 'string' ? completeRaw.toLowerCase() === 'true' : Boolean(completeRaw)
                            const isAlreadyCompleted =
                                (isExploreOnBingActivationOffer
                                    ? false
                                    : basePromotion.complete) ||
                                attrsComplete ||
                                (pointProgressMax > 0 && pointProgress >= pointProgressMax)

                            if (isAlreadyCompleted) {
                                this.bot.logger.info(
                                    this.bot.isMobile,
                                    'ACTIVITY',
                                    `Skipping SearchOnBing activity already completed | title="${activity.title}" | offerId=${offerId} | progress=${pointProgress}/${pointProgressMax}`
                                )
                                break
                            }

                            if (isExploreOnBingActivationOffer) {
                                this.bot.logger.info(
                                    this.bot.isMobile,
                                    'ACTIVITY',
                                    `Activation flow start | title="${activity.title}" | offerId=${offerId}`
                                )

                                await this.bot.activities.doExploreOnBingActivation(basePromotion)

                                const isModernActivationFlow =
                                    this.bot.rewardsVersion === 'modern' || this.isModernPunchCardActivity(basePromotion)
                                if (isModernActivationFlow) {
                                    this.bot.logger.info(
                                        this.bot.isMobile,
                                        'ACTIVITY',
                                        `Skipping SearchOnBing for activation in modern flow | offerId=${offerId}`
                                    )
                                } else {
                                    await this.bot.activities.doSearchOnBing(basePromotion, page)
                                }

                                const recheck = await this.readDashboardCompletion(offerId)
                                this.bot.logger.info(
                                    this.bot.isMobile,
                                    'ACTIVITY',
                                    `Activation flow dashboard recheck | offerId=${offerId} | complete=${recheck.complete} | progress=${recheck.progress}/${recheck.max}`
                                )
                                break
                            }

                            if (isExtraSearchOffer) {
                                this.bot.logger.info(
                                    this.bot.isMobile,
                                    'ACTIVITY',
                                    `Detected extra search offer, forcing SearchOnBing flow | offerId=${offerId}`
                                )

                                try {
                                    const dashboardData = await this.bot.browser.func.getDashboardData()
                                    const dashboardDailySet = Object.values(dashboardData.dailySetPromotions ?? {}).flat()
                                    const dashboardPunchCards = (dashboardData.punchCards ?? []).flatMap(x => [
                                        ...(x.childPromotions ?? []),
                                        ...(x.parentPromotion ? [x.parentPromotion] : [])
                                    ])
                                    const allDashboardPromotions = [
                                        ...(dashboardData.morePromotions ?? []),
                                        ...(dashboardData.morePromotionsWithoutPromotionalItems ?? []),
                                        ...(dashboardData.promotionalItems ?? []),
                                        ...dashboardDailySet,
                                        ...dashboardPunchCards
                                    ]

                                    const offerKey = offerId.toLowerCase()
                                    const matchedDashboardOffer = allDashboardPromotions.find(x => {
                                        const topLevelOfferId = String(x.offerId ?? '').toLowerCase()
                                        const dashboardAttrs = this.getAttributes(x.attributes)
                                        const attrOfferId = String(
                                            dashboardAttrs.offerid ?? dashboardAttrs.offerId ?? ''
                                        ).toLowerCase()
                                        return topLevelOfferId === offerKey || attrOfferId === offerKey
                                    })

                                    if (matchedDashboardOffer) {
                                        const dashboardAttrs = this.getAttributes(matchedDashboardOffer.attributes)
                                        const dashboardProgress = Number(
                                            matchedDashboardOffer.pointProgress ?? dashboardAttrs.progress ?? 0
                                        )
                                        const dashboardProgressMax = Number(
                                            matchedDashboardOffer.pointProgressMax ?? dashboardAttrs.max ?? 0
                                        )
                                        const dashboardCompleteRaw = dashboardAttrs.complete
                                        const dashboardAttrsComplete =
                                            typeof dashboardCompleteRaw === 'string'
                                                ? dashboardCompleteRaw.toLowerCase() === 'true'
                                                : Boolean(dashboardCompleteRaw)
                                        const isDashboardCompleted =
                                            Boolean(matchedDashboardOffer.complete) ||
                                            dashboardAttrsComplete ||
                                            (dashboardProgressMax > 0 && dashboardProgress >= dashboardProgressMax)

                                        if (isDashboardCompleted) {
                                            this.bot.logger.info(
                                                this.bot.isMobile,
                                                'ACTIVITY',
                                                `Skipping extra SearchOnBing activity already completed (dashboard) | title="${activity.title}" | offerId=${offerId} | progress=${dashboardProgress}/${dashboardProgressMax}`
                                            )
                                            break
                                        }
                                    }
                                } catch (dashboardCheckError) {
                                    this.bot.logger.debug(
                                        this.bot.isMobile,
                                        'ACTIVITY',
                                        `Extra search dashboard pre-check failed, continuing | offerId=${offerId} | error=${dashboardCheckError instanceof Error ? dashboardCheckError.message : String(dashboardCheckError)}`
                                    )
                                }

                                this.bot.logger.info(
                                    this.bot.isMobile,
                                    'ACTIVITY',
                                    `Found activity type "SearchOnBing" | title="${activity.title}" | offerId=${offerId}`
                                )
                                await this.bot.activities.doSearchOnBing(basePromotion, page)
                                break
                            }

                            // First try to activate via reportactivity API (some exploreonbing tasks only need activation)
                            if (this.bot.requestToken && !isPunchCardChildOffer && !isExploreOnBingActivationOffer) {
                                this.bot.logger.info(
                                    this.bot.isMobile,
                                    'ACTIVITY',
                                    `Activating exploreonbing via reportactivity | title="${activity.title}" | offerId=${offerId}`
                                )

                                try {
                                    const cookieHeader = this.bot.browser.func.buildCookieHeader(
                                        this.bot.isMobile ? this.bot.cookies.mobile : this.bot.cookies.desktop,
                                        ['bing.com', 'live.com', 'microsoftonline.com']
                                    )

                                    const formData = new URLSearchParams({
                                        id: offerId,
                                        hash: basePromotion.hash,
                                        timeZone: '60',
                                        activityAmount: '1',
                                        dbs: '0',
                                        form: '',
                                        type: '',
                                        __RequestVerificationToken: this.bot.requestToken
                                    })

                                    const request: AxiosRequestConfig = {
                                        url: 'https://rewards.bing.com/api/reportactivity?X-Requested-With=XMLHttpRequest',
                                        method: 'POST',
                                        headers: {
                                            ...(this.bot.fingerprint?.headers ?? {}),
                                            Cookie: cookieHeader,
                                            Referer: 'https://rewards.bing.com/',
                                            Origin: 'https://rewards.bing.com'
                                        },
                                        data: formData
                                    }

                                    const response = await this.bot.axios.request(request)

                                    this.bot.logger.info(
                                        this.bot.isMobile,
                                        'ACTIVITY',
                                        `Activated exploreonbing via reportactivity | offerId=${offerId} | status=${response.status}`
                                    )

                                    // Check if points were earned from activation alone
                                    await this.bot.utils.wait(this.bot.utils.randomDelay(2000, 4000))
                                    const newBalance = await this.bot.browser.func.getCurrentPoints()
                                    const gained = newBalance - this.bot.userData.currentPoints

                                    if (gained > 0) {
                                        this.bot.userData.currentPoints = newBalance
                                        this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + gained

                                        this.bot.logger.info(
                                            this.bot.isMobile,
                                            'ACTIVITY',
                                            `Completed exploreonbing via activation | offerId=${offerId} | gainedPoints=${gained} | newBalance=${newBalance}`,
                                            'green'
                                        )
                                        break
                                    }
                                } catch (activationError) {
                                    this.bot.logger.warn(
                                        this.bot.isMobile,
                                        'ACTIVITY',
                                        `Activation via reportactivity failed for exploreonbing | offerId=${offerId} | error=${activationError instanceof Error ? activationError.message : String(activationError)}`
                                    )
                                }
                            }

                            // For punchcard child offers, use quest flow directly.
                            if (isPunchCardChildOffer) {
                                this.bot.logger.info(
                                    this.bot.isMobile,
                                    'ACTIVITY',
                                    `Trying quest flow for exploreonbing punchcard | title="${activity.title}" | offerId=${offerId}`
                                )

                                try {
                                    const balanceBefore = Number(this.bot.userData.currentPoints ?? 0)
                                    await this.bot.activities.doDaily(basePromotion)
                                    const balanceAfter = Number(this.bot.userData.currentPoints ?? balanceBefore)
                                    const gained = balanceAfter - balanceBefore

                                    if (gained > 0) {
                                        this.bot.logger.info(
                                            this.bot.isMobile,
                                            'ACTIVITY',
                                            `Completed exploreonbing via quest flow | offerId=${offerId} | gainedPoints=${gained}`,
                                            'green'
                                        )
                                        break
                                    }

                                    this.bot.logger.warn(
                                        this.bot.isMobile,
                                        'ACTIVITY',
                                        `Quest flow did not gain points for exploreonbing | offerId=${offerId} | oldBalance=${balanceBefore} | newBalance=${balanceAfter}`
                                    )
                                } catch (questError) {
                                    this.bot.logger.warn(
                                        this.bot.isMobile,
                                        'ACTIVITY',
                                        `Quest flow failed for exploreonbing | offerId=${offerId} | error=${questError instanceof Error ? questError.message : String(questError)}`
                                    )
                                }

                                if (this.bot.rewardsVersion === 'modern') {
                                    this.bot.logger.info(
                                        this.bot.isMobile,
                                        'ACTIVITY',
                                        `Skipping SearchOnBing fallback for modern punchcard child | title="${activity.title}" | offerId=${offerId}`
                                    )
                                    break
                                }
                            }
                            // Try panel flyout method (works without requestToken)
                            else if (this.bot.panelData) {
                                this.bot.logger.info(
                                    this.bot.isMobile,
                                    'ACTIVITY',
                                    `Trying panel flyout for exploreonbing | title="${activity.title}" | offerId=${offerId}`
                                )

                                try {
                                    const balanceBefore = Number(this.bot.userData.currentPoints ?? 0)
                                    await this.bot.activities.doDaily(basePromotion)
                                    const balanceAfter = Number(this.bot.userData.currentPoints ?? balanceBefore)
                                    const gained = balanceAfter - balanceBefore

                                    if (gained > 0) {
                                        this.bot.logger.info(
                                            this.bot.isMobile,
                                            'ACTIVITY',
                                            `Completed exploreonbing via panel flyout | offerId=${offerId} | gainedPoints=${gained}`,
                                            'green'
                                        )
                                        break
                                    }

                                    this.bot.logger.warn(
                                        this.bot.isMobile,
                                        'ACTIVITY',
                                        `Panel flyout did not gain points for exploreonbing | offerId=${offerId} | oldBalance=${balanceBefore} | newBalance=${balanceAfter}`
                                    )
                                } catch (panelError) {
                                    this.bot.logger.warn(
                                        this.bot.isMobile,
                                        'ACTIVITY',
                                        `Panel flyout failed for exploreonbing | offerId=${offerId} | error=${panelError instanceof Error ? panelError.message : String(panelError)}`
                                    )
                                }
                            }

                            // Fall back to SearchOnBing (search needed to complete the task)
                            this.bot.logger.info(
                                this.bot.isMobile,
                                'ACTIVITY',
                                `Found activity type "SearchOnBing" | title="${activity.title}" | offerId=${offerId}`
                            )

                            await this.bot.activities.doSearchOnBing(basePromotion, page)
                        } else {
                            this.bot.logger.info(
                                this.bot.isMobile,
                                'ACTIVITY',
                                `Found activity type "UrlReward" | title="${activity.title}" | offerId=${offerId}`
                            )

                            if (isPunchCardChildOffer) {
                                await this.bot.activities.doDaily(basePromotion)
                            } else if (this.bot.requestToken) {
                                await this.bot.activities.doUrlReward(basePromotion)
                            } else {
                                await this.bot.activities.doDaily(basePromotion)
                            }
                        }
                        break
                    }

                    // Find Clippy specific promotion type
                    case 'findclippy': {
                        const clippyPromotion = activity as unknown as FindClippyPromotion

                        this.bot.logger.info(
                            this.bot.isMobile,
                            'ACTIVITY',
                            `Found activity type "FindClippy" | title="${activity.title}" | offerId=${offerId}`
                        )

                        await this.bot.activities.doFindClippy(clippyPromotion)
                        break
                    }

                    // Unsupported types
                    default: {
                        this.bot.logger.warn(
                            this.bot.isMobile,
                            'ACTIVITY',
                            `Skipped activity "${activity.title}" | offerId=${offerId} | Reason: Unsupported type "${activity.promotionType}"`
                        )
                        break
                    }
                }

                // Cooldown
                await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 15000))
            } catch (error) {
                this.bot.logger.error(
                    this.bot.isMobile,
                    'ACTIVITY',
                    `Error while solving activity "${activity.title}" | message=${error instanceof Error ? error.message : String(error)}`
                )
            }
        }
    }
}
