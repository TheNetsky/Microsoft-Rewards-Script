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
                `跳过：bundle 中未发现连击保护 action id（查找过 [${STREAK_PROTECTION_ACTION_NAMES.join(', ')}] 及任何 "*streak*protect*" 键）`
            )
            return
        }

        const before = this.bot.reactSnapshot?.streakProtection ?? null

        if (before?.isProtectionOn) {
            this.bot.logger.info(
                this.bot.isMobile,
                'ENABLE-STREAK-PROTECTION',
                `连击保护已启用 | remainingDays=${before.remainingDays ?? 'null'}`,
                'green'
            )
            return
        }

        if (before && before.remainingDays === 0) {
            this.bot.logger.info(
                this.bot.isMobile,
                'ENABLE-STREAK-PROTECTION',
                '没有剩余的保护天数 - 开关已禁用，跳过'
            )
            return
        }

        const beforeDesc = before
            ? `enabled=${before.isProtectionOn},remainingDays=${before.remainingDays ?? 'null'}`
            : 'unknown'
        this.bot.logger.info(
            this.bot.isMobile,
            'ENABLE-STREAK-PROTECTION',
            `开始确保连击保护 | action=${resolved.name} | before=${beforeDesc}`
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
                    `完成 | streakProtectionEnabled=true | remainingDays=${after.remainingDays ?? 'null'} | status=${status}`,
                    'green'
                )
            } else if (after === null) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'ENABLE-STREAK-PROTECTION',
                    `已触发但无法从最新快照确认状态 | acknowledged=${acknowledged} | status=${status}`
                )
            } else {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'ENABLE-STREAK-PROTECTION',
                    `开关未生效 - 触发后仍处于关闭状态 | status=${status}`
                )
            }

            await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 10000))
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'ENABLE-STREAK-PROTECTION',
                `ensureStreakProtection 出错 | message=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async readStreakProtection() {
        try {
            const html = await this.bot.browser.func.getRewardsPageHtml(URLs.rewards.earn, '/earn')
            if (!html) {
                this.bot.logger.warn(this.bot.isMobile, 'ENABLE-STREAK-PROTECTION', '验证请求失败')
                return null
            }
            return this.bot.browser.react.getStreakProtection(html)
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'ENABLE-STREAK-PROTECTION',
                `验证读取出错 | ${error instanceof Error ? error.message : String(error)}`
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
