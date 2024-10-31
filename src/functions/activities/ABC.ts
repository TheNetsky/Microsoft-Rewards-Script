import { Page } from 'rebrowser-playwright'

import { Workers } from '../Workers'


export class ABC extends Workers {

    async doABC(page: Page) {
        this.bot.log(this.bot.isMobile, 'ABC', 'Trying to complete poll')

        try {
            let $ = await this.bot.browser.func.refreshCheerio(page)

            // Don't loop more than 15 in case unable to solve, would lock otherwise
            const maxIterations = 15
            let i
            for (i = 0; i < maxIterations && !$('span.rw_icon').length; i++) {
                await page.waitForSelector('.wk_OptionClickClass', { state: 'visible', timeout: 10_000 })

                const answers = $('.wk_OptionClickClass')
                const answer = answers[this.bot.utils.randomNumber(0, 2)]?.attribs['id']

                await page.waitForSelector(`#${answer}`, { state: 'visible', timeout: 10_000 })

                await this.bot.utils.wait(2000)
                await page.click(`#${answer}`) // Click answer

                await this.bot.utils.wait(4000)
                await page.waitForSelector('div.wk_button', { state: 'visible', timeout: 10_000 })
                await page.click('div.wk_button') // Click next question button

                page = await this.bot.browser.utils.getLatestTab(page)
                $ = await this.bot.browser.func.refreshCheerio(page)
                await this.bot.utils.wait(1000)
            }

            await this.bot.utils.wait(4000)
            await page.close()

            if (i === maxIterations) {
                this.bot.log(this.bot.isMobile, 'ABC', 'Failed to solve quiz, exceeded max iterations of 15', 'warn')
            } else {
                this.bot.log(this.bot.isMobile, 'ABC', 'Completed the ABC successfully')
            }

        } catch (error) {
            await page.close()
            this.bot.log(this.bot.isMobile, 'ABC', 'An error occurred:' + error, 'error')
        }
    }

}