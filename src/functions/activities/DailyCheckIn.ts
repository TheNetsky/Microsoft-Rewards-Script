import { Workers } from "../Workers";
import { DashboardData } from "../../interface/DashboardData";
import axios from "axios";
import * as crypto from 'crypto';

export class DailyCheckIn extends Workers {
    public async doDailyCheckIn(accessToken: string, data: DashboardData) {
        this.bot.log("DAILY-CHECK-IN", "Starting Daily Check In");

        let geoLocale = data.userProfile.attributes.country;
        geoLocale = (this.bot.config.searchSettings.useGeoLocaleQueries && geoLocale.length === 2) ? geoLocale.toLowerCase() : 'us'

        let jsonData = {
            amount: 1,
            country: geoLocale,
            id: crypto.randomBytes(64).toString('hex'),
            type: 101,
            attributes: {
                offerid: 'Gamification_Sapphire_DailyCheckIn'
            }
        }

        const claimRequest = {
            url: 'https://prod.rewardsplatform.microsoft.com/dapi/me/activities',
            method: 'POST',
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
                "X-Rewards-Country": geoLocale,
                "X-Rewards-Language": "en"
            },
            data: JSON.stringify(jsonData)
        }

        const claimResponse = await axios(claimRequest);
        let claimedPoint = parseInt((await claimResponse.data).response.activity.p);

        this.bot.log("DAILY-CHECK-IN", claimedPoint > 0 ? `Claimed ${claimedPoint} points` : "Already claimed today");
    }
}