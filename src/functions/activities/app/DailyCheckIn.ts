import { URLs } from '../../../constants/urls'
import type { HttpRequestConfig } from '../../../util/Http'
import { randomUUID } from 'crypto'
import { BaseActivity } from '../BaseActivity'

export class DailyCheckIn extends BaseActivity {
    private gainedPoints: number = 0

    private oldBalance: number = this.bot.userData.currentPoints

    public async doDailyCheckIn() {
        if (!this.bot.accessToken) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'DAILY-CHECK-IN',
                'Skipping: App access token not available, this activity requires it!'
            )
            return
        }

        this.oldBalance = Number(this.bot.userData.currentPoints ?? 0)

        this.bot.logger.info(
            this.bot.isMobile,
            'DAILY-CHECK-IN',
            `Starting Daily Check-In | geo=${this.bot.userData.geoLocale} | currentBalance=${this.oldBalance}`
        )

        try {
            const response = await this.submitDaily()

            this.bot.logger.debug(
                this.bot.isMobile,
                'DAILY-CHECK-IN',
                `Received Daily Check-In response | status=${response?.status ?? 'unknown'}`
            )

            const newBalance = Number(response?.data?.response?.balance ?? this.oldBalance)
            this.gainedPoints = newBalance - this.oldBalance

            this.bot.logger.debug(
                this.bot.isMobile,
                'DAILY-CHECK-IN',
                `Balance delta after Daily Check-In | type=103 | previousBalance=${this.oldBalance} | currentBalance=${newBalance} | pointsGained=${this.gainedPoints}`
            )

            if (this.gainedPoints > 0) {
                this.bot.userData.currentPoints = newBalance
                this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + this.gainedPoints

                this.bot.logger.info(
                    this.bot.isMobile,
                    'DAILY-CHECK-IN',
                    `Completed Daily Check-In | type=103 | pointsGained=${this.gainedPoints} | currentBalance=${newBalance}`,
                    'green'
                )
            } else {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'DAILY-CHECK-IN',
                    `Daily Check-In completed but no points gained | type=103 | pointsGained=0 | currentBalance=${newBalance}`
                )
            }
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'DAILY-CHECK-IN',
                `Error during Daily Check-In | message=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async submitDaily() {
        try {
            const jsonData = {
                risk_context: {},
                type: 103,
                channel: 'SAIOS',
                attributes: {},
                id: randomUUID(),
                amount: 1,
                country: this.bot.userData.geoLocale
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'DAILY-CHECK-IN',
                `Preparing Daily Check-In payload | type=${jsonData.type} | id=${jsonData.id} | amount=${jsonData.amount} | country=${jsonData.country}`
            )

            const request: HttpRequestConfig = {
                url: URLs.platform.activities,
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.bot.accessToken}`,
                    'Content-Type': 'application/json',
                    Accept: '*/*',
                    'User-Agent':
                        'Mozilla/5.0 (iPad; CPU iPad OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/605.1.15 BingSapphire/33.4.440603001',
                    'X-Rewards-AppId': 'SAIOS/33.4.440603001',
                    'X-Rewards-PartnerId': 'startapp',
                    'X-Rewards-Country': this.bot.userData.geoLocale,
                    'X-Rewards-Language': this.bot.userData.langCode,
                    'X-Rewards-Flights': 'rwgobig',
                    'X-Rewards-IsMobile': 'true'
                },
                data: JSON.stringify(jsonData)
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'DAILY-CHECK-IN',
                `Sending Daily Check-In request | type=${jsonData.type} | url=${request.url}`
            )

            return this.bot.http.request<{ response?: { balance?: number } }>(request)
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'DAILY-CHECK-IN',
                `Error in submitDaily | message=${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }
}
