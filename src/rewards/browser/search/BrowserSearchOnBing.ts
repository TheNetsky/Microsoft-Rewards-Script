import { OfferVerifier, offerReading, type OfferReport } from '../../shared/OfferVerifier'
import { activityResult, activityFailure, type ActivityResult } from '../../shared/ActivityResult'
import { confirmBrowserOffer, findBrowserOffer } from '../BrowserTaskPass'
import { BrowserUrlReward } from '../actions/BrowserUrlReward'
import type { Page } from 'patchright'
import { BaseActivity } from '../../shared/activities/BaseActivity'
import { BingSearchPage } from './BingSearchPage'
import { remainingSearchOnBingAttempts, runSearchOnBingQueries } from '../../shared/search/SearchOnBingShared'
import { getSearchOnBingQueries } from '../../shared/search/SearchOnBingQueries'
import { isPromotionComplete } from '../../shared/PromotionEligibility'
import { BrowserTaskPage } from '../../../browser/BrowserTaskPage'
import { URLs } from '../../../constants/urls'
import { isTerminalHttpError } from '../../../network/HttpError'

import type { BasePromotion } from '../../types/RewardsState'
import type { PromotionSource } from '../../types/PromotionContext'

export class BrowserSearchOnBing extends BaseActivity {
    private oldBalance = 0
    private readonly bing = new BingSearchPage(this.bot)

    async run(promotion: BasePromotion, source: PromotionSource = 'search-on-bing'): Promise<ActivityResult> {
        const offerId = promotion.offerId
        this.oldBalance = Number(this.bot.userData.currentPoints ?? 0)

        this.bot.logger.info(
            this.bot.isMobile,
            'SEARCH-ON-BING',
            `Starting SearchOnBing | offerId=${offerId} | title="${promotion.title}" | currentBalance=${this.oldBalance}`
        )

        try {
            if (isPromotionComplete(promotion)) {
                confirmBrowserOffer(promotion)
                return activityResult('skipped', 'already-complete', offerId)
            }
            if (!remainingSearchOnBingAttempts(this.bot, offerId)) {
                const verifier = new OfferVerifier(this.bot, offerId, async () =>
                    offerReading(findBrowserOffer((await this.bot.rewards.getTaskData()).dashboard, promotion))
                )
                if (await verifier.capture()) {
                    confirmBrowserOffer(promotion)
                    return activityResult('skipped', 'already-complete', offerId)
                }
                const result = await verifier.verify(
                    activityResult('unconfirmed', 'search-attempt-limit-reached', offerId)
                )
                if (result.status === 'confirmed') confirmBrowserOffer(promotion)
                return result
            }
            const queries = await getSearchOnBingQueries(this.bot, promotion)
            if (!queries.length) return activityResult('unconfirmed', 'search-query-unavailable', offerId)
            return await new BrowserUrlReward(this.bot).run(promotion, source, {
                activationOnly: true,
                afterClick: (taskPage, verifier, report) =>
                    this.completeSearch(promotion, queries, taskPage, verifier, report)
            })
        } catch (error) {
            this.bot.signal.throwIfAborted()
            if (isTerminalHttpError(error)) throw error
            this.bot.logger.error(
                this.bot.isMobile,
                'SEARCH-ON-BING',
                `Error in doSearchOnBing | offerId=${offerId} | message=${error instanceof Error ? error.message : String(error)}`
            )
            return activityFailure(error, offerId)
        }
    }

    private async completeSearch(
        promotion: BasePromotion,
        queries: string[],
        page: Page,
        verifier: OfferVerifier,
        report?: OfferReport
    ): Promise<ActivityResult> {
        const offerId = promotion.offerId
        if (report && !report.accepted) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'SEARCH-ON-BING-ACTIVATE',
                `Activation was rejected; search not submitted | offerId=${offerId}`
            )
            return verifier.verify(activityResult('unconfirmed', 'activation-not-confirmed', offerId))
        }
        this.bot.logger.debug(
            this.bot.isMobile,
            'SEARCH-ON-BING-ACTIVATE',
            `Activation click finished | offerId=${offerId} | report=${report ? 'accepted' : 'not-observed'} | next=search`
        )
        const current = new URL(page.url())
        const isSearchPage = current.origin === URLs.bing.origin && ['/', '/search'].includes(current.pathname)

        const task = await BrowserTaskPage.create(page, isSearchPage)
        let success: boolean
        try {
            success = await this.searchBing(task.page, queries, promotion)
        } finally {
            await task.close()
        }

        const result = await verifier.verify(
            activityResult(
                success ? 'confirmed' : 'unconfirmed',
                success ? 'offer-complete' : 'offer-not-confirmed',
                offerId
            )
        )
        this.bot.logger.debug(
            this.bot.isMobile,
            'SEARCH-ON-BING',
            `SearchOnBing verified | offerId=${offerId} | status=${result.status}` +
                ` | pointsGained=${result.pointsKnown ? result.pointsGained : 'unknown'}` +
                ` | currentBalance=${this.bot.userData.currentPoints} | previousBalance=${this.oldBalance}`
        )
        return result
    }

    private searchBing(page: Page, queries: string[], promotion: BasePromotion): Promise<boolean> {
        return runSearchOnBingQueries(this.bot, promotion, queries, this.oldBalance, {
            search: async query => {
                await this.bot.sessionState.synchronize('SEARCH-ON-BING-COOKIE-SEED')
                await this.bing.submit(page, query, 'SEARCH-ON-BING', this.bot.isMobile, 1)

                await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 7000))

                await this.bot.sessionState.synchronize('SEARCH-ON-BING-COOKIE-CAPTURE')
                let dashboard = (await this.bot.rewards.getTaskData()).dashboard
                let offer = findBrowserOffer(dashboard, promotion)

                for (let attempt = 0; attempt < 2; attempt++) {
                    if (isPromotionComplete(offer)) break
                    await this.bot.utils.wait(2000)
                    dashboard = (await this.bot.rewards.getTaskData()).dashboard
                    offer = findBrowserOffer(dashboard, promotion)
                }
                return {
                    balance: dashboard.userStatus.availablePoints,
                    offer
                }
            },
            confirm: () => confirmBrowserOffer(promotion)
        })
    }
}
