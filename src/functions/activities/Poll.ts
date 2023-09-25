import { Page } from 'puppeteer'
import { MorePromotion, PromotionalItem } from '../../interface/DashboardData'
import { getLatestTab } from '../../BrowserUtil'
import { log } from '../../util/Logger'
import { wait } from '../../util/Utils'

export async function doPoll(page: Page, data: PromotionalItem | MorePromotion) {
    log('POLL', 'Trying to complete poll')

    try {
        const selector = `[data-bi-id="${data.offerId}"]`

        // Wait for page to load and click to load the quiz in a new tab
        await page.waitForSelector(selector, { timeout: 5000 })
        await page.click(selector)

        const pollPage = await getLatestTab(page)

        const buttonId = `#btoption${Math.floor(Math.random() * 2)}`

        await pollPage.waitForSelector(buttonId)
        await pollPage.click(buttonId)
        
        await wait(2000)
        await pollPage.close()

        log('POLL', 'Completed the poll successfully')
    } catch (error) {
        log('POLL', 'An error occurred:' + error, 'error')
    }
}