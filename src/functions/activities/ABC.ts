import { Page } from 'puppeteer'

import { refreshCheerio } from '../../browser/BrowserFunc'
import { getLatestTab } from '../../browser/BrowserUtil'
import { log } from '../../util/Logger'
import { randomNumber, wait } from '../../util/Utils'

export async function doABC(page: Page) {
    log('ABC', 'Trying to complete poll')

    try {
        await wait(2000)
        let $ = await refreshCheerio(page)

        // Don't loop more than 15 in case unable to solve, would lock otherwise
        const maxIterations = 15
        let i
        for (i = 0; i < maxIterations && !$('span.rw_icon').length; i++) {
            await page.waitForSelector('.wk_OptionClickClass', { visible: true, timeout: 5000 })

            const answers = $('.wk_OptionClickClass')
            const answer = answers[randomNumber(0, 2)]?.attribs['id']

            await page.waitForSelector(`#${answer}`, { visible: true, timeout: 5000 })

            await wait(2000)
            await page.click(`#${answer}`) // Click answer

            await wait(4000)
            await page.waitForSelector('div.wk_button', { visible: true, timeout: 5000 })
            await page.click('div.wk_button') // Click next question button

            page = await getLatestTab(page)
            $ = await refreshCheerio(page)
            await wait(1000)
        }

        await wait(4000)
        await page.close()

        if (i === maxIterations) {
            log('ABC', 'Failed to solve quiz, exceeded max iterations of 15', 'warn')
        } else {
            log('ABC', 'Completed the ABC successfully')
        }

    } catch (error) {
        await page.close()
        log('ABC', 'An error occurred:' + error, 'error')
    }
}

