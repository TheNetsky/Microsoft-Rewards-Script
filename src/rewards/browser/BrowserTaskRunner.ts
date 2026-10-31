import { BaseActivity } from '../shared/activities/BaseActivity'
import type { RewardsState } from '../types/RewardsState'
import { browserOfferKey, browserTaskPass, markConfirmedBrowserOffers } from './BrowserTaskPass'
import { BrowserEarnTasks } from './BrowserEarnTasks'
import { activityResult } from '../shared/ActivityResult'
import { BrowserTaskPage } from '../../browser/BrowserTaskPage'
import { isEligiblePromotion, isPromotionComplete } from '../shared/PromotionEligibility'
import { getWebPromotions } from '../shared/Promotion'
import { detectSearchMultiplierPerk } from '../shared/SearchMultiplierPerk'
import { isTerminalHttpError } from '../../network/HttpError'

export class BrowserTaskRunner extends BaseActivity {
    async run(seed: RewardsState, confirmed = new Set<string>()): Promise<RewardsState> {
        const workers = this.bot.config.workers
        if (
            !workers.doDailySet &&
            !workers.doMorePromotions &&
            !workers.doActivateSearchPerk &&
            !workers.doPunchCards &&
            !workers.doVisualSearch
        )
            return seed
        const source = this.bot.activePage
        if (!source || source.isClosed()) throw new Error('Browser page unavailable for task passes')
        const earn = new BrowserEarnTasks(this.bot)
        let result = seed
        let flyoutCompleted = false
        let earnCompleted = false
        const pending = new Set<string>([
            ...(workers.doPunchCards ? ['punchcards'] : []),
            ...(workers.doVisualSearch && !this.bot.isMobile ? ['visual-search'] : [])
        ])
        let flyoutTask: BrowserTaskPage | undefined
        try {
            flyoutTask = await BrowserTaskPage.create(source)
            result = await browserTaskPass.run({ surface: 'flyout', confirmed, page: flyoutTask.page }, async () => {
                this.bot.logger.info(this.bot.isMobile, 'BROWSER-TASKS', 'Starting flyout task pass')
                let data = this.rememberCompletedOffers(await this.bot.rewards.getTaskData(), confirmed)
                const daily = await this.runDailySet(data)
                data = daily.data
                const worked = (await this.runRemainingCards(data)) || daily.worked
                return worked ? this.rememberCompletedOffers(await this.bot.rewards.getTaskData(), confirmed) : data
            })
            flyoutCompleted = true
        } catch (error) {
            this.bot.signal.throwIfAborted()
            if (isTerminalHttpError(error)) throw error
            this.bot.logger.warn(
                this.bot.isMobile,
                'BROWSER-TASKS',
                `Flyout pass failed; checking /earn for remaining tasks | ${String(error)}`
            )
        } finally {
            await flyoutTask?.close()
        }

        let earnTask: BrowserTaskPage | undefined
        try {
            earnTask = await BrowserTaskPage.createRewards(source, true)
            const page = earnTask.page
            const readEarn = () => earn.read(() => this.bot.rewards.getDashboardData(), page)
            result = await browserTaskPass.run({ surface: 'earn', confirmed, page, readEarn }, async () => {
                this.bot.logger.info(this.bot.isMobile, 'BROWSER-TASKS', 'Starting /earn task pass for remaining tasks')
                let data = this.rememberCompletedOffers(await readEarn(), confirmed)
                const daily = await this.runDailySet(data)
                data = daily.data
                if (workers.doPunchCards) {
                    const attempted = this.bot.attemptedPunchcardChildren.size
                    if (this.bot.isMobile) await this.bot.activities.runMobilePunchCards(data)
                    else await this.bot.activities.runDesktopPunchCards()
                    pending.delete('punchcards')
                    if (this.bot.attemptedPunchcardChildren.size > attempted)
                        data = markConfirmedBrowserOffers(await readEarn(), confirmed)
                }
                await this.runRemainingCards(data)
                pending.delete('visual-search')
                if (workers.doVisualSearch) await this.bot.activities.runVisualSearch(data)
                return this.rememberCompletedOffers(await readEarn(), confirmed)
            })
            earnCompleted = true
        } catch (error) {
            this.bot.signal.throwIfAborted()
            if (isTerminalHttpError(error)) throw error
            for (const activity of ['browser-earn', ...pending]) {
                this.bot.recordActivity(activity, {
                    ...activityResult('unconfirmed', 'earn-pass-incomplete'),
                    message:
                        activity === 'visual-search'
                            ? 'Visual Search was not attempted because the earn task pass failed before it started'
                            : 'The earn pass did not finish; tasks available only on /earn remain unconfirmed'
                })
            }
            this.bot.logger.warn(
                this.bot.isMobile,
                'BROWSER-TASKS',
                `/earn pass failed; remaining earn tasks could not finish | ${String(error)}`
            )
        } finally {
            await earnTask?.close()
        }

        result = this.rememberCompletedOffers(result, confirmed)
        const latest = new Map((this.bot.activityResults ?? []).map(activity => [activity.offerId, activity]))
        for (const [offerId, previous] of latest) {
            if (offerId && confirmed.has(offerId) && ['failed', 'unconfirmed'].includes(previous.status)) {
                this.bot.recordActivity(previous.activity, {
                    ...previous,
                    status: 'confirmed',
                    reason: 'offer-state-confirmed',
                    message: undefined,
                    errorCode: undefined
                })
            }
        }
        this.bot.logger[earnCompleted ? 'info' : 'warn'](
            this.bot.isMobile,
            'BROWSER-TASKS',
            earnCompleted
                ? flyoutCompleted
                    ? 'Completed flyout and earn task passes'
                    : 'Completed /earn fallback after flyout pass failed'
                : flyoutCompleted
                  ? 'Finished flyout; /earn pass remains unconfirmed'
                  : 'Browser task passes remain unconfirmed'
        )
        return result
    }

    private rememberCompletedOffers(data: RewardsState, confirmed: Set<string>): RewardsState {
        for (const offer of getWebPromotions(data.dashboard)) {
            if (!isPromotionComplete(offer)) continue
            confirmed.add(offer.offerId)
            confirmed.add(browserOfferKey(offer))
        }
        return markConfirmedBrowserOffers(data, confirmed)
    }

    private async runDailySet(data: RewardsState): Promise<{ data: RewardsState; worked: boolean }> {
        const workers = this.bot.config.workers
        const today = this.bot.utils.formatDate(Date.now(), this.bot.userData.timezone)
        const hasDaily = Boolean(
            workers.doDailySet &&
            data.dashboard.dailySetPromotions[today]?.some(item =>
                isEligiblePromotion(item, this.bot.config.skipNonPointTasks)
            )
        )

        if (hasDaily) {
            data = markConfirmedBrowserOffers(
                await this.bot.activities.runDailySet(data),
                browserTaskPass.getStore()!.confirmed
            )
        }
        return { data, worked: hasDaily }
    }

    private async runRemainingCards(data: RewardsState): Promise<boolean> {
        const workers = this.bot.config.workers
        const hasMore = Boolean(
            workers.doMorePromotions &&
            [...data.dashboard.morePromotions, ...data.dashboard.morePromotionsWithoutPromotionalItems].some(item =>
                isEligiblePromotion(item, this.bot.config.skipNonPointTasks)
            )
        )
        if (workers.doActivateSearchPerk) await this.bot.activities.activateSearchPerk(data)
        if (workers.doMorePromotions) await this.bot.activities.runMorePromotions(data)
        return hasMore || (workers.doActivateSearchPerk && !!detectSearchMultiplierPerk(data.dashboard))
    }
}
