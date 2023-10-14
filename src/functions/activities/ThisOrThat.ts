import { Page } from 'puppeteer'

import { wait } from '../../util/Utils'
import { log } from '../../util/Logger'

export async function doThisOrThat(page: Page) {
    return // Todo    
    log('THIS-OR-THAT', 'Trying to complete ThisOrThat')

    try {
        await page.waitForNetworkIdle({ timeout: 5000 })
        await wait(2000)

        // Check if the quiz has been started or not
        const quizNotStarted = await page.waitForSelector('#rqStartQuiz', { visible: true, timeout: 3000 }).then(() => true).catch(() => false)
        if (quizNotStarted) {
            await page.click('#rqStartQuiz')
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