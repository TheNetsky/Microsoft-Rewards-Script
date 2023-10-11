import { Page } from 'puppeteer'

import { getLatestTab } from '../../browser/BrowserUtil'
import { wait } from '../../util/Utils'
import { log } from '../../util/Logger'

import { PromotionalItem, MorePromotion } from '../../interface/DashboardData'

export async function doThisOrThat(page: Page, data: PromotionalItem | MorePromotion) {
    return // Todo    
    log('THIS-OR-THAT', 'Trying to complete ThisOrThat')

    try {
        const selector = `[data-bi-id="${data.offerId}"]`

        // Wait for page to load and click to load the this or that quiz in a new tab
        await page.waitForSelector(selector, { timeout: 5000 })
        await page.click(selector)

        const thisorthatPage = await getLatestTab(page)
        await thisorthatPage.waitForNetworkIdle({ timeout: 5000 })
        await wait(2000)

        // Check if the quiz has been started or not
        const quizNotStarted = await thisorthatPage.waitForSelector('#rqStartQuiz', { visible: true, timeout: 3000 }).then(() => true).catch(() => false)
        if (quizNotStarted) {
            await thisorthatPage.click('#rqStartQuiz')
        } else {
            log('THIS-OR-THAT', 'ThisOrThat has already been started, trying to finish it')
        }

        await wait(2000)

        // Solving

        log('THIS-OR-THAT', 'Completed the ThisOrthat successfully')
    } catch (error) {
        await page.close()
        log('THIS-OR-THAT', 'An error occurred:' + error, 'error')
    }

}