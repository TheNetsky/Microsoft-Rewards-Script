import { randomUUID } from 'node:crypto'
import { BaseActivity } from '../../shared/activities/BaseActivity'
import type { Promotion } from '../types/AppDashboardData'
import { activityResult, type ActivityResult } from '../../shared/ActivityResult'
import { isTerminalHttpError } from '../../../network/HttpError'
import { appOfferId, findAppPromotion, isAppPromotionComplete } from '../AppPromotion'
import { pointDelta, pointValue } from '../../shared/PointAccounting'
import { isStreakCompleteToday, readStreak } from '../../shared/Streaks'

export class DailyCheckIn extends BaseActivity {
    async run(promotion: Promotion): Promise<ActivityResult> {
        const offerId = appOfferId(promotion)
        const streak = await readStreak(this.bot, 'bing-app', 'DAILY-CHECK-IN')
        if (isStreakCompleteToday(streak)) {
            this.bot.logger.info(
                this.bot.isMobile,
                'DAILY-CHECK-IN',
                'Bing App Streak is already completed today; skipping Daily Check-In'
            )
            return activityResult('skipped', 'already-complete', offerId)
        }
        if (!this.bot.accessTokens.mobile) return activityResult('unconfirmed', 'app-token-unavailable', offerId)
        const channel = 'SAIOS'
        const headers = {
            Accept: '*/*',
            'User-Agent':
                'Mozilla/5.0 (iPad; CPU iPad OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/605.1.15 BingSapphire/33.4.440603001',
            'X-Rewards-AppId': 'SAIOS/33.4.440603001',
            'X-Rewards-PartnerId': 'startapp',
            'X-Rewards-Flights': 'rwgobig'
        }

        let beforeBalance: number | null = null
        let before: Promotion = {
            ...promotion,
            attributes: { ...promotion.attributes, pointprogress: '', progress: '', last_updated: '', complete: '' }
        }
        try {
            this.bot.signal.throwIfAborted()
            const dashboard = await this.bot.appPlatform.getDashboard(headers, channel)
            this.bot.signal.throwIfAborted()
            beforeBalance = dashboard.response.balance
            const current = findAppPromotion(dashboard.response.promotions, promotion)
            if (current) before = current
            else
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'DAILY-CHECK-IN',
                    `Daily Check-In absent from iOS baseline; point baseline is unknown | offerId=${offerId}`
                )
        } catch (error) {
            this.bot.signal.throwIfAborted()
            if (isTerminalHttpError(error)) throw error
            this.bot.logger.warn(
                this.bot.isMobile,
                'DAILY-CHECK-IN',
                `Daily Check-In iOS baseline unavailable; point baseline is unknown | message=${error instanceof Error ? error.message : String(error)}`
            )
        }
        if (isAppPromotionComplete(before)) return activityResult('skipped', 'already-complete', offerId)
        const lastUpdated = Date.parse(before.attributes.last_updated ?? '')
        if (
            Number.isFinite(lastUpdated) &&
            this.bot.utils.formatDate(lastUpdated, this.bot.userData.timezone) ===
                this.bot.utils.formatDate(Date.now(), this.bot.userData.timezone)
        )
            return activityResult('skipped', 'already-complete', offerId)
        let previousBalance: number | null = beforeBalance
        try {
            const submission = await this.bot.appPlatform.submitActivity(
                {
                    risk_context: {},
                    type: 103,
                    channel,
                    attributes: {},
                    id: randomUUID(),
                    amount: 1,
                    country: this.bot.userData.geoLocale
                },
                headers
            )
            previousBalance = submission.previousBalance
            const responseBalance = submission.data?.response?.balance
            this.bot.logger.debug(
                this.bot.isMobile,
                'DAILY-CHECK-IN',
                `Daily Check-In request sent; verifying completion | type=103 | channel=${channel} | status=${submission.status}` +
                    ` | previousBalance=${previousBalance} | responseBalance=${Number.isFinite(responseBalance) ? responseBalance : 'unknown'}`
            )
        } catch (error) {
            this.bot.signal.throwIfAborted()
            if (isTerminalHttpError(error)) throw error
            this.bot.logger.warn(
                this.bot.isMobile,
                'DAILY-CHECK-IN',
                `Submission uncertain; verifying without resubmitting | ${String(error)}`
            )
        }
        let result = await this.verifyOffer(before, headers, 6, beforeBalance)

        const currentBalance = await this.refreshBalance(previousBalance)
        const balanceDelta = pointDelta(previousBalance, currentBalance)
        if (result.status === 'unconfirmed' && balanceDelta !== null && balanceDelta >= 5)
            result = activityResult('confirmed', 'check-in-balance-confirmed', offerId, balanceDelta)
        if (
            result.status === 'unconfirmed' &&
            isStreakCompleteToday(await readStreak(this.bot, 'bing-app', 'DAILY-CHECK-IN'))
        )
            result = { ...result, status: 'confirmed', reason: 'check-in-streak-verified' }
        const summary =
            `Daily Check-In ${result.status} | type=103 | offerId=${offerId} | reason=${result.reason}` +
            ` | previousBalance=${previousBalance} | currentBalance=${currentBalance ?? 'unknown'}` +
            ` | balanceDelta=${balanceDelta ?? 'unknown'}` +
            ` | pointsGained=${result.pointsKnown === false ? 'unknown' : result.pointsGained}`
        this.bot.logger.debug(this.bot.isMobile, 'DAILY-CHECK-IN', summary)
        return result
    }

    private async refreshBalance(previousBalance: number | null): Promise<number | null> {
        let currentBalance: number | null = null
        for (let attempt = 0; attempt < 3; attempt++) {
            this.bot.signal.throwIfAborted()
            if (attempt) await this.bot.utils.wait(1000)
            this.bot.signal.throwIfAborted()
            try {
                const balance = await this.bot.rewards.getCurrentPoints()
                this.bot.signal.throwIfAborted()
                currentBalance = pointValue(balance) ?? currentBalance
                if (previousBalance === null || (pointDelta(previousBalance, currentBalance) ?? 0) >= 10) break
            } catch (error) {
                this.bot.signal.throwIfAborted()
                if (isTerminalHttpError(error)) throw error
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'DAILY-CHECK-IN',
                    `Daily Check-In balance refresh unavailable | attempt=${attempt + 1}/3` +
                        ` | message=${error instanceof Error ? error.message : String(error)}`
                )
            }
        }
        return currentBalance
    }

    private async verifyOffer(
        promotion: Promotion,
        headers: Record<string, string>,
        maxAttempts: number,
        beforeBalance: number | null
    ): Promise<ActivityResult> {
        try {
            return await this.bot.appPlatform.verifyActivity(promotion, headers, 'SAIOS', {
                maxAttempts,
                beforeBalance,
                delayMs: 2000
            })
        } catch (error) {
            this.bot.signal.throwIfAborted()
            if (isTerminalHttpError(error)) throw error
            this.bot.logger.warn(
                this.bot.isMobile,
                'DAILY-CHECK-IN',
                `Daily Check-In offer verification unavailable | message=${error instanceof Error ? error.message : String(error)}`
            )
            return {
                ...activityResult('unconfirmed', 'offer-verification-unavailable', appOfferId(promotion)),
                pointsKnown: false
            }
        }
    }
}
