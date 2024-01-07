import { Page } from 'playwright'

import { Workers } from '../Workers'


export class ThisOrThat extends Workers {

    async doThisOrThat(page: Page) {
        this.bot.log('THIS-OR-THAT', 'Trying to complete ThisOrThat')


        try {
            // Check if the quiz has been started or not
            const quizNotStarted = await page.waitForSelector('#rqStartQuiz', { state: 'visible', timeout: 2000 }).then(() => true).catch(() => false)
            if (quizNotStarted) {
                await page.click('#rqStartQuiz')
            } else {
                this.bot.log('THIS-OR-THAT', 'ThisOrThat has already been started, trying to finish it')
            }

            await this.bot.utils.wait(2000)

            // Solving
            const quizData = await this.bot.browser.func.getQuizData(page)
            const questionsRemaining = quizData.maxQuestions - (quizData.currentQuestionNumber - 1) // Amount of questions remaining

            for (let question = 0; question < questionsRemaining; question++) {
                // Since there's no solving logic yet, randomly guess to complete
                const buttonId = `#rqAnswerOption${Math.floor(this.bot.utils.randomNumber(0, 1))}`
                await page.click(buttonId)

                const refreshSuccess = await this.bot.browser.func.waitForQuizRefresh(page)
                if (!refreshSuccess) {
                    await page.close()
                    this.bot.log('QUIZ', 'An error occurred, refresh was unsuccessful', 'error')
                    return
                }
            }

            this.bot.log('THIS-OR-THAT', 'Completed the ThisOrThat successfully')
        } catch (error) {
            await page.close()
            this.bot.log('THIS-OR-THAT', 'An error occurred:' + error, 'error')
        }
    }

}