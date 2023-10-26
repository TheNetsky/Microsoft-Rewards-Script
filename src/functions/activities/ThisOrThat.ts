import { Page } from 'puppeteer'

import { Workers } from '../Workers'


export class ThisOrThat extends Workers {

    async doThisOrThat(page: Page) {
        this.bot.log('THIS-OR-THAT', 'Trying to complete ThisOrThat')

        try {
            // Check if the quiz has been started or not
            const quizNotStarted = await page.waitForSelector('#rqStartQuiz', { visible: true, timeout: 3000 }).then(() => true).catch(() => false)
            if (quizNotStarted) {
                await page.click('#rqStartQuiz')
            } else {
                this.bot.log('THIS-OR-THAT', 'ThisOrThat has already been started, trying to finish it')
            }

            await this.bot.utils.wait(2000)

            // Solving
            const quizData = await this.bot.browser.func.getQuizData(page)
            quizData // correctAnswer property is always null?

            this.bot.log('THIS-OR-THAT', 'Completed the ThisOrthat successfully')
        } catch (error) {
            await page.close()
            this.bot.log('THIS-OR-THAT', 'An error occurred:' + error, 'error')
        }
    }

}