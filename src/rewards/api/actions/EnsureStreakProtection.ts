import { activityResult, activityFailure, type ActivityResult } from '../../shared/ActivityResult'
import { URLs } from '../../../constants/urls'
import { HttpError, isTerminalHttpError } from '../../../network/HttpError'
import { BaseActivity } from '../../shared/activities/BaseActivity'

const VERIFY_ATTEMPTS = 3
const VERIFY_DELAY = 1500

export class EnsureStreakProtection extends BaseActivity {
    async run(): Promise<ActivityResult> {
        try {
            const before = await this.readState()
            if (!before.html) {
                return activityResult('unconfirmed', 'earn-page-unavailable')
            }
            if (before.state?.isProtectionOn) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'ENABLE-STREAK-PROTECTION',
                    `Already enabled | remainingDays=${before.state.remainingDays ?? 'unknown'}`
                )
                return activityResult('confirmed', 'already-enabled')
            }
            if (before.state?.remainingDays === 0) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'ENABLE-STREAK-PROTECTION',
                    'No protection days remain; skipping'
                )
                return activityResult('skipped', 'no-protection-days')
            }

            const { status } = await this.bot.rewards.reportStreakProtection(before.html)
            if (status < 200 || status >= 300) throw new HttpError(status, { status, headers: {} })

            for (let attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt++) {
                const after = await this.readState()
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'ENABLE-STREAK-PROTECTION',
                    `Verification | attempt=${attempt}/${VERIFY_ATTEMPTS} | enabled=${after.state?.isProtectionOn ?? 'unknown'}` +
                        ` | remainingDays=${after.state?.remainingDays ?? 'unknown'} | status=${status}`
                )
                if (after.state?.isProtectionOn) {
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'ENABLE-STREAK-PROTECTION',
                        `Enabled | remainingDays=${after.state.remainingDays ?? 'unknown'} | status=${status}`
                    )
                    return activityResult('confirmed', 'protection-enabled')
                }
                if (attempt < VERIFY_ATTEMPTS) {
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'ENABLE-STREAK-PROTECTION',
                        `Waiting for fresh protection state | waitMs=${VERIFY_DELAY}`
                    )
                    await this.bot.utils.wait(VERIFY_DELAY)
                }
            }

            return activityResult('unconfirmed', 'protection-not-confirmed')
        } catch (error) {
            this.bot.signal.throwIfAborted()
            if (isTerminalHttpError(error)) throw error
            const message = error instanceof Error ? error.message : String(error)
            this.bot.logger.debug(this.bot.isMobile, 'ENABLE-STREAK-PROTECTION', `Activation failed | ${message}`)
            return activityFailure(error)
        }
    }

    private async readState() {
        this.bot.signal.throwIfAborted()
        const html = await this.bot.mode.accountData.getPageHtml(URLs.rewards.earn, '/earn')
        this.bot.signal.throwIfAborted()
        const state = html ? this.bot.pageParser.getStreakProtection(html) : null
        if (state && this.bot.reactSnapshot) this.bot.reactSnapshot.streakProtection = state
        return { html, state }
    }
}
