import type { QuestChild } from '../../../browser/ReactFunc'
import { BaseActivity } from '../BaseActivity'
import { URLs } from '../../../constants/urls'

// This is still very much WIP!
export class ClaimReward extends BaseActivity {
    public async claimReward(child: QuestChild, parentId: string) {
        const offerId = child.offerId

        const actionId = this.bot.nextActions.reportActivity
        if (!actionId) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'CLAIM-REWARD',
                `跳过 ${offerId}：bundle 中未发现 "reportActivity"`
            )
            return
        }

        if (!child.hash) {
            this.bot.logger.warn(this.bot.isMobile, 'CLAIM-REWARD', `跳过 ${offerId}：任务子项没有有效的 hash`)
            return
        }
        if (!child.reportable) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'CLAIM-REWARD',
                `跳过 ${offerId}：不可上报（已完成/已锁定/已禁用）`
            )
            return
        }

        const oldBalance = this.bot.userData.currentPoints

        this.bot.logger.info(
            this.bot.isMobile,
            'CLAIM-REWARD',
            `正在领取奖励 | offerId=${offerId} | geo=${this.bot.userData.geoLocale}`
        )

        try {
            const questUrl = URLs.rewards.quest(parentId)
            const { status, acknowledged } = await this.bot.browser.func.reportServerAction(
                actionId,
                [
                    child.hash,
                    11,
                    { offerid: offerId, isPromotional: '$undefined', timezoneOffset: this.bot.userData.timezoneOffset }
                ],
                {
                    url: questUrl,
                    referer: questUrl,
                    routerStateTree: this.bot.browser.react.questRouterStateTree(parentId)
                }
            )

            const newBalance = await this.bot.browser.func.getCurrentPoints()
            const gained = newBalance - oldBalance

            this.bot.logger.debug(
                this.bot.isMobile,
                'CLAIM-REWARD',
                `领取响应 | offerId=${offerId} | status=${status} | acknowledged=${acknowledged} | pointsGained=${gained} | currentBalance=${newBalance}`
            )

            if (acknowledged) {
                if (gained > 0) {
                    this.bot.userData.currentPoints = newBalance
                    this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + gained
                }

                this.bot.logger.info(
                    this.bot.isMobile,
                    'CLAIM-REWARD',
                    `奖励已领取 | offerId=${offerId} | status=${status} | pointsGained=${gained} | currentBalance=${newBalance}`,
                    'green'
                )
            } else {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'CLAIM-REWARD',
                    `服务器未确认领取 | offerId=${offerId} | status=${status}`
                )
            }

            await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 10000))
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'CLAIM-REWARD',
                `claimReward 出错 | offerId=${offerId} | message=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }
}
