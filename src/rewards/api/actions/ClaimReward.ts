import { OfferVerifier } from '../../shared/OfferVerifier'
import { pointValue } from '../../shared/PointAccounting'
import {
    activityResult,
    activityFailure,
    nonReportableOfferResult,
    type ActivityResult
} from '../../shared/ActivityResult'
import type { QuestChild } from '../../shared/parsers/RewardsPageParser'
import { BaseActivity } from '../../shared/activities/BaseActivity'
import { URLs } from '../../../constants/urls'

export class ClaimReward extends BaseActivity {
    async run(child: QuestChild, parentId: string): Promise<ActivityResult> {
        const offerId = child.offerId
        if (!child.reportable) return nonReportableOfferResult(child)

        const actionId = this.bot.nextActions.reportActivity
        if (!actionId) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'CLAIM-REWARD',
                `Skipping ${offerId}: "reportActivity" not discovered in bundle`
            )
            return activityResult('unconfirmed', 'action-id-unavailable', offerId)
        }

        if (!child.hash) {
            this.bot.logger.warn(this.bot.isMobile, 'CLAIM-REWARD', `Skipping ${offerId}: no live hash on quest child`)
            return activityResult('unconfirmed', 'offer-hash-unavailable', offerId)
        }

        this.bot.logger.debug(
            this.bot.isMobile,
            'CLAIM-REWARD',
            `Claiming reward | offerId=${offerId} | geo=${this.bot.userData.geoLocale}`
        )

        const questUrl = URLs.rewards.quest(parentId)
        const verifier = new OfferVerifier(this.bot, offerId, async () => {
            const html = await this.bot.rewards.getRewardsPageHtml(questUrl, `/earn/quest/${parentId}`)
            if (!html) return undefined
            const offer = this.bot.pageParser
                .snapshotQuestPage(html, { offerId: parentId, title: '', pointProgressMax: 0, complete: false })
                .find(item => item.offerId === offerId)
            return offer
                ? {
                      complete: offer.isCompleted,
                      progress: pointValue(offer.pointProgress),
                      maximum: pointValue(offer.points)
                  }
                : undefined
        })
        if (await verifier.capture()) return activityResult('skipped', 'already-complete', offerId)
        let outcome: ActivityResult
        try {
            const result = await this.bot.rewards.reportServerAction(
                actionId,
                [
                    child.hash,
                    11,
                    { offerid: offerId, isPromotional: '$undefined', timezoneOffset: this.bot.userData.timezoneOffset }
                ],
                {
                    url: questUrl,
                    referer: questUrl,
                    routerStateTree: this.bot.pageParser.questRouterStateTree(parentId)
                }
            )
            if (result.availablePoints !== null) this.bot.userData.currentPoints = result.availablePoints
            outcome = activityResult(
                'unconfirmed',
                result.acknowledged ? 'server-acknowledged' : 'server-not-acknowledged',
                offerId
            )
        } catch (error) {
            outcome = activityFailure(error, offerId)
        }
        const verified = await verifier.verify(outcome)
        this.bot.logger.debug(
            this.bot.isMobile,
            'CLAIM-REWARD',
            `Quest reward verified | offerId=${offerId} | status=${verified.status}` +
                ` | pointsGained=${verified.pointsKnown ? verified.pointsGained : 'unknown'}` +
                ` | currentBalance=${this.bot.userData.currentPoints}`
        )
        return verified
    }
}
