import { Page } from 'puppeteer'

import { log } from '../../util/Logger'
import { randomNumber, wait } from '../../util/Utils'

export async function doPoll(page: Page) {
    log('POLL', 'Trying to complete poll')

    try {
        const buttonId = `#btoption${Math.floor(randomNumber(0, 1))}`

        await page.waitForNetworkIdle({ timeout: 5000 })
        await page.waitForSelector(buttonId, { visible: true, timeout: 5000 })
        await wait(2000)

        await page.click(buttonId)

        await wait(4000)
        await page.close()

        log('POLL', 'Completed the poll successfully')
    } catch (error) {
        await page.close()
        log('POLL', 'An error occurred:' + error, 'error')
    }
}