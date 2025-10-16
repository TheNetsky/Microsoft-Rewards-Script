import { BrowserContext, Page } from 'rebrowser-playwright'
import { CheerioAPI, load } from 'cheerio'
import { AxiosRequestConfig } from 'axios'

import { MicrosoftRewardsBot } from '../index'
import { saveSessionData } from '../util/Load'

import { Counters, DashboardData, MorePromotion, PromotionalItem } from './../interface/DashboardData'
import { QuizData } from './../interface/QuizData'
import { AppUserData } from '../interface/AppUserData'
import { EarnablePoints } from '../interface/Points'


export default class BrowserFunc {
    private bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }


    /**
     * Navigate the provided page to rewards homepage
     * @param {Page} page Playwright page
    */
    async goHome(page: Page) {

        try {
            const dashboardURL = new URL(this.bot.config.baseURL)

            if (page.url() === dashboardURL.href) {
                return
            }

            await page.goto(this.bot.config.baseURL)

            const maxIterations = 5 // Maximum iterations set to 5

            for (let iteration = 1; iteration <= maxIterations; iteration++) {
                await this.bot.utils.wait(3000)
                await this.bot.browser.utils.tryDismissAllMessages(page)

                // Check if account is suspended (multiple heuristics)
                const suspendedByHeader = await page.waitForSelector('#suspendedAccountHeader', { state: 'visible', timeout: 1500 }).then(() => true).catch(() => false)
                let suspendedByText = false
                if (!suspendedByHeader) {
                    try {
                        const text = (await page.textContent('body')) || ''
                        suspendedByText = /account has been suspended|suspended due to unusual activity/i.test(text)
                    } catch { /* ignore */ }
                }
                if (suspendedByHeader || suspendedByText) {
                    this.bot.log(this.bot.isMobile, 'GO-HOME', 'This account appears suspended!', 'error')
                    throw new Error('Account has been suspended!')
                }

                try {
                    // If activities are found, exit the loop
                    await page.waitForSelector('#more-activities', { timeout: 1000 })
                    this.bot.log(this.bot.isMobile, 'GO-HOME', 'Visited homepage successfully')
                    break

                } catch (error) {
                    // Continue if element is not found
                }

                // Below runs if the homepage was unable to be visited
                const currentURL = new URL(page.url())

                if (currentURL.hostname !== dashboardURL.hostname) {
                    await this.bot.browser.utils.tryDismissAllMessages(page)

                    await this.bot.utils.wait(2000)
                    await page.goto(this.bot.config.baseURL)
                } else {
                    this.bot.log(this.bot.isMobile, 'GO-HOME', 'Visited homepage successfully')
                    break
                }

                await this.bot.utils.wait(5000)
            }

        } catch (error) {
            throw this.bot.log(this.bot.isMobile, 'GO-HOME', 'An error occurred:' + error, 'error')
        }
    }

    /**
     * Fetch user dashboard data
     * @returns {DashboardData} Object of user bing rewards dashboard data
    */
    async getDashboardData(page?: Page): Promise<DashboardData> {
        const target = page ?? this.bot.homePage
        const dashboardURL = new URL(this.bot.config.baseURL)
        const currentURL = new URL(target.url())

        try {
            // Should never happen since tasks are opened in a new tab!
            if (currentURL.hostname !== dashboardURL.hostname) {
                this.bot.log(this.bot.isMobile, 'DASHBOARD-DATA', 'Provided page did not equal dashboard page, redirecting to dashboard page')
                await this.goHome(target)
            }
                let lastError: unknown = null
            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    // Reload the page to get new data
                    await target.reload({ waitUntil: 'domcontentloaded' })
                    lastError = null
                    break
                } catch (re) {
                    lastError = re
                    const msg = (re instanceof Error ? re.message : String(re))
                    this.bot.log(this.bot.isMobile, 'GET-DASHBOARD-DATA', `Reload failed attempt ${attempt}: ${msg}`, 'warn')
                    // If page/context closed => bail early after first retry
                    if (msg.includes('has been closed')) {
                        if (attempt === 1) {
                            this.bot.log(this.bot.isMobile, 'GET-DASHBOARD-DATA', 'Page appears closed; trying one navigation fallback', 'warn')
                            try {
                                await this.goHome(target)
                            } catch {/* ignore */}
                        } else {
                            break
                        }
                    }
                    if (attempt === 2 && lastError) throw lastError
                    await this.bot.utils.wait(1000)
                }
            }

            // Wait a bit longer for scripts to load, especially on mobile
            await this.bot.utils.wait(this.bot.isMobile ? 3000 : 1500)
            
            // Wait for the more-activities element to ensure page is fully loaded
            await target.waitForSelector('#more-activities', { timeout: 10000 }).catch(() => {
                this.bot.log(this.bot.isMobile, 'GET-DASHBOARD-DATA', 'Activities element not found, continuing anyway', 'warn')
            })

            let scriptContent = await target.evaluate(() => {
                const scripts = Array.from(document.querySelectorAll('script'))
                const targetScript = scripts.find(script => script.innerText.includes('var dashboard'))

                return targetScript?.innerText ? targetScript.innerText : null
            })

            if (!scriptContent) {
                this.bot.log(this.bot.isMobile, 'GET-DASHBOARD-DATA', 'Dashboard script not found on first try, attempting recovery', 'warn')
                await this.bot.browser.utils.captureDiagnostics(target, 'dashboard-data-missing').catch(()=>{})
                
                // Force a navigation retry once before failing hard
                try {
                    await this.goHome(target)
                    await target.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(()=>{})
                    await this.bot.utils.wait(this.bot.isMobile ? 3000 : 1500)
                } catch {/* ignore */}
                
                const retryContent = await target.evaluate(() => {
                    const scripts = Array.from(document.querySelectorAll('script'))
                    const targetScript = scripts.find(script => script.innerText.includes('var dashboard'))
                    return targetScript?.innerText ? targetScript.innerText : null
                }).catch(()=>null)
                
                if (!retryContent) {
                    // Log additional debug info
                    const scriptsDebug = await target.evaluate(() => {
                        const scripts = Array.from(document.querySelectorAll('script'))
                        return scripts.map(s => s.innerText.substring(0, 100)).join(' | ')
                    }).catch(() => 'Unable to get script debug info')
                    
                    this.bot.log(this.bot.isMobile, 'GET-DASHBOARD-DATA', `Available scripts preview: ${scriptsDebug}`, 'warn')
                    throw this.bot.log(this.bot.isMobile, 'GET-DASHBOARD-DATA', 'Dashboard data not found within script', 'error')
                }
                scriptContent = retryContent
            }

            // Extract the dashboard object from the script content
            const dashboardData = await target.evaluate((scriptContent: string) => {
                // Try multiple regex patterns for better compatibility
                const patterns = [
                    /var dashboard = (\{.*?\});/s,           // Original pattern
                    /var dashboard=(\{.*?\});/s,             // No spaces
                    /var\s+dashboard\s*=\s*(\{.*?\});/s,     // Flexible whitespace
                    /dashboard\s*=\s*(\{[\s\S]*?\});/        // More permissive
                ]

                for (const regex of patterns) {
                    const match = regex.exec(scriptContent)
                    if (match && match[1]) {
                        try {
                            return JSON.parse(match[1])
                        } catch (e) {
                            // Try next pattern if JSON parsing fails
                            continue
                        }
                    }
                }

                return null

            }, scriptContent)

            if (!dashboardData) {
                // Log a snippet of the script content for debugging
                const scriptPreview = scriptContent.substring(0, 200)
                this.bot.log(this.bot.isMobile, 'GET-DASHBOARD-DATA', `Script preview: ${scriptPreview}`, 'warn')
                await this.bot.browser.utils.captureDiagnostics(target, 'dashboard-data-parse').catch(()=>{})
                throw this.bot.log(this.bot.isMobile, 'GET-DASHBOARD-DATA', 'Unable to parse dashboard script', 'error')
            }

            return dashboardData

        } catch (error) {
            throw this.bot.log(this.bot.isMobile, 'GET-DASHBOARD-DATA', `Error fetching dashboard data: ${error}`, 'error')
        }

    }

    /**
     * Get search point counters
     * @returns {Counters} Object of search counter data
    */
    async getSearchPoints(): Promise<Counters> {
        const dashboardData = await this.getDashboardData() // Always fetch newest data

        return dashboardData.userStatus.counters
    }

    /**
     * Get total earnable points with web browser
     * @returns {number} Total earnable points
    */
    async getBrowserEarnablePoints(): Promise<EarnablePoints> {
        try {
            let desktopSearchPoints = 0
            let mobileSearchPoints = 0
            let dailySetPoints = 0
            let morePromotionsPoints = 0

            const data = await this.getDashboardData()

            // Desktop Search Points
            if (data.userStatus.counters.pcSearch?.length) {
                data.userStatus.counters.pcSearch.forEach(x => desktopSearchPoints += (x.pointProgressMax - x.pointProgress))
            }

            // Mobile Search Points
            if (data.userStatus.counters.mobileSearch?.length) {
                data.userStatus.counters.mobileSearch.forEach(x => mobileSearchPoints += (x.pointProgressMax - x.pointProgress))
            }

            // Daily Set
            data.dailySetPromotions[this.bot.utils.getFormattedDate()]?.forEach(x => dailySetPoints += (x.pointProgressMax - x.pointProgress))

            // More Promotions
            if (data.morePromotions?.length) {
                data.morePromotions.forEach(x => {
                    // Only count points from supported activities
                    if (['quiz', 'urlreward'].includes(x.promotionType) && x.exclusiveLockedFeatureStatus !== 'locked') {
                        morePromotionsPoints += (x.pointProgressMax - x.pointProgress)
                    }
                })
            }

            const totalEarnablePoints = desktopSearchPoints + mobileSearchPoints + dailySetPoints + morePromotionsPoints

            return {
                dailySetPoints,
                morePromotionsPoints,
                desktopSearchPoints,
                mobileSearchPoints,
                totalEarnablePoints
            }
        } catch (error) {
            throw this.bot.log(this.bot.isMobile, 'GET-BROWSER-EARNABLE-POINTS', 'An error occurred:' + error, 'error')
        }
    }

    /**
     * Get total earnable points with mobile app
     * @returns {number} Total earnable points
    */
    async getAppEarnablePoints(accessToken: string) {
        try {
            const points = {
                readToEarn: 0,
                checkIn: 0,
                totalEarnablePoints: 0
            }

            const eligibleOffers = [
                'ENUS_readarticle3_30points',
                'Gamification_Sapphire_DailyCheckIn'
            ]

            const data = await this.getDashboardData()
            // Guard against missing profile/attributes and undefined settings
            let geoLocale = data?.userProfile?.attributes?.country || 'US'
            const useGeo = !!(this.bot?.config?.searchSettings?.useGeoLocaleQueries)
            geoLocale = (useGeo && typeof geoLocale === 'string' && geoLocale.length === 2)
                ? geoLocale.toLowerCase()
                : 'us'

            const userDataRequest: AxiosRequestConfig = {
                url: 'https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613',
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'X-Rewards-Country': geoLocale,
                    'X-Rewards-Language': 'en'
                }
            }

            const userDataResponse: AppUserData = (await this.bot.axios.request(userDataRequest)).data
            const userData = userDataResponse.response
            const eligibleActivities = userData.promotions.filter((x) => eligibleOffers.includes(x.attributes.offerid ?? ''))

            for (const item of eligibleActivities) {
                if (item.attributes.type === 'msnreadearn') {
                    points.readToEarn = parseInt(item.attributes.pointmax ?? '') - parseInt(item.attributes.pointprogress ?? '')
                    break
                } else if (item.attributes.type === 'checkin') {
                    const checkInDay = parseInt(item.attributes.progress ?? '') % 7

                    if (checkInDay < 6 && (new Date()).getDate() != (new Date(item.attributes.last_updated ?? '')).getDate()) {
                        points.checkIn = parseInt(item.attributes['day_' + (checkInDay + 1) + '_points'] ?? '')
                    }
                    break
                }
            }

            points.totalEarnablePoints = points.readToEarn + points.checkIn

            return points
        } catch (error) {
            throw this.bot.log(this.bot.isMobile, 'GET-APP-EARNABLE-POINTS', 'An error occurred:' + error, 'error')
        }
    }

    /**
     * Get current point amount
     * @returns {number} Current total point amount
    */
    async getCurrentPoints(): Promise<number> {
        try {
            const data = await this.getDashboardData()

            return data.userStatus.availablePoints
        } catch (error) {
            throw this.bot.log(this.bot.isMobile, 'GET-CURRENT-POINTS', 'An error occurred:' + error, 'error')
        }
    }

    /**
     * Parse quiz data from provided page
     * @param {Page} page Playwright page
     * @returns {QuizData} Quiz data object
    */
    async getQuizData(page: Page): Promise<QuizData> {
        try {
            // Wait for page to be fully loaded
            await page.waitForLoadState('domcontentloaded')
            await this.bot.utils.wait(1000)

            const html = await page.content()
            const $ = load(html)

            // Try multiple possible variable names
            const possibleVariables = [
                '_w.rewardsQuizRenderInfo',
                'rewardsQuizRenderInfo',
                '_w.quizRenderInfo',
                'quizRenderInfo'
            ]

            let scriptContent = ''
            let foundVariable = ''

            for (const varName of possibleVariables) {
                scriptContent = $('script')
                    .toArray()
                    .map(el => $(el).text())
                    .find(t => t.includes(varName)) || ''

                if (scriptContent) {
                    foundVariable = varName
                    break
                }
            }

            if (scriptContent && foundVariable) {
                // Escape dots in variable name for regex
                const escapedVar = foundVariable.replace(/\./g, '\\.')
                const regex = new RegExp(`${escapedVar}\\s*=\\s*({.*?});`, 's')
                const match = regex.exec(scriptContent)

                if (match && match[1]) {
                    const quizData = JSON.parse(match[1])
                    this.bot.log(this.bot.isMobile, 'GET-QUIZ-DATA', `Found quiz data using variable: ${foundVariable}`, 'log')
                    return quizData
                } else {
                    throw this.bot.log(this.bot.isMobile, 'GET-QUIZ-DATA', `Variable ${foundVariable} found but could not extract JSON data`, 'error')
                }
            } else {
                // Log available scripts for debugging
                const allScripts = $('script')
                    .toArray()
                    .map(el => $(el).text())
                    .filter(t => t.length > 0)
                    .map(t => t.substring(0, 100))
                
                this.bot.log(this.bot.isMobile, 'GET-QUIZ-DATA', `Script not found. Tried variables: ${possibleVariables.join(', ')}`, 'error')
                this.bot.log(this.bot.isMobile, 'GET-QUIZ-DATA', `Found ${allScripts.length} scripts on page`, 'warn')
                
                throw this.bot.log(this.bot.isMobile, 'GET-QUIZ-DATA', 'Script containing quiz data not found', 'error')
            }

        } catch (error) {
            throw this.bot.log(this.bot.isMobile, 'GET-QUIZ-DATA', 'An error occurred: ' + error, 'error')
        }

    }

    async waitForQuizRefresh(page: Page): Promise<boolean> {
        try {
            await page.waitForSelector('span.rqMCredits', { state: 'visible', timeout: 10000 })
            await this.bot.utils.wait(2000)

            return true
        } catch (error) {
            this.bot.log(this.bot.isMobile, 'QUIZ-REFRESH', 'An error occurred:' + error, 'error')
            return false
        }
    }

    async checkQuizCompleted(page: Page): Promise<boolean> {
        try {
            await page.waitForSelector('#quizCompleteContainer', { state: 'visible', timeout: 2000 })
            await this.bot.utils.wait(2000)

            return true
        } catch (error) {
            return false
        }
    }

    async loadInCheerio(page: Page): Promise<CheerioAPI> {
        const html = await page.content()
        const $ = load(html)

        return $
    }

    async getPunchCardActivity(page: Page, activity: PromotionalItem | MorePromotion): Promise<string> {
        let selector = ''
        try {
            const html = await page.content()
            const $ = load(html)

                const element = $('.offer-cta').toArray().find((x: unknown) => {
                    const el = x as { attribs?: { href?: string } }
                    return !!el.attribs?.href?.includes(activity.offerId)
                })
            if (element) {
                selector = `a[href*="${element.attribs.href}"]`
            }
        } catch (error) {
            this.bot.log(this.bot.isMobile, 'GET-PUNCHCARD-ACTIVITY', 'An error occurred:' + error, 'error')
        }

        return selector
    }

    async closeBrowser(browser: BrowserContext, email: string) {
        try {
            // Save cookies
            await saveSessionData(this.bot.config.sessionPath, browser, email, this.bot.isMobile)

            await this.bot.utils.wait(2000)

            // Close browser
            await browser.close()
            this.bot.log(this.bot.isMobile, 'CLOSE-BROWSER', 'Browser closed cleanly!')
        } catch (error) {
            throw this.bot.log(this.bot.isMobile, 'CLOSE-BROWSER', 'An error occurred:' + error, 'error')
        }
    }
}