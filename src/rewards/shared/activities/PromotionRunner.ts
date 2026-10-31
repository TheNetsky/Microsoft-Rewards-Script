import { isSearchOnBingPromotion } from '../PromotionEligibility'
import { activityResult, activityFailure, summarizeActivities, type ActivityResult } from '../ActivityResult'
import { BaseActivity } from './BaseActivity'
import type { BasePromotion } from '../../types/RewardsState'
import type { PromotionSource } from '../../types/PromotionContext'
import { isTerminalHttpError } from '../../../network/HttpError'

export class PromotionRunner extends BaseActivity {
    async run(promotions: BasePromotion[], source: PromotionSource): Promise<ActivityResult[]> {
        const results: ActivityResult[] = []
        for (const promotion of promotions) {
            try {
                const result = { ...(await this.runPromotion(promotion, source)), title: promotion.title }
                results.push(result)
                this.bot.recordActivity(source, result)
            } catch (error) {
                this.bot.signal.throwIfAborted()
                if (isTerminalHttpError(error)) throw error
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'ACTIVITY-ERROR',
                    error instanceof Error ? error : String(error)
                )
                const result = { ...activityFailure(error, promotion.offerId), title: promotion.title }
                results.push(result)
                this.bot.recordActivity(source, result)
                this.bot.logger.error(
                    this.bot.isMobile,
                    'ACTIVITY',
                    `Error while solving activity "${promotion.title}" | message=${
                        error instanceof Error ? error.message : String(error)
                    }`
                )
            }
        }
        const summary = summarizeActivities(results)
        this.bot.logger.debug(
            this.bot.isMobile,
            'ACTIVITY-SUMMARY',
            `${source} | confirmed=${summary.confirmed} | unconfirmed=${summary.unconfirmed} | skipped=${summary.skipped} | failed=${summary.failed}`
        )
        return results
    }

    private async runPromotion(promotion: BasePromotion, source: PromotionSource): Promise<ActivityResult> {
        const type = promotion.promotionType?.toLowerCase() ?? ''
        const offerId = promotion.offerId

        this.bot.logger.debug(
            this.bot.isMobile,
            'ACTIVITY',
            `Processing activity | title="${promotion.title}" | offerId=${offerId} | type=${type}`
        )

        const isSearchOnBing = isSearchOnBingPromotion(promotion)
        if (isSearchOnBing && !this.bot.config.activities.searchOnBing) {
            this.logDisabled('SearchOnBing', offerId)
            return activityResult('skipped', 'search-on-bing-disabled', offerId)
        }
        if (!isSearchOnBing && !this.bot.config.activities.urlReward) {
            this.logDisabled('UrlReward', offerId)
            return activityResult('skipped', 'url-rewards-disabled', offerId)
        }

        if (!isSearchOnBing && type !== 'urlreward') {
            this.bot.logger.debug(
                this.bot.isMobile,
                'ACTIVITY',
                `Skipped activity "${promotion.title}" | offerId=${offerId} | reason=unsupported type "${
                    promotion.promotionType
                }"`
            )
            return activityResult('skipped', 'unsupported-promotion-type', offerId)
        }

        if (isSearchOnBing) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'ACTIVITY',
                `Found activity type "SearchOnBing" | title="${promotion.title}" | offerId=${offerId}`
            )
            return this.bot.activities.searchOnBing(promotion, source)
        }

        this.bot.logger.debug(
            this.bot.isMobile,
            'ACTIVITY',
            `Found activity type "UrlReward" | title="${promotion.title}" | offerId=${offerId}`
        )
        return this.bot.activities.runUrlReward(promotion, source)
    }

    private logDisabled(activity: string, offerId: string): void {
        this.bot.logger.debug(
            this.bot.isMobile,
            'ACTIVITY',
            `Skipping "${activity}" (disabled in config) | offerId=${offerId}`
        )
    }
}
