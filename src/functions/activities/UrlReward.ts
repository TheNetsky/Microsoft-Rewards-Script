import { Page } from 'rebrowser-playwright'

import { Workers } from '../Workers'


export class UrlReward extends Workers {

    async doUrlReward(page: Page) {
        this.bot.log(this.bot.isMobile, 'URL-REWARD', 'Trying to complete UrlReward')

        try {
            this.bot.utils.wait(2000)

            await page.close()

            this.bot.log(this.bot.isMobile, 'URL-REWARD', 'Completed the UrlReward successfully')
        } catch (error) {
            await page.close()
            this.bot.log(this.bot.isMobile, 'URL-REWARD', 'An error occurred:' + error, 'error')
        }
    }

}