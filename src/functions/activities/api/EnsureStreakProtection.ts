import { URLs } from '../../../constants/urls'
import { BaseActivity } from '../BaseActivity'

const STREAK_PROTECTION_ACTION_NAMES = [
    'reportSetStreakProtection',
    'reportToggleStreakProtection',
    'reportEnableStreakProtection',
    'setStreakProtection',
    'reportStreakProtection'
]

export class EnsureStreakProtection extends BaseActivity {
    public async ensureStreakProtection() {
        const resolved = this.resolveActionId()
        if (!resolved) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'ENABLE-STREAK-PROTECTION',
                `Skipping: streak-protection action id not discovered in bundle (looked for [${STREAK_PROTECTION_ACTION_NAMES.join(', ')}] + any "*streak*protect*" key)`
            )
            return
        }

        const before = this.bot.reactSnapshot?.streakProtection ?? null

        if (before?.isProtectionOn) {
            this.bot.logger.info(
                this.bot.isMobile,
                'ENABLE-STREAK-PROTECTION',
                `Already enabled | remainingDays=${before.remainingDays ?? 'null'}`,
                'green'
            )
            return
        }

        if (before && before.remainingDays === 0) {
            this.bot.logger.info(
                this.bot.isMobile,
                'ENABLE-STREAK-PROTECTION',
                'No protection days remaining - toggle is disabled, skipping'
            )
            return
        }

        const beforeDesc = before
            ? `enabled=${before.isProtectionOn},remainingDays=${before.remainingDays ?? 'null'}`
            : 'unknown'
        this.bot.logger.info(
            this.bot.isMobile,
            'ENABLE-STREAK-PROTECTION',
            `Starting EnsureStreakProtection | action=${resolved.name} | before=${beforeDesc}`
        )

        try {
            // Fired from the streaks page, so url/referer point there
            const { status, acknowledged } = await this.bot.browser.func.reportServerAction(resolved.id, [true], {
                url: URLs.rewards.earnStreaks,
                referer: URLs.rewards.earnStreaks
            })

            const after = await this.readStreakProtection()

            if (after?.isProtectionOn) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'ENABLE-STREAK-PROTECTION',
                    `Completed | streakProtectionEnabled=true | remainingDays=${after.remainingDays ?? 'null'} | status=${status}`,
                    'green'
                )
            } else if (after === null) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'ENABLE-STREAK-PROTECTION',
                    `Fired but could not confirm state from a fresh snapshot | acknowledged=${acknowledged} | status=${status}`
                )
            } else {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'ENABLE-STREAK-PROTECTION',
                    `Toggle did not take - still off after firing | status=${status}`
                )
            }

            await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 10000))
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'ENABLE-STREAK-PROTECTION',
                `Error in ensureStreakProtection | message=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async readStreakProtection() {
        try {
            const html = await this.bot.browser.func.getRewardsPageHtml(URLs.rewards.earn, '/earn')
            if (!html) {
                this.bot.logger.warn(this.bot.isMobile, 'ENABLE-STREAK-PROTECTION', 'Verify fetch failed')
                return null
            }
            return this.bot.browser.react.getStreakProtection(html)
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'ENABLE-STREAK-PROTECTION',
                `Verify read errored | ${error instanceof Error ? error.message : String(error)}`
            )
            return null
        }
    }

    private resolveActionId(): { name: string; id: string } | null {
        const actions = this.bot.nextActions

        for (const name of STREAK_PROTECTION_ACTION_NAMES) {
            const id = actions[name]
            if (id) return { name, id }
        }

        const fuzzy = Object.keys(actions).find(k => /streak/i.test(k) && /protect/i.test(k))
        if (fuzzy) return { name: fuzzy, id: actions[fuzzy]! }

        return null
    }
}
