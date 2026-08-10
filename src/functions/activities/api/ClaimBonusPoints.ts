import { BaseActivity } from '../BaseActivity'

export class ClaimBonusPoints extends BaseActivity {
    public async claimBonusPoints() {
        const actionId = this.bot.nextActions.reportClaimAllPoints
        if (!actionId) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'CLAIM-BONUS-POINTS',
                'Skipping: "reportClaimAllPoints" action id not discovered in bundle'
            )
            return
        }

        const oldBalance = this.bot.userData.currentPoints

        this.bot.logger.info(
            this.bot.isMobile,
            'CLAIM-BONUS-POINTS',
            `Starting ClaimBonusPoints | geo=${this.bot.userData.geoLocale} | currentBalance=${oldBalance}`
        )

        try {
            const { status, acknowledged } = await this.bot.browser.func.reportServerAction(actionId, [])

            const newBalance = await this.bot.browser.func.getCurrentPoints()
            const gainedPoints = newBalance - oldBalance

            this.bot.logger.debug(
                this.bot.isMobile,
                'CLAIM-BONUS-POINTS',
                `Response | status=${status} | acknowledged=${acknowledged} | previousBalance=${oldBalance} | currentBalance=${newBalance} | pointsGained=${gainedPoints}`
            )

            if (acknowledged) {
                if (gainedPoints > 0) {
                    this.bot.userData.currentPoints = newBalance
                    this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + gainedPoints
                }

                this.bot.logger.info(
                    this.bot.isMobile,
                    'CLAIM-BONUS-POINTS',
                    `Completed ClaimBonusPoints | acknowledged=true | pointsGained=${gainedPoints} | currentBalance=${newBalance}`,
                    'green'
                )
            } else {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'CLAIM-BONUS-POINTS',
                    `Nothing claimed | status=${status} | pointsGained=0 | currentBalance=${newBalance}`
                )
            }

            await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 10000))
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'CLAIM-BONUS-POINTS',
                `Error in claimBonusPoints | message=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }
}
