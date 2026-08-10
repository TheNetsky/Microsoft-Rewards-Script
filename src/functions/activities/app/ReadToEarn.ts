import { URLs } from '../../../constants/urls'
import { BING_APP_USER_AGENT } from '../../../constants/userAgents'
import type { HttpRequestConfig } from '../../../util/Http'
import { randomBytes } from 'crypto'
import { BaseActivity } from '../BaseActivity'

export class ReadToEarn extends BaseActivity {
    public async doReadToEarn() {
        if (!this.bot.accessToken) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'READ-TO-EARN',
                'Skipping: App access token not available, this activity requires it!'
            )
            return
        }

        const delayMin = this.bot.config.searchSettings.readDelay.min
        const delayMax = this.bot.config.searchSettings.readDelay.max
        const startBalance = Number(this.bot.userData.currentPoints ?? 0)

        this.bot.logger.info(
            this.bot.isMobile,
            'READ-TO-EARN',
            `Starting Read to Earn | geo=${this.bot.userData.geoLocale} | delayRange=${delayMin}-${delayMax} | currentBalance=${startBalance}`
        )

        try {
            const jsonData = {
                amount: 1,
                id: '1',
                type: 101,
                attributes: {
                    offerid: 'ENUS_readarticle3_30points'
                },
                country: this.bot.userData.geoLocale
            }

            const articleCount = 10
            let totalGained = 0
            let articlesRead = 0
            let oldBalance = startBalance

            for (let i = 0; i < articleCount; ++i) {
                jsonData.id = randomBytes(64).toString('hex')

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'READ-TO-EARN',
                    `Submitting Read to Earn activity | article=${i + 1}/${articleCount} | id=${jsonData.id} | country=${jsonData.country}`
                )

                const request: HttpRequestConfig = {
                    url: URLs.platform.activities,
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${this.bot.accessToken}`,
                        'User-Agent': BING_APP_USER_AGENT,
                        'Content-Type': 'application/json',
                        'X-Rewards-Country': this.bot.userData.geoLocale,
                        'X-Rewards-Language': this.bot.userData.langCode,
                        'X-Rewards-ismobile': 'true'
                    },
                    data: JSON.stringify(jsonData)
                }

                const response = await this.bot.http.request<{ response?: { balance?: number } }>(request)

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'READ-TO-EARN',
                    `Received Read to Earn response | article=${i + 1}/${articleCount} | status=${response?.status ?? 'unknown'}`
                )

                const newBalance = Number(response?.data?.response?.balance ?? oldBalance)
                const gainedPoints = newBalance - oldBalance

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'READ-TO-EARN',
                    `Balance delta after article | article=${i + 1}/${articleCount} | previousBalance=${oldBalance} | currentBalance=${newBalance} | pointsGained=${gainedPoints}`
                )

                if (gainedPoints <= 0) {
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'READ-TO-EARN',
                        `No points gained, stopping Read to Earn | article=${i + 1}/${articleCount} | status=${response.status} | pointsGained=0 | currentBalance=${newBalance}`
                    )
                    break
                }

                // Update point tracking
                this.bot.userData.currentPoints = newBalance
                this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + gainedPoints
                totalGained += gainedPoints
                articlesRead = i + 1
                oldBalance = newBalance

                this.bot.logger.info(
                    this.bot.isMobile,
                    'READ-TO-EARN',
                    `Read article ${i + 1}/${articleCount} | status=${response.status} | pointsGained=${gainedPoints} | currentBalance=${newBalance}`,
                    'green'
                )

                // Wait random delay between articles
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'READ-TO-EARN',
                    `Waiting between articles | article=${i + 1}/${articleCount} | delayRange=${delayMin}-${delayMax}`
                )

                await this.bot.utils.wait(this.bot.utils.randomDelay(delayMin, delayMax))
            }

            const finalBalance = Number(this.bot.userData.currentPoints ?? startBalance)

            this.bot.logger.info(
                this.bot.isMobile,
                'READ-TO-EARN',
                `Completed Read to Earn | articlesRead=${articlesRead} | pointsGained=${totalGained} | previousBalance=${startBalance} | currentBalance=${finalBalance}`
            )
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'READ-TO-EARN',
                `Error during Read to Earn | message=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }
}
