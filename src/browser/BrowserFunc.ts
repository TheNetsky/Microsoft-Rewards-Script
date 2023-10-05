import { Page } from 'puppeteer'
import fs from 'fs'
import path from 'path'
import { load } from 'cheerio'

import { tryDismissAllMessages, tryDismissCookieBanner } from './BrowserUtil'
import { getFormattedDate, wait } from './../util/Utils'
import { log } from './../util/Logger'

import { Counters, DashboardData } from './../interface/DashboardData'
import { QuizData } from './../interface/QuizData'

import { baseURL, sessionPath } from './../config.json'

export async function goHome(page: Page): Promise<boolean> {

    try {
        const dashboardURL = new URL(baseURL)

        await page.goto(baseURL)

        const maxIterations = 5 // Maximum iterations set to 5

        for (let iteration = 1; iteration <= maxIterations; iteration++) {
            await wait(3000)
            await tryDismissCookieBanner(page)

            // Check if account is suspended
            const isSuspended = await page.waitForSelector('#suspendedAccountHeader', { visible: true, timeout: 3000 }).then(() => true).catch(() => false)
            if (isSuspended) {
                log('GO-HOME', 'This account is suspended!')
                throw new Error('Account has been suspended!')
            }

            try {
                // If activities are found, exit the loop
                await page.waitForSelector('#more-activities', { timeout: 1000 })
                break

            } catch (error) {
                // Continue if element is not found
            }

            const currentURL = new URL(page.url())

            if (currentURL.hostname !== dashboardURL.hostname) {
                await tryDismissAllMessages(page)

                await wait(2000)
                await page.goto(baseURL)
            }

            await wait(5000)
            log('GO-HOME', 'Visited homepage successfully')
        }

    } catch (error) {
        console.error('An error occurred:', error)
        return false
    }

    return true
}

export async function getDashboardData(page: Page): Promise<DashboardData> {
    const dashboardURL = new URL(baseURL)
    const currentURL = new URL(page.url())

    // Should never happen since tasks are opened in a new tab!
    if (currentURL.hostname !== dashboardURL.hostname) {
        log('DASHBOARD-DATA', 'Provided page did not equal dashboard page, redirecting to dashboard page')
        await goHome(page)
    }

    // Reload the page to get new data
    await page.reload({ waitUntil: 'networkidle2' })

    const scriptContent = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll('script'))
        const targetScript = scripts.find(script => script.innerText.includes('var dashboard'))

        if (targetScript) {
            return targetScript.innerText
        } else {
            throw log('GET-DASHBOARD-DATA', 'Script containing dashboard data not found', 'error')
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
            throw log('GET-DASHBOARD-DATA', 'Dashboard data not found within script', 'error')
        }
    }, scriptContent)

    return dashboardData
}

export async function getQuizData(page: Page): Promise<QuizData> {
    try {
        const html = await page.content()
        const $ = load(html)

        const scriptContent = $('script').filter((index, element) => {
            return $(element).text().includes('_w.rewardsQuizRenderInfo')
        }).text()

        if (scriptContent) {
            const regex = /_w\.rewardsQuizRenderInfo\s*=\s*({.*?});/s
            const match = regex.exec(scriptContent)

            if (match && match[1]) {
                const quizData = JSON.parse(match[1])
                return quizData
            } else {
                throw log('GET-QUIZ-DATA', 'Quiz data not found within script', 'error')
            }
        } else {
            throw log('GET-QUIZ-DATA', 'Script containing quiz data not found', 'error')
        }

    } catch (error) {
        throw log('GET-QUIZ-DATA', 'An error occurred:' + error, 'error')
    }

}

export async function getSearchPoints(page: Page): Promise<Counters> {
    const dashboardData = await getDashboardData(page) // Always fetch newest data

    return dashboardData.userStatus.counters
}

export async function getEarnablePoints(data: DashboardData, page: null | Page = null): Promise<number> {
    try {
        // Fetch new data if page is provided
        if (page) {
            data = await getDashboardData(page)
        }

        // These only include the points from tasks that the script can complete!
        let totalEarnablePoints = 0

        // Desktop Search Points
        data.userStatus.counters.pcSearch.forEach(x => totalEarnablePoints += (x.pointProgressMax - x.pointProgress))

        // Mobile Search Points
        if (data.userStatus.counters.mobileSearch?.length) {
            data.userStatus.counters.mobileSearch.forEach(x => totalEarnablePoints += (x.pointProgressMax - x.pointProgress))
        }

        // Daily Set
        data.dailySetPromotions[getFormattedDate()]?.forEach(x => totalEarnablePoints += (x.pointProgressMax - x.pointProgress))

        // More Promotions
        data.morePromotions.forEach(x => {
            // Only count points from supported activities
            if (['quiz', 'urlreward'].includes(x.activityType)) {
                totalEarnablePoints += (x.pointProgressMax - x.pointProgress)
            }
        })

        return totalEarnablePoints
    } catch (error) {
        throw log('GET-EARNABLE-POINTS', 'An error occurred:' + error, 'error')
    }
}

export async function getCurrentPoints(data: DashboardData, page: null | Page = null): Promise<number> {
    try {
        // Fetch new data if page is provided
        if (page) {
            data = await getDashboardData(page)
        }

        return data.userStatus.availablePoints
    } catch (error) {
        throw log('GET-CURRENT-POINTS', 'An error occurred:' + error, 'error')
    }
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

export async function waitForQuizRefresh(page: Page) {
    try {
        await page.waitForSelector('#rqHeaderCredits', { timeout: 5000 })
        return true
    } catch (error) {
        log('QUIZ-REFRESH', 'An error occurred:' + error, 'error')
        return false
    }
}

export async function checkQuizCompleted(page: Page) {
    try {
        await page.waitForSelector('#quizCompleteContainer', { timeout: 1000 })
        return true
    } catch (error) {
        return false
    }
}