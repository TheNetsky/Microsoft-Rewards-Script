import { OfferVerifier, offerReading, type OfferReport } from '../../shared/OfferVerifier'
import { activityResult, activityFailure, ActivitySkipError, type ActivityResult } from '../../shared/ActivityResult'
import type { BasePromotion } from '../../types/RewardsState'
import { BaseActivity } from '../../shared/activities/BaseActivity'
import type { PromotionSource } from '../../types/PromotionContext'
import { isSkippedOffer } from '../../shared/PromotionEligibility'
import { BrowserRewardNavigator, type RewardTarget } from './BrowserRewardNavigator'
import { BrowserTaskPage } from '../../../browser/BrowserTaskPage'
import { isTerminalHttpError } from '../../../network/HttpError'
import { DAILY_SET_LINKS, MORE_ACTIVITIES_LINKS } from '../parsers/EarnPageParser'
import { browserOfferKey, browserTaskPass, confirmBrowserOffer, findBrowserOffer } from '../BrowserTaskPass'
import type { Locator, Page } from 'patchright'

type RewardSurface = 'earn' | 'flyout' | 'dashboard'

export class BrowserUrlReward extends BaseActivity {
    private readonly navigator = new BrowserRewardNavigator(this.bot)

    async run(
        promotion: BasePromotion,
        source: PromotionSource,
        options: {
            allowZeroPoint?: boolean
            activationOnly?: boolean
            afterClick?: (page: Page, verifier: OfferVerifier, report?: OfferReport) => Promise<ActivityResult>
        } = {}
    ): Promise<ActivityResult> {
        const offerId = promotion.offerId
        if (isSkippedOffer(offerId, promotion.destinationUrl)) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'URL-REWARD-BROWSER',
                `Permanently skipped offer | offerId=${offerId}`
            )
            return activityResult('skipped', 'offer-excluded', offerId)
        }
        const pass = browserTaskPass.getStore()
        if (promotion.complete || pass?.confirmed.has(offerId) || pass?.confirmed.has(browserOfferKey(promotion))) {
            return activityResult('skipped', 'offer-already-complete', offerId)
        }
        const sourcePage = this.navigator.getActivePage()
        if (!sourcePage) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'URL-REWARD-BROWSER',
                `Skipping ${offerId}: browser page unavailable`
            )
            return activityResult('unconfirmed', 'browser-page-unavailable', offerId)
        }

        if (this.bot.config.skipNonPointTasks && promotion.pointProgressMax <= 0 && !options.allowZeroPoint) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'URL-REWARD-BROWSER',
                `Skipping ${offerId}: awards no points and skipNonPointTasks=true`
            )
            return activityResult('skipped', 'no-points', offerId)
        }

        const oldBalance = this.bot.userData.currentPoints
        const flyoutFirst = source === 'daily-set' || source === 'more-promotions' || pass?.surface === 'flyout'
        const surfaces: RewardSurface[] = flyoutFirst
            ? ['flyout', 'earn', 'dashboard']
            : ['earn', 'flyout', 'dashboard']
        let task: BrowserTaskPage | undefined
        let page = sourcePage
        let closeClick: (() => Promise<void>) | undefined
        let surface: RewardSurface = surfaces[0]!
        const rewardTarget = {
            destination: promotion.destinationUrl,
            offerId,
            title: promotion.title,
            description: promotion.description
        }
        const verifier = new OfferVerifier(this.bot, offerId, async () => {
            if (surface === 'dashboard') {
                await this.navigator.openDashboard(page, true)
                const control = await this.navigator.findDashboardCard(page, rewardTarget)
                if (control) return this.navigator.readDashboardCard(control)
            }
            return offerReading(findBrowserOffer((await this.bot.rewards.getTaskData()).dashboard, promotion))
        })
        let attempted = false
        let ambiguousTarget: ActivitySkipError | undefined

        try {
            if (await verifier.capture()) {
                confirmBrowserOffer(promotion)
                return activityResult('skipped', 'already-complete', offerId)
            }
            let target: Locator | null = null
            for (const [index, candidate] of surfaces.entries()) {
                this.bot.signal.throwIfAborted()
                await task?.close()
                task = undefined
                surface = candidate
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'URL-REWARD-BROWSER',
                    `Checking rendered surface | offerId=${offerId} | source=${source} | surface=${surface} | attempt=${index + 1}/${surfaces.length}`
                )
                try {
                    if (pass?.surface === surface && pass.page && !pass.page.isClosed()) page = pass.page
                    else {
                        task = await (surface === 'flyout'
                            ? BrowserTaskPage.create(sourcePage)
                            : BrowserTaskPage.createRewards(sourcePage, surface === 'dashboard'))
                        page = task.page
                    }
                    target = await this.findRenderedCard(
                        page,
                        rewardTarget,
                        surface,
                        surface === 'flyout'
                            ? source === 'daily-set'
                                ? '#daily_set_card a[href]'
                                : undefined
                            : this.sectionScope(source, promotion)
                    )
                } catch (error) {
                    this.bot.signal.throwIfAborted()
                    if (isTerminalHttpError(error)) throw error
                    if (error instanceof ActivitySkipError) {
                        if (error.reason !== 'ambiguous-target') throw error
                        ambiguousTarget = error
                    }
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'URL-REWARD-BROWSER',
                        `Rendered surface unavailable | offerId=${offerId} | surface=${surface} | ${error instanceof Error ? error.message : String(error)}`
                    )
                }
                if (target) break
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'URL-REWARD-BROWSER',
                    `Rendered surface has no usable card | offerId=${offerId} | surface=${surface} | nextSurface=${surfaces[index + 1] ?? 'none'}`
                )
            }

            if (target && surface !== surfaces[0]) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'URL-REWARD-BROWSER',
                    `Using rendered ${surface} fallback | offerId=${offerId} | source=${source}`
                )
            }
            if (target && surface === 'dashboard' && (await this.navigator.readDashboardCard(target)).complete) {
                confirmBrowserOffer(promotion)
                return activityResult('skipped', 'offer-already-complete', offerId)
            }

            if (target && page === sourcePage && surface !== 'flyout') {
                const linkTarget = await target.getAttribute('target')
                if (!linkTarget || ['_self', '_top', '_parent'].includes(linkTarget)) {
                    await task?.close()
                    task = await BrowserTaskPage.createRewards(sourcePage)
                    page = task.page
                    target = await this.findRenderedCard(
                        page,
                        rewardTarget,
                        surface,
                        this.sectionScope(source, promotion)
                    )
                }
            }

            if (!target) {
                if (ambiguousTarget) throw ambiguousTarget
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'URL-REWARD-BROWSER',
                    `Rendered card not found | offerId=${offerId} | source=${source} | page=${page.url()}`
                )
                return activityResult('unconfirmed', 'rendered-control-not-found', offerId)
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'URL-REWARD-BROWSER',
                `Clicking rendered Rewards card | offerId=${offerId} | source=${source} | surface=${surface} | currentBalance=${oldBalance}`
            )

            attempted = true
            const clicked = await this.navigator.click(page, target, offerId, {
                activationOnly: options.activationOnly
            })
            closeClick = clicked.close

            if (options.afterClick)
                return await options.afterClick(clicked.page, verifier, clicked.activityReport ?? undefined)
            await closeClick()
            if (surface === 'flyout' || (pass && surface !== 'dashboard')) await task?.close()

            const verified = await verifier.verify(
                activityResult('unconfirmed', 'offer-not-confirmed', offerId),
                clicked.activityReport ?? undefined
            )
            if (verified.status === 'confirmed') confirmBrowserOffer(promotion)
            this.bot.logger.debug(
                this.bot.isMobile,
                'URL-REWARD-BROWSER',
                `Browser card verified | offerId=${offerId} | status=${verified.status}` +
                    ` | pointsGained=${verified.pointsKnown ? verified.pointsGained : 'unknown'}` +
                    ` | currentBalance=${this.bot.userData.currentPoints}`
            )
            return verified
        } catch (error) {
            this.bot.signal.throwIfAborted()
            if (isTerminalHttpError(error)) throw error
            const failure = activityFailure(error, offerId)
            this.bot.logger[failure.status === 'unconfirmed' ? 'warn' : 'error'](
                this.bot.isMobile,
                'URL-REWARD-BROWSER',
                `Browser card failed | offerId=${offerId} | ${error instanceof Error ? error.message : String(error)}`
            )
            return attempted ? await verifier.verify(failure) : failure
        } finally {
            try {
                await closeClick?.()
            } finally {
                await task?.close()
            }
        }
    }

    private async findRenderedCard(
        page: Page,
        target: RewardTarget,
        surface: RewardSurface,
        scope?: string
    ): Promise<Locator | null> {
        try {
            if (surface === 'flyout') {
                await this.navigator.openFlyout(page)
                return await this.navigator.findFlyoutCard(page, target, scope)
            }
            if (surface === 'dashboard') {
                await this.navigator.openDashboard(page)
                return await this.navigator.findDashboardCard(page, target)
            }
            await this.navigator.openEarn(page)
            let ambiguousTarget: ActivitySkipError | undefined
            try {
                const control = await this.navigator.findEarnCard(page, target, scope)
                if (control) return control
            } catch (error) {
                if (!(error instanceof ActivitySkipError) || error.reason !== 'ambiguous-target') throw error
                ambiguousTarget = error
            }
            const control = await this.navigator.findOfferControl(page, target)
            if (!control && ambiguousTarget) throw ambiguousTarget
            return control
        } catch (error) {
            this.bot.signal.throwIfAborted()
            if (isTerminalHttpError(error) || error instanceof ActivitySkipError) throw error
            this.bot.logger.debug(
                this.bot.isMobile,
                'URL-REWARD-BROWSER',
                `Rendered ${surface} lookup unavailable | offerId=${target.offerId ?? 'unknown'} | ${error instanceof Error ? error.message : String(error)}`
            )
            return null
        }
    }

    private sectionScope(source: PromotionSource, promotion: BasePromotion): string {
        const section = promotion.attributes.earnSection
        if (typeof section === 'string' && ['dailyset', 'exploreonbing', 'moreactivities'].includes(section))
            return `#${section} a[href], #${section} [role="link"][href]`
        if (source === 'daily-set') return DAILY_SET_LINKS
        if (source === 'more-promotions') {
            return MORE_ACTIVITIES_LINKS
        }
        return 'a[href]'
    }
}
