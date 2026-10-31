import type { Account } from '../../../core/Account'
import { executionContext } from '../../../core/ExecutionContext'
import { BingSearchApi } from '../../api/search/BingSearchApi'
import { activityResult, type ActivityResult } from '../../shared/ActivityResult'
import { BaseActivity } from '../../shared/activities/BaseActivity'
import { creditedPoints, findPointOffer } from '../../shared/PointAccounting'
import { isPromotionComplete } from '../../shared/PromotionEligibility'
import { QueryEngine } from '../../shared/query/QueryEngine'
import type { RewardsState } from '../../types/RewardsState'
import { SearchProgress } from '../../shared/search/SearchProgress'
import type { StreakState } from '../../shared/parsers/RewardsPageParser'
import { isStreakCompleteToday, readStreak } from '../../shared/Streaks'

export class BrowserSearchApiReport extends BaseActivity {
    private attempted = false

    run(account: Account): Promise<number | null | undefined> {
        if (
            this.attempted ||
            this.bot.config.rewardsMode !== 'browser' ||
            !this.bot.config.experimental.browserSearchApiReport
        )
            return Promise.resolve(undefined)
        this.attempted = true
        return executionContext.run({ account, isMobile: false }, () => this.report(account))
    }

    private async report(account: Account): Promise<number | null> {
        let before: RewardsState | undefined
        let result: ActivityResult
        try {
            this.bot.signal.throwIfAborted()
            this.bot.logger.info(
                false,
                'SEARCH-API-REPORT',
                "Checking today's Bing Search Streak before the experimental API search"
            )
            const streak = await readStreak(this.bot, 'bing-search', 'SEARCH-API-REPORT')
            if (isStreakCompleteToday(streak)) {
                this.bot.logger.info(
                    false,
                    'SEARCH-API-REPORT',
                    'Bing Search Streak is already completed today; skipping the API search'
                )
                this.bot.recordActivity('browser-search-api-report', {
                    ...activityResult('skipped', 'already-complete'),
                    message: 'Bing Search Streak is already completed for the current Rewards day'
                })
                return 0
            }
            const topics = await new QueryEngine(this.bot).getTopics()
            const query = topics[Math.floor(Math.random() * topics.length)]?.text
            if (!query) throw new Error('No search query is available')
            const knownBalance = this.bot.userData.currentPoints
            before = await this.readState()
            if (before && before.dashboard.userStatus.availablePoints < knownBalance) {
                this.bot.logger.debug(
                    false,
                    'SEARCH-API-REPORT',
                    'Search baseline returned an older balance; keeping the experimental credit amount unverified'
                )
                before = undefined
            }
            await this.bot.sessionState.synchronize('SEARCH-API-REPORT')
            this.bot.logger.info(
                false,
                'SEARCH-API-REPORT',
                `Sending one experimental API search | streak=${streak ? 'not-completed-today' : 'unavailable'}` +
                    ` | query=${JSON.stringify(query)}`
            )

            const report = await new BingSearchApi(this.bot).report(query)
            result = activityResult(
                report.acknowledged ? 'confirmed' : 'unconfirmed',
                report.acknowledged ? 'search-report-sent' : 'search-report-not-acknowledged'
            )
        } catch (error) {
            this.bot.signal.throwIfAborted()
            this.bot.logger.debug(false, 'SEARCH-API-REPORT', error instanceof Error ? error : String(error))
            result = {
                ...activityResult('unconfirmed', 'search-report-failed'),
                message: (error instanceof Error ? error.message : String(error)).split(/\r?\n/)[0]
            }
        }

        const progress = new SearchProgress(this.bot)
        let after: RewardsState | undefined
        let afterStreak: StreakState | undefined
        let gained: number | null = null
        for (let check = 1; check <= 3; check++) {
            this.bot.signal.throwIfAborted()
            if (check > 1) await this.bot.utils.wait(2000)
            const [state, streak] = await Promise.all([
                this.readState(),
                readStreak(this.bot, 'bing-search', 'SEARCH-API-REPORT')
            ])
            after = state ?? after
            afterStreak = streak
            if (before && after) {
                const beforeCounters = before.dashboard.userStatus.counters
                const afterCounters = after.dashboard.userStatus.counters

                const counterGain = progress.gained(
                    progress.calculateMissing(beforeCounters, false),
                    progress.calculateMissing(afterCounters, false)
                )
                gained = creditedPoints(
                    counterGain,
                    before.dashboard.userStatus.availablePoints,
                    after.dashboard.userStatus.availablePoints
                )
                this.bot.logger.debug(
                    false,
                    'SEARCH-API-REPORT',
                    `Search report verification | check=${check}/3 | counterGain=${counterGain ?? 'unknown'}` +
                        ` | pointsGained=${gained ?? 'unknown'} | currentBalance=${after.dashboard.userStatus.availablePoints}`
                )
            }
            if (isStreakCompleteToday(afterStreak)) break
        }
        if (isStreakCompleteToday(afterStreak)) {
            result = { ...result, status: 'confirmed', reason: 'search-streak-verified', message: undefined }
            this.bot.logger.info(false, 'SEARCH-API-REPORT', 'Bing Search Streak confirmed complete for today')
        } else {
            this.bot.logger.info(
                false,
                'SEARCH-API-REPORT',
                "One API search attempted; today's Bing Search Streak is not yet confirmed"
            )
        }
        if (after) this.reconcileActivities(account, after, progress)
        this.bot.recordActivity('browser-search-api-report', {
            ...result,
            pointsGained: gained ?? 0,
            pointsKnown: gained !== null,
            balanceBefore: before?.dashboard.userStatus.availablePoints ?? null,
            balanceAfter: after?.dashboard.userStatus.availablePoints ?? null
        })
        return gained
    }

    private async readState(): Promise<RewardsState | undefined> {
        try {
            return await this.bot.rewards.getDashboardData()
        } catch (error) {
            this.bot.signal.throwIfAborted()
            this.bot.logger.debug(false, 'SEARCH-API-REPORT', `Search verification data unavailable | ${String(error)}`)
            return undefined
        }
    }

    private reconcileActivities(account: Account, after: RewardsState, progress: SearchProgress): void {
        const latest = new Map(
            this.bot.activityResults.map(result => [`${result.platform}:${result.offerId ?? result.activity}`, result])
        )
        for (const previous of latest.values()) {
            if (!['unconfirmed', 'failed'].includes(previous.status)) continue
            const isMobile = previous.platform === 'mobile'
            const quota = progress.calculateMissing(after.dashboard.userStatus.counters, isMobile)
            const complete =
                previous.activity === 'search'
                    ? quota.available !== false && quota.totalPoints <= 0
                    : previous.offerId && isPromotionComplete(findPointOffer(after.dashboard, previous.offerId))
            if (!complete) continue
            executionContext.run({ account, isMobile }, () =>
                this.bot.recordActivity(previous.activity, {
                    ...previous,
                    status: 'confirmed',
                    reason: previous.activity === 'search' ? 'quota-complete' : 'offer-state-confirmed',
                    message: undefined,
                    errorCode: undefined
                })
            )
        }
    }
}
