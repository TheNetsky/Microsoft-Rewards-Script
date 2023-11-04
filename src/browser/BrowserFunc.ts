import { Page } from 'puppeteer'
import { CheerioAPI, load } from 'cheerio'
import fs from 'fs'
import path from 'path'

import { MicrosoftRewardsBot } from '../index'

import { Counters, DashboardData, MorePromotion, PromotionalItem } from './../interface/DashboardData'
import { QuizData } from './../interface/QuizData'


export default class BrowserFunc {
    private bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    async goHome(page: Page): Promise<boolean> {

        try {
            const dashboardURL = new URL(this.bot.config.baseURL)

            await page.goto(this.bot.config.baseURL)

            const maxIterations = 5 // Maximum iterations set to 5

            for (let iteration = 1; iteration <= maxIterations; iteration++) {
                await this.bot.utils.wait(3000)
                await this.bot.browser.utils.tryDismissCookieBanner(page)

                // Check if account is suspended
                const isSuspended = await page.waitForSelector('#suspendedAccountHeader', { visible: true, timeout: 2000 }).then(() => true).catch(() => false)
                if (isSuspended) {
                    this.bot.log('GO-HOME', 'This account is suspended!', 'error')
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
                    await this.bot.browser.utils.tryDismissAllMessages(page)

                    await this.bot.utils.wait(2000)
                    await page.goto(this.bot.config.baseURL)
                }

                await this.bot.utils.wait(5000)
                this.bot.log('GO-HOME', 'Visited homepage successfully')
            }

        } catch (error) {
            console.error('An error occurred:', error)
            return false
        }

        return true
    }

    async getDashboardData(page: Page): Promise<DashboardData> {
        const dashboardURL = new URL(this.bot.config.baseURL)
        const currentURL = new URL(page.url())

        // Should never happen since tasks are opened in a new tab!
        if (currentURL.hostname !== dashboardURL.hostname) {
            this.bot.log('DASHBOARD-DATA', 'Provided page did not equal dashboard page, redirecting to dashboard page')
            await this.goHome(page)
        }

        // Reload the page to get new data
        await page.reload({ waitUntil: 'networkidle2' })

        const scriptContent = await page.evaluate(() => {
            const scripts = Array.from(document.querySelectorAll('script'))
            const targetScript = scripts.find(script => script.innerText.includes('var dashboard'))

            if (targetScript) {
                return targetScript.innerText
            } else {
                throw this.bot.log('GET-DASHBOARD-DATA', 'Script containing dashboard data not found', 'error')
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
                throw this.bot.log('GET-DASHBOARD-DATA', 'Dashboard data not found within script', 'error')
            }
        }, scriptContent)

        return dashboardData
    }

    async getQuizData(page: Page): Promise<QuizData> {
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
                    throw this.bot.log('GET-QUIZ-DATA', 'Quiz data not found within script', 'error')
                }
            } else {
                throw this.bot.log('GET-QUIZ-DATA', 'Script containing quiz data not found', 'error')
            }

        } catch (error) {
            throw this.bot.log('GET-QUIZ-DATA', 'An error occurred:' + error, 'error')
        }

    }

    async getSearchPoints(page: Page): Promise<Counters> {
        const dashboardData = await this.getDashboardData(page) // Always fetch newest data

        return dashboardData.userStatus.counters
    }

    async getEarnablePoints(data: DashboardData, page: null | Page = null): Promise<number> {
        try {
            // Fetch new data if page is provided
            if (page) {
                data = await this.getDashboardData(page)
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
            data.dailySetPromotions[this.bot.utils.getFormattedDate()]?.forEach(x => totalEarnablePoints += (x.pointProgressMax - x.pointProgress))

            // More Promotions
            data.morePromotions.forEach(x => {
                // Only count points from supported activities
                if (['quiz', 'urlreward'].includes(x.activityType)) {
                    totalEarnablePoints += (x.pointProgressMax - x.pointProgress)
                }
            })

            return totalEarnablePoints
        } catch (error) {
            throw this.bot.log('GET-EARNABLE-POINTS', 'An error occurred:' + error, 'error')
        }
    }

    async getCurrentPoints(data: DashboardData, page: null | Page = null): Promise<number> {
        try {
            // Fetch new data if page is provided
            if (page) {
                data = await this.getDashboardData(page)
            }

            return data.userStatus.availablePoints
        } catch (error) {
            throw this.bot.log('GET-CURRENT-POINTS', 'An error occurred:' + error, 'error')
        }
    }

    async loadSesion(email: string): Promise<string> {
        const sessionDir = path.join(__dirname, this.bot.config.sessionPath, email)

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

    async waitForQuizRefresh(page: Page): Promise<boolean> {
        try {
            await page.waitForSelector('#rqHeaderCredits', { visible: true, timeout: 10_000 })
            await this.bot.utils.wait(2000)

            return true
        } catch (error) {
            this.bot.log('QUIZ-REFRESH', 'An error occurred:' + error, 'error')
            return false
        }
    }

    async checkQuizCompleted(page: Page): Promise<boolean> {
        try {
            await page.waitForSelector('#quizCompleteContainer', { visible: true, timeout: 2000 })
            await this.bot.utils.wait(2000)

            return true
        } catch (error) {
            return false
        }
    }

    async refreshCheerio(page: Page): Promise<CheerioAPI> {
        const html = await page.content()
        const $ = load(html)

        return $
    }

    async getPunchCardActivity(page: Page, activity: PromotionalItem | MorePromotion): Promise<string> {
        let selector = ''
        try {
            const html = await page.content()
            const $ = load(html)

            const element = $('.offer-cta').toArray().find(x => x.attribs.href?.includes(activity.offerId))
            if (element) {
                selector = `a[href*="${element.attribs.href}"]`
            }
        } catch (error) {
            this.bot.log('GET-PUNCHCARD-ACTIVITY', 'An error occurred:' + error, 'error')
        }

        return selector
    }

}