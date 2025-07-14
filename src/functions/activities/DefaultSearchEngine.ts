import { Page } from 'rebrowser-playwright'

import { Workers } from '../Workers'
import { DashboardData } from '../../interface/DashboardData'


export class DefaultSearchEngine extends Workers {

    async doEngineReward(page: Page, data: DashboardData) {

        try {
            if (
                data.userStatus.levelInfo.hvaLevelUpActivityDefaultSearchEngineDaysMax_V2 == null ||
                data.userStatus.levelInfo.hvaLevelUpActivityDefaultSearchEngineDays_V2 == null
            ) {
                await page.close()
                return
            }
            const max = parseInt(data.userStatus.levelInfo.hvaLevelUpActivityDefaultSearchEngineDaysMax_V2)
            const progress = parseInt(data.userStatus.levelInfo.hvaLevelUpActivityDefaultSearchEngineDays_V2)
            this.bot.log(this.bot.isMobile, 'ENGINE-REWARD', 'Trying to complete default Engine Search')
            await page.goto(" https://www.bing.com/search?q=Bing&PC=U316&FORM=CHROMN")

            await this.bot.utils.wait(2000)

            const nData = await this.bot.browser.func.getDashboardData()
            if (nData.userStatus.levelInfo.hvaLevelUpActivityDefaultSearchEngineDays_V2 != null) {
                const nProgress = parseInt(nData.userStatus.levelInfo.hvaLevelUpActivityDefaultSearchEngineDays_V2)
                if (nProgress > progress) {
                    this.bot.log(this.bot.isMobile, 'ENGINE-REWARD', `Completed the default Engine Search successfully | ${nProgress}/${max} days`)
                } else  {
                    this.bot.log(this.bot.isMobile, 'ENGINE-REWARD', 'Default Engine Search was unsuccessfully')
                }
            }

            await page.close()

        } catch (error) {
            await page.close()
            this.bot.log(this.bot.isMobile, 'ENGINE-REWARD', 'An error occurred:' + error, 'error')
        }
    }

}
