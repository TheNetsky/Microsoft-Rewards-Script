import axios from 'axios'
import { randomBytes } from 'crypto'

import { Workers } from '../Workers'

import { DashboardData } from '../../interface/DashboardData'


export class ReadToEarn extends Workers {
    public async doReadToEarn(accessToken: string, data: DashboardData) {
        this.bot.log('READ-TO-EARN', 'Starting Read to Earn')

        try {
            let geoLocale = data.userProfile.attributes.country
            geoLocale = (this.bot.config.searchSettings.useGeoLocaleQueries && geoLocale.length === 2) ? geoLocale.toLowerCase() : 'us'

            const userDataRequest = {
                url: 'https://prod.rewardsplatform.microsoft.com/dapi/me',
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'X-Rewards-Country': geoLocale,
                    'X-Rewards-Language': 'en'
                }
            }
            const userDataResponse = await axios(userDataRequest)
            const userData = (await userDataResponse.data).response
            let userBalance = userData.balance

            const jsonData = {
                amount: 1,
                country: geoLocale,
                id: '1',
                type: 101,
                attributes: {
                    offerid: 'ENUS_readarticle3_30points'
                }
            }

            const articleCount = 10
            for (let i = 0; i < articleCount; ++i) {
                jsonData.id = randomBytes(64).toString('hex')
                const claimRequest = {
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

                const claimResponse = await axios(claimRequest)
                const newBalance = (await claimResponse.data).response.balance

                if (newBalance == userBalance) {
                    this.bot.log('READ-TO-EARN', 'Read all available articles')
                    break
                } else {
                    this.bot.log('READ-TO-EARN', `Read article ${i + 1} of ${articleCount} max | Gained ${newBalance - userBalance} Points`)
                    userBalance = newBalance
                    await this.bot.utils.wait(Math.floor(this.bot.utils.randomNumber(this.bot.config.searchSettings.searchDelay.min, this.bot.config.searchSettings.searchDelay.max)))
                }
            }

            this.bot.log('READ-TO-EARN', 'Completed Read to Earn')
        } catch (error) {
            this.bot.log('READ-TO-EARN', 'An error occurred:' + error, 'error')
        }
    }
}