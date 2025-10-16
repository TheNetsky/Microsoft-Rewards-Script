import { Page } from 'rebrowser-playwright'

import { Workers } from '../Workers'
import { RETRY_LIMITS, TIMEOUTS } from '../../constants'


export class ABC extends Workers {

    async doABC(page: Page) {
        this.bot.log(this.bot.isMobile, 'ABC', 'Trying to complete poll')

        try {
            let $ = await this.bot.browser.func.loadInCheerio(page)

            let i
            for (i = 0; i < RETRY_LIMITS.ABC_MAX && !$('span.rw_icon').length; i++) {
                await page.waitForSelector('.wk_OptionClickClass', { state: 'visible', timeout: TIMEOUTS.DASHBOARD_WAIT })

                const answers = $('.wk_OptionClickClass')
                const answer = answers[this.bot.utils.randomNumber(0, 2)]?.attribs['id']

                await page.waitForSelector(`#${answer}`, { state: 'visible', timeout: TIMEOUTS.DASHBOARD_WAIT })

                await this.bot.utils.wait(TIMEOUTS.MEDIUM_LONG)
                await page.click(`#${answer}`) // Click answer

                await this.bot.utils.wait(TIMEOUTS.LONG + 1000)
                await page.waitForSelector('div.wk_button', { state: 'visible', timeout: TIMEOUTS.DASHBOARD_WAIT })
                await page.click('div.wk_button') // Click next question button

                page = await this.bot.browser.utils.getLatestTab(page)
                $ = await this.bot.browser.func.loadInCheerio(page)
                await this.bot.utils.wait(TIMEOUTS.MEDIUM)
            }

            await this.bot.utils.wait(TIMEOUTS.LONG + 1000)
            await page.close()

            if (i === RETRY_LIMITS.ABC_MAX) {
                this.bot.log(this.bot.isMobile, 'ABC', `Failed to solve quiz, exceeded max iterations of ${RETRY_LIMITS.ABC_MAX}`, 'warn')
            } else {
                this.bot.log(this.bot.isMobile, 'ABC', 'Completed the ABC successfully')
            }

        } catch (error) {
            await page.close()
            this.bot.log(this.bot.isMobile, 'ABC', 'An error occurred:' + error, 'error')
        }
    }

}