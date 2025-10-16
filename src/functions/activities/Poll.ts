import { Page } from 'rebrowser-playwright'

import { Workers } from '../Workers'
import { TIMEOUTS } from '../../constants'


export class Poll extends Workers {

    async doPoll(page: Page) {
        this.bot.log(this.bot.isMobile, 'POLL', 'Trying to complete poll')

        try {
            const buttonId = `#btoption${Math.floor(this.bot.utils.randomNumber(0, 1))}`

            await page.waitForSelector(buttonId, { state: 'visible', timeout: TIMEOUTS.DASHBOARD_WAIT }).catch((e) => {
                this.bot.log(this.bot.isMobile, 'POLL', `Could not find poll button: ${e}`, 'warn')
            })
            await this.bot.utils.wait(TIMEOUTS.MEDIUM_LONG)

            await page.click(buttonId)

            await this.bot.utils.wait(TIMEOUTS.LONG + 1000)
            await page.close()

            this.bot.log(this.bot.isMobile, 'POLL', 'Completed the poll successfully')
        } catch (error) {
            await page.close()
            this.bot.log(this.bot.isMobile, 'POLL', 'An error occurred:' + error, 'error')
        }
    }

}