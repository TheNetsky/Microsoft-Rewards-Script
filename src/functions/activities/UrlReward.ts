import { Page } from 'puppeteer'

import { getLatestTab } from '../../browser/BrowserUtil'
import { log } from '../../util/Logger'

import { PromotionalItem, MorePromotion } from '../../interface/DashboardData'

export async function doUrlReward(page: Page, data: PromotionalItem | MorePromotion) {
    log('URL-REWARD', 'Trying to complete UrlReward')

    try {
        const selector = `[data-bi-id="${data.offerId}"]`

        // Wait for page to load and click to load the url reward in a new tab
        await page.waitForSelector(selector, { timeout: 5000 })
        await page.click(selector)

        // After waiting, close the page
        const visitPage = await getLatestTab(page)
        await visitPage.waitForNetworkIdle({ timeout: 5000 })
        await visitPage.close()

        log('URL-REWARD', 'Completed the UrlReward successfully')
    } catch (error) {
        const visitPage = await getLatestTab(page)
        await visitPage.close()
        log('URL-REWARD', 'An error occurred:' + error, 'error')
    }

}