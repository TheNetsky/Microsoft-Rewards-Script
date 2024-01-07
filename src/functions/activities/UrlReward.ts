import { Page } from 'playwright'

import { Workers } from '../Workers'


export class UrlReward extends Workers {

    async doUrlReward(page: Page) {
        this.bot.log('URL-REWARD', 'Trying to complete UrlReward')

        try {
            this.bot.utils.wait(2000)

            await page.close()

            this.bot.log('URL-REWARD', 'Completed the UrlReward successfully')
        } catch (error) {
            await page.close()
            this.bot.log('URL-REWARD', 'An error occurred:' + error, 'error')
        }
    }

}