import { appOfferId, findAppPromotion, isAppPromotionComplete } from '../AppPromotion'
import { randomUUID } from 'node:crypto'
import type { Promotion } from '../types/AppDashboardData'
import { BaseActivity } from '../../shared/activities/BaseActivity'
import { activityResult, activityFailure, type ActivityResult } from '../../shared/ActivityResult'

export class AppReward extends BaseActivity {
    async run(promotion: Promotion): Promise<ActivityResult> {
        const offerId = appOfferId(promotion)
        if (!this.bot.accessTokens.mobile) return activityResult('unconfirmed', 'app-token-unavailable', offerId)
        const baseline = await this.bot.appPlatform.getDashboard()
        const current = findAppPromotion(baseline.response.promotions, promotion)
        if (!current) return activityResult('unconfirmed', 'offer-not-found', offerId)
        if (isAppPromotionComplete(current)) return activityResult('skipped', 'already-complete', offerId)
        let failure: ActivityResult | undefined
        try {
            await this.bot.appPlatform.submitActivity({
                id: randomUUID(),
                amount: 1,
                type: 101,
                channel: this.bot.appIdentity.channel,
                attributes: { offerid: offerId },
                country: this.bot.userData.geoLocale
            })
        } catch (error) {
            this.bot.signal.throwIfAborted()
            failure = activityFailure(error, offerId)
        }
        const verified = await this.bot.appPlatform.verifyActivity(current, {}, this.bot.appIdentity.channel, {
            beforeBalance: baseline.response.balance
        })
        return verified.status === 'confirmed' || !failure
            ? verified
            : { ...failure, pointsGained: verified.pointsGained, pointsKnown: verified.pointsKnown }
    }
}
