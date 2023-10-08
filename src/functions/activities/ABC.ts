import { Page } from 'puppeteer'

import { refreshCheerio } from '../../browser/BrowserFunc'
import { getLatestTab } from '../../browser/BrowserUtil'
import { log } from '../../util/Logger'
import { randomNumber, wait } from '../../util/Utils'

import { MorePromotion, PromotionalItem } from '../../interface/DashboardData'

export async function doABC(page: Page, data: PromotionalItem | MorePromotion) {
    log('ABC', 'Trying to complete poll')

    try {
        const selector = `[data-bi-id="${data.offerId}"]`

        // Wait for page to load and click to load the quiz in a new tab
        await page.waitForSelector(selector, { timeout: 5000 })
        await page.click(selector)

        let abcPage = await getLatestTab(page)
        await wait(2000)
        let $ = await refreshCheerio(abcPage)

        // Don't loop more than 15 in case unable to solve, would lock otherwise
        const maxIterations = 15
        let i
        for (i = 0; i < maxIterations && !$('span.rw_icon').length; i++) {
            await abcPage.waitForSelector('.wk_OptionClickClass', { visible: true, timeout: 5000 })

            const answers = $('.wk_OptionClickClass')
            const answer = answers[randomNumber(0, 2)]?.attribs['id']

            await abcPage.waitForSelector(`#${answer}`, { visible: true, timeout: 5000 })

            await wait(2000)
            await abcPage.click(`#${answer}`) // Click answer

            await wait(4000)
            await abcPage.waitForSelector('div.wk_button', { visible: true, timeout: 5000 })
            await abcPage.click('div.wk_button') // Click next question button

            abcPage = await getLatestTab(abcPage)
            $ = await refreshCheerio(abcPage)
            await wait(1000)
        }

        await wait(4000)
        await abcPage.close()

        if (i === maxIterations) {
            log('ABC', 'Failed to solve quiz, exceeded max iterations of 15', 'warn')
        } else {
            log('ABC', 'Completed the ABC successfully')
        }

    } catch (error) {
        const abcPage = await getLatestTab(page)
        await abcPage.close()
        log('ABC', 'An error occurred:' + error, 'error')
    }
}

