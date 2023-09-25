import { Page } from 'puppeteer'
import { MorePromotion, PromotionalItem } from '../../interface/DashboardData'
import { getQuizData } from '../../BrowserFunc'
import { wait } from '../../util/Utils'
import { getLatestTab } from '../../BrowserUtil'
import { log } from '../../util/Logger'

export async function doQuiz(page: Page, data: PromotionalItem | MorePromotion) {
    log('QUIZ', 'Trying to complete quiz')

    try {
        const selector = `[data-bi-id="${data.offerId}"]`

        // Wait for page to load and click to load the quiz in a new tab
        await page.waitForSelector(selector, { timeout: 5000 })
        await page.click(selector)

        const quizPage = await getLatestTab(page)

        // Check if the quiz has been started or not
        const quizNotStarted = await quizPage.waitForSelector('#rqStartQuiz', { visible: true, timeout: 3000 }).then(() => true).catch(() => false)
        if (quizNotStarted) {
            await quizPage.click('#rqStartQuiz')
        } else {
            log('QUIZ', 'Quiz has already been started, trying to finish it')
        }

        await wait(2000)

        const quizData = await getQuizData(quizPage)

        const questionsRemaining = quizData.maxQuestions - quizData.CorrectlyAnsweredQuestionCount // Amount of questions remaining

        // All questions
        for (let question = 0; question < questionsRemaining; question++) {

            if (quizData.numberOfOptions === 8) {
                const answers: string[] = []

                for (let i = 0; i < quizData.numberOfOptions; i++) {
                    const answerSelector = await quizPage.waitForSelector(`#rqAnswerOption${i}`)
                    const answerAttribute = await answerSelector?.evaluate(el => el.getAttribute('iscorrectoption'))
                    await wait(500)

                    if (answerAttribute && answerAttribute.toLowerCase() === 'true') {
                        answers.push(`#rqAnswerOption${i}`)
                    }
                }

                for (const answer of answers) {
                    // Click the answer on page
                    await quizPage.click(answer)
                    await wait(1500)

                    const refreshSuccess = await waitForQuizRefresh(quizPage)
                    if (!refreshSuccess) {
                        await quizPage.close()
                        log('QUIZ', 'An error occurred, refresh was unsuccessful', 'error')
                        return
                    }
                }

                // Other type quiz
            } else if ([2, 3, 4].includes(quizData.numberOfOptions)) {
                const correctOption = quizData.correctAnswer

                for (let i = 0; i < quizData.numberOfOptions; i++) {

                    const answerSelector = await quizPage.waitForSelector(`#rqAnswerOption${i}`)
                    const dataOption = await answerSelector?.evaluate(el => el.getAttribute('data-option'))

                    if (dataOption === correctOption) {
                        // Click the answer on page
                        await quizPage.click(`#rqAnswerOption${i}`)
                        await wait(1500)

                        const refreshSuccess = await waitForQuizRefresh(quizPage)
                        if (!refreshSuccess) {
                            await quizPage.close()
                            log('QUIZ', 'An error occurred, refresh was unsuccessful', 'error')
                            return
                        }
                    }
                }

            }

        }

        // Done with
        await quizPage.close()
        log('QUIZ', 'Completed the quiz successfully')
    } catch (error) {
        const quizPage = await getLatestTab(page)
        await quizPage.close()
        log('QUIZ', 'An error occurred:' + error, 'error')
    }

}

async function waitForQuizRefresh(page: Page) {
    try {
        await page.waitForSelector('#rqHeaderCredits', { timeout: 5000 })
        return true
    } catch (error) {
        log('QUIZ-REFRESH', 'An error occurred:' + error, 'error')
        return false
    }
}

async function checkQuizCompleted(page: Page) {
    try {
        await page.waitForSelector('#quizCompleteContainer', { timeout: 1000 })
        return true
    } catch (error) {
        return false
    }
}
checkQuizCompleted