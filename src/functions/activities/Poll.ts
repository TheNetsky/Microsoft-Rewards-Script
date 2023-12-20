import { Page } from 'puppeteer'

import { Workers } from '../Workers'


export class Poll extends Workers {

    async doPoll(page: Page) {
        this.bot.log('POLL', 'Trying to complete poll')

        try {
            const buttonId = `#btoption${Math.floor(this.bot.utils.randomNumber(0, 1))}`

            await page.waitForSelector(buttonId, { visible: true, timeout: 10_000 }).catch(() => { }) // We're gonna click regardless or not
            await this.bot.utils.wait(2000)

            await page.click(buttonId)

            await this.bot.utils.wait(4000)
            await page.close()

            this.bot.log('POLL', 'Completed the poll successfully')
        } catch (error) {
            await page.close()
            this.bot.log('POLL', 'An error occurred:' + error, 'error')
        }
    }

}