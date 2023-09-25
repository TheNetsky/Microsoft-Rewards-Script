import { Page } from 'puppeteer'
import fs from 'fs'
import path from 'path'

import { baseURL, sessionPath } from './config.json'
import { wait } from './util/Utils'
import { tryDismissAllMessages, tryDismissCookieBanner } from './BrowserUtil'
import { log } from './util/Logger'

import { Counters, DashboardData } from './interface/DashboardData'
import { QuizData } from './interface/QuizData'

export async function goHome(page: Page): Promise<void> {

    try {
        const targetUrl = new URL(baseURL)

        await page.goto(baseURL)

        const maxIterations = 5 // Maximum iterations set to 5

        for (let iteration = 1; iteration <= maxIterations; iteration++) {
            await wait(3000)
            await tryDismissCookieBanner(page)

            try {
                // If activities are found, exit the loop
                await page.waitForSelector('#more-activities', { timeout: 1000 })
                break

            } catch (error) {
                // Continue if element is not found
            }

            const currentUrl = new URL(page.url())

            if (currentUrl.hostname !== targetUrl.hostname) {
                await tryDismissAllMessages(page)

                await wait(2000)
                await page.goto(baseURL)
            }

            await wait(5000)
            log('MAIN', 'Visited homepage successfully')
        }

    } catch (error) {
        console.error('An error occurred:', error)
    }
}

export async function getDashboardData(page: Page): Promise<DashboardData> {
    await page.reload({ waitUntil: 'networkidle2' })

    const scriptContent = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll('script'))
        const targetScript = scripts.find(script => script.innerText.includes('var dashboard'))

        if (targetScript) {
            return targetScript.innerText
        } else {
            throw new Error('Script containing dashboard data not found')
        }
    })

    // Extract the dashboard object from the script content
    const dashboardData = await page.evaluate(scriptContent => {
        // Extract the dashboard object using regex
        const regex = /var dashboard = (\{.*?\});/s
        const match = regex.exec(scriptContent)

        if (match && match[1]) {
            return JSON.parse(match[1])
        } else {
            throw new Error('Dashboard data not found in the script')
        }
    }, scriptContent)

    return dashboardData
}

export async function getSearchPoints(page: Page): Promise<Counters> {
    const dashboardData = await getDashboardData(page)

    return dashboardData.userStatus.counters
}

export async function getQuizData(page: Page): Promise<QuizData> {
    const scriptContent = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll('script'))
        const targetScript = scripts.find(script => script.innerText.includes('_w.rewardsQuizRenderInfo'))

        if (targetScript) {
            return targetScript.innerText
        } else {
            throw new Error('Script containing quiz data not found')
        }
    })

    const quizData = await page.evaluate(scriptContent => {
        // Extract the dashboard object using regex
        const regex = /_w\.rewardsQuizRenderInfo\s*=\s*({.*?});/s
        const match = regex.exec(scriptContent)

        if (match && match[1]) {
            return JSON.parse(match[1])
        } else {
            throw new Error('Dashboard data not found in the script')
        }
    }, scriptContent)

    return quizData
}

export async function loadSesion(email: string): Promise<string> {
    const sessionDir = path.join(__dirname, sessionPath, email)

    try {
        // Create session dir
        if (!fs.existsSync(sessionDir)) {
            await fs.promises.mkdir(sessionDir, { recursive: true })
        }

        return sessionDir

    } catch (error) {
        throw new Error(error as string)
    }
}