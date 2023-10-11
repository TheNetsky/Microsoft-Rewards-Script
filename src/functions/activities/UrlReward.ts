import { Page } from 'puppeteer'

import { wait } from '../../util/Utils'
import { log } from '../../util/Logger'

export async function doUrlReward(page: Page) {
    log('URL-REWARD', 'Trying to complete UrlReward')

    try {
        // After waiting, close the page
        await page.waitForNetworkIdle({ timeout: 10_000 })
        await wait(2000)
        await page.close()

        log('URL-REWARD', 'Completed the UrlReward successfully')
    } catch (error) {
        await page.close()
        log('URL-REWARD', 'An error occurred:' + error, 'error')
    }

}