import { randomBytes } from 'node:crypto'
import { appOfferId, findAppPromotion, isAppPromotionComplete } from '../../app/AppPromotion'
import type { Promotion } from '../../app/types/AppDashboardData'
import { BaseActivity } from '../../shared/activities/BaseActivity'
import { activityFailure, activityResult, type ActivityResult } from '../../shared/ActivityResult'
import { pointValue } from '../../shared/PointAccounting'
import { logReadToEarnCredit, logReadToEarnRetry, readToEarnSkippedMessage } from '../../../logging/ReadToEarnLog'

const MAX_READ_REPORTS_PER_RUN = 20

export class ApiReadToEarn extends BaseActivity {
    async run(promotion: Promotion): Promise<ActivityResult> {
        const offerId = appOfferId(promotion)
        if (!this.bot.accessTokens.mobile) return activityResult('unconfirmed', 'app-token-unavailable', offerId)

        const baseline = await this.bot.appPlatform.getDashboard()
        let current = findAppPromotion(baseline.response.promotions, promotion)
        if (!current) return activityResult('unconfirmed', 'offer-not-found', offerId)
        if (isAppPromotionComplete(current)) return activityResult('skipped', 'already-complete', offerId)

        const startProgress = pointValue(current.attributes.pointprogress)
        const pointMax = pointValue(current.attributes.pointmax)
        let currentBalance = baseline.response.balance
        let totalPoints = 0
        let pointsKnown = true
        let reportsAccepted = 0
        let lastFailure: ActivityResult | undefined

        this.bot.logger.info(
            this.bot.isMobile,
            'READ-TO-EARN',
            `Starting Read to Earn | transport=api | offerId=${offerId}` +
                ` | progress=${startProgress ?? 'unknown'}/${pointMax ?? 'unknown'}` +
                ` | currentBalance=${currentBalance}`
        )

        for (let report = 1; report <= MAX_READ_REPORTS_PER_RUN; report++) {
            this.bot.signal.throwIfAborted()
            const before = current
            const beforeProgress = pointValue(before.attributes.pointprogress)
            const beforeBalance = currentBalance
            let submissionFailed = false

            try {
                await this.bot.appPlatform.submitActivity({
                    id: randomBytes(64).toString('hex'),
                    amount: 1,
                    type: 101,
                    attributes: { offerid: offerId },
                    country: this.bot.userData.geoLocale
                })
            } catch (error) {
                this.bot.signal.throwIfAborted()
                submissionFailed = true
                lastFailure = activityFailure(error, offerId)
                this.bot.logger.info(
                    this.bot.isMobile,
                    'READ-TO-EARN',
                    `Read report request failed; checking whether Microsoft still credited it` + ` | report=${report}`
                )
                this.bot.logger.debug(this.bot.isMobile, 'READ-TO-EARN', error instanceof Error ? error : String(error))
            }

            const verified = await this.bot.appPlatform.verifyActivity(before, {}, this.bot.appIdentity.channel, {
                maxAttempts: 3,
                delayMs: 1500,
                beforeBalance,
                onRetry: (attempt, maxAttempts) => logReadToEarnRetry(this.bot, report, attempt, maxAttempts)
            })
            if (verified.pointsKnown === false) pointsKnown = false
            else totalPoints += verified.pointsGained
            logReadToEarnCredit(this.bot, report, verified)

            let refreshed: Promotion | undefined
            try {
                const dashboard = await this.bot.appPlatform.getDashboard()
                currentBalance = dashboard.response.balance
                this.bot.userData.currentPoints = currentBalance
                refreshed = findAppPromotion(dashboard.response.promotions, before)
            } catch (error) {
                this.bot.signal.throwIfAborted()
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'READ-TO-EARN',
                    `Read to Earn refresh unavailable | report=${report}` +
                        ` | message=${error instanceof Error ? error.message : String(error)}`
                )
            }

            if (!refreshed) {
                const result = activityResult(
                    verified.status === 'confirmed' ? 'confirmed' : 'unconfirmed',
                    verified.status === 'confirmed'
                        ? 'read-to-earn-progressed-refresh-unavailable'
                        : 'read-to-earn-refresh-unavailable',
                    offerId,
                    pointsKnown ? totalPoints : null
                )
                if (result.status === 'unconfirmed') result.message = readToEarnSkippedMessage(verified, 3)
                this.logSummary(
                    result,
                    reportsAccepted + (verified.status === 'confirmed' ? 1 : 0),
                    startProgress,
                    null
                )
                return result
            }

            current = refreshed
            const afterProgress = pointValue(current.attributes.pointprogress)
            const progressChanged = beforeProgress !== null && afterProgress !== null && afterProgress > beforeProgress
            const progressed = progressChanged || verified.status === 'confirmed'

            if (progressed) reportsAccepted++

            this.bot.logger.debug(
                this.bot.isMobile,
                'READ-TO-EARN',
                `Read report processed | report=${report}` +
                    ` | status=${verified.status} | reason=${verified.reason}` +
                    ` | progress=${beforeProgress ?? 'unknown'}->${afterProgress ?? 'unknown'}` +
                    ` | previousBalance=${beforeBalance} | currentBalance=${currentBalance}` +
                    ` | pointsGained=${verified.pointsKnown === false ? 'unknown' : verified.pointsGained}`
            )

            if (isAppPromotionComplete(current)) {
                const result = activityResult(
                    'confirmed',
                    'read-to-earn-complete',
                    offerId,
                    pointsKnown ? totalPoints : null
                )
                this.logSummary(result, reportsAccepted, startProgress, pointValue(current.attributes.pointprogress))
                return result
            }

            if (verified.status === 'confirmed' && !progressChanged) {
                const result = activityResult(
                    'confirmed',
                    'read-to-earn-progressed-refresh-lagged',
                    offerId,
                    pointsKnown ? totalPoints : null
                )
                this.logSummary(result, reportsAccepted, startProgress, afterProgress)
                return result
            }

            if (!progressed) {
                const result = submissionFailed && lastFailure ? lastFailure : verified
                const finalResult: ActivityResult = {
                    ...result,
                    status: 'unconfirmed',
                    reason: submissionFailed ? result.reason : 'read-to-earn-progress-unchanged',
                    message: readToEarnSkippedMessage(verified, 3),
                    offerId,
                    pointsGained: pointsKnown ? totalPoints : 0,
                    pointsKnown
                }
                this.logSummary(finalResult, reportsAccepted, startProgress, afterProgress)
                return finalResult
            }

            if (report < MAX_READ_REPORTS_PER_RUN) {
                const delay = this.bot.utils.randomDelay(
                    this.bot.config.searchSettings.readDelay.min,
                    this.bot.config.searchSettings.readDelay.max
                )
                this.bot.logger.info(
                    this.bot.isMobile,
                    'READ-DELAY',
                    `Waiting before next read report | activity=read-to-earn | report=${report} | waitMs=${delay}`
                )
                await this.bot.utils.wait(delay)
            }
        }

        const finalProgress = pointValue(current.attributes.pointprogress)
        const status = reportsAccepted > 0 ? 'confirmed' : 'unconfirmed'
        const result = activityResult(
            status,
            reportsAccepted > 0 ? 'read-to-earn-progressed' : 'read-to-earn-no-progress',
            offerId,
            pointsKnown ? totalPoints : null
        )
        this.logSummary(result, reportsAccepted, startProgress, finalProgress)
        return result
    }

    private logSummary(
        result: ActivityResult,
        reportsAccepted: number,
        startProgress: number | null,
        finalProgress: number | null
    ): void {
        const message =
            `Read to Earn ${result.status} | reason=${result.reason}` +
            ` | reportsAccepted=${reportsAccepted}` +
            ` | progress=${startProgress ?? 'unknown'}->${finalProgress ?? 'unknown'}` +
            ` | pointsGained=${result.pointsKnown === false ? 'unknown' : result.pointsGained}`
        this.bot.logger.debug(this.bot.isMobile, 'READ-TO-EARN', message)
    }
}
