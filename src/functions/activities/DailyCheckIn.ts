import { randomBytes } from 'crypto'
import { AxiosRequestConfig } from 'axios'

import { Workers } from '../Workers'

import { DashboardData } from '../../interface/DashboardData'


export class DailyCheckIn extends Workers {
    public async doDailyCheckIn(accessToken: string, data: DashboardData) {
        this.bot.log(this.bot.isMobile, 'DAILY-CHECK-IN', 'Starting Daily Check In')

        try {
            let geoLocale = data.userProfile.attributes.country
            geoLocale = (this.bot.config.searchSettings.useGeoLocaleQueries && geoLocale.length === 2) ? geoLocale.toLowerCase() : 'us'

            const jsonData = {
                amount: 1,
                country: geoLocale,
                id: randomBytes(64).toString('hex'),
                type: 101,
                attributes: {
                    offerid: 'Gamification_Sapphire_DailyCheckIn'
                }
            }

            const claimRequest: AxiosRequestConfig = {
                url: 'https://prod.rewardsplatform.microsoft.com/dapi/me/activities',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'X-Rewards-Country': geoLocale,
                    'X-Rewards-Language': 'en'
                },
                data: JSON.stringify(jsonData)
            }

            const claimResponse = await this.bot.axios.request(claimRequest)
            const claimedPoint = parseInt((await claimResponse.data).response?.activity?.p) ?? 0

            this.bot.log(this.bot.isMobile, 'DAILY-CHECK-IN', claimedPoint > 0 ? `Claimed ${claimedPoint} points` : 'Already claimed today')
        } catch (error) {
            this.bot.log(this.bot.isMobile, 'DAILY-CHECK-IN', 'An error occurred:' + error, 'error')
        }
    }

}