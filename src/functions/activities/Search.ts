import { Page } from 'rebrowser-playwright'
import { platform } from 'os'

import { Workers } from '../Workers'

import { Counters, DashboardData } from '../../interface/DashboardData'
import { GoogleTrends } from '../../interface/GoogleDailyTrends'
import { GoogleSearch } from '../../interface/Search'


export class Search extends Workers {
    private bingHome = 'https://bing.com'
    private searchPageURL = ''

    public async doSearch(page: Page, data: DashboardData) {
        this.bot.log(this.bot.isMobile, 'SEARCH-BING', 'Starting Bing searches')

        page = await this.bot.browser.utils.getLatestTab(page)

        let searchCounters: Counters = await this.bot.browser.func.getSearchPoints()
        let missingPoints = this.calculatePoints(searchCounters)

        if (missingPoints === 0) {
            this.bot.log(this.bot.isMobile, 'SEARCH-BING', 'Bing searches have already been completed')
            return
        }

        // Generate search queries
        let googleSearchQueries = await this.getGoogleTrends(data.userProfile.attributes.country, missingPoints)
        googleSearchQueries = this.bot.utils.shuffleArray(googleSearchQueries)

        // Deduplicate the search terms
        googleSearchQueries = [...new Set(googleSearchQueries)]

        // Go to bing
        await page.goto(this.searchPageURL ? this.searchPageURL : this.bingHome)

        await this.bot.utils.wait(2000)

        await this.bot.browser.utils.tryDismissAllMessages(page)

        let maxLoop = 0 // If the loop hits 10 this when not gaining any points, we're assuming it's stuck. If it ddoesn't continue after 5 more searches with alternative queries, abort search

        const queries: string[] = []
        // Mobile search doesn't seem to like related queries?
        googleSearchQueries.forEach(x => { this.bot.isMobile ? queries.push(x.topic) : queries.push(x.topic, ...x.related) })

        // Loop over Google search queries
        for (let i = 0; i < queries.length; i++) {
            const query = queries[i] as string

            this.bot.log(this.bot.isMobile, 'SEARCH-BING', `${missingPoints} Points Remaining | Query: ${query}`)

            searchCounters = await this.bingSearch(page, query)
            const newMissingPoints = this.calculatePoints(searchCounters)

            // If the new point amount is the same as before
            if (newMissingPoints == missingPoints) {
                maxLoop++ // Add to max loop
            } else { // There has been a change in points
                maxLoop = 0 // Reset the loop
            }

            missingPoints = newMissingPoints

            if (missingPoints === 0) {
                break
            }

            // Only for mobile searches
            if (maxLoop > 5 && this.bot.isMobile) {
                this.bot.log(this.bot.isMobile, 'SEARCH-BING', 'Search didn\'t gain point for 5 iterations, likely bad User-Agent', 'warn')
                break
            }

            // If we didn't gain points for 10 iterations, assume it's stuck
            if (maxLoop > 10) {
                this.bot.log(this.bot.isMobile, 'SEARCH-BING', 'Search didn\'t gain point for 10 iterations aborting searches', 'warn')
                maxLoop = 0 // Reset to 0 so we can retry with related searches below
                break
            }
        }

        // Only for mobile searches
        if (missingPoints > 0 && this.bot.isMobile) {
            return
        }

        // If we still got remaining search queries, generate extra ones
        if (missingPoints > 0) {
            this.bot.log(this.bot.isMobile, 'SEARCH-BING', `Search completed but we're missing ${missingPoints} points, generating extra searches`)

            let i = 0
            while (missingPoints > 0) {
                const query = googleSearchQueries[i++] as GoogleSearch

                // Get related search terms to the Google search queries
                const relatedTerms = await this.getRelatedTerms(query?.topic)
                if (relatedTerms.length > 3) {
                    // Search for the first 2 related terms
                    for (const term of relatedTerms.slice(1, 3)) {
                        this.bot.log(this.bot.isMobile, 'SEARCH-BING-EXTRA', `${missingPoints} Points Remaining | Query: ${term}`)

                        searchCounters = await this.bingSearch(page, term)
                        const newMissingPoints = this.calculatePoints(searchCounters)

                        // If the new point amount is the same as before
                        if (newMissingPoints == missingPoints) {
                            maxLoop++ // Add to max loop
                        } else { // There has been a change in points
                            maxLoop = 0 // Reset the loop
                        }

                        missingPoints = newMissingPoints

                        // If we satisfied the searches
                        if (missingPoints === 0) {
                            break
                        }

                        // Try 5 more times, then we tried a total of 15 times, fair to say it's stuck
                        if (maxLoop > 5) {
                            this.bot.log(this.bot.isMobile, 'SEARCH-BING-EXTRA', 'Search didn\'t gain point for 5 iterations aborting searches', 'warn')
                            return
                        }
                    }
                }
            }
        }

        this.bot.log(this.bot.isMobile, 'SEARCH-BING', 'Completed searches')
    }

    private async bingSearch(searchPage: Page, query: string) {
        const platformControlKey = platform() === 'darwin' ? 'Meta' : 'Control'

        // Try a max of 5 times
        for (let i = 0; i < 5; i++) {
            try {
                // This page had already been set to the Bing.com page or the previous search listing, we just need to select it
                searchPage = await this.bot.browser.utils.getLatestTab(searchPage)

                // Go to top of the page
                await searchPage.evaluate(() => {
                    window.scrollTo(0, 0)
                })

                await this.bot.utils.wait(500)

                const searchBar = '#sb_form_q'
                await searchPage.waitForSelector(searchBar, { state: 'visible', timeout: 10_000 })
                await searchPage.click(searchBar) // Focus on the textarea
                await this.bot.utils.wait(500)
                await searchPage.keyboard.down(platformControlKey)
                await searchPage.keyboard.press('A')
                await searchPage.keyboard.press('Backspace')
                await searchPage.keyboard.up(platformControlKey)
                await searchPage.keyboard.type(query)
                await searchPage.keyboard.press('Enter')

                await this.bot.utils.wait(3000)

                // Bing.com in Chrome opens a new tab when searching
                const resultPage = await this.bot.browser.utils.getLatestTab(searchPage)
                this.searchPageURL = new URL(resultPage.url()).href // Set the results page

                await this.bot.browser.utils.reloadBadPage(resultPage)

                if (this.bot.config.searchSettings.scrollRandomResults) {
                    await this.bot.utils.wait(2000)
                    await this.randomScroll(resultPage)
                }

                if (this.bot.config.searchSettings.clickRandomResults) {
                    await this.bot.utils.wait(2000)
                    await this.clickRandomLink(resultPage)
                }

                // Delay between searches
                await this.bot.utils.wait(Math.floor(this.bot.utils.randomNumber(this.bot.utils.stringToMs(this.bot.config.searchSettings.searchDelay.min), this.bot.utils.stringToMs(this.bot.config.searchSettings.searchDelay.max))))

                return await this.bot.browser.func.getSearchPoints()

            } catch (error) {
                if (i === 5) {
                    this.bot.log(this.bot.isMobile, 'SEARCH-BING', 'Failed after 5 retries... An error occurred:' + error, 'error')
                    break

                }

                this.bot.log(this.bot.isMobile, 'SEARCH-BING', 'Search failed, An error occurred:' + error, 'error')
                this.bot.log(this.bot.isMobile, 'SEARCH-BING', `Retrying search, attempt ${i}/5`, 'warn')

                // Reset the tabs
                const lastTab = await this.bot.browser.utils.getLatestTab(searchPage)
                await this.closeTabs(lastTab)

                await this.bot.utils.wait(4000)
            }
        }

        this.bot.log(this.bot.isMobile, 'SEARCH-BING', 'Search failed after 5 retries, ending', 'error')
        return await this.bot.browser.func.getSearchPoints()
    }

    private async getGoogleTrends(geoLocale: string, queryCount: number): Promise<GoogleSearch[]> {
        const queryTerms: GoogleSearch[] = []
        let i = 0

        geoLocale = (this.bot.config.searchSettings.useGeoLocaleQueries && geoLocale.length === 2) ? geoLocale.toUpperCase() : 'US'

        this.bot.log(this.bot.isMobile, 'SEARCH-GOOGLE-TRENDS', `Generating search queries, can take a while! | GeoLocale: ${geoLocale}`)

        while (queryCount > queryTerms.length) {
            i += 1
            const date = new Date()
            date.setDate(date.getDate() - i)
            const formattedDate = this.formatDate(date)

            try {
                const request = {
                    url: `https://trends.google.com/trends/api/dailytrends?geo=${geoLocale}&hl=en&ed=${formattedDate}&ns=15`,
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }

                const response = await this.bot.axios.request(request)

                const data: GoogleTrends = JSON.parse((await response.data).slice(5))

                for (const topic of data.default.trendingSearchesDays[0]?.trendingSearches ?? []) {
                    queryTerms.push({
                        topic: topic.title.query.toLowerCase(),
                        related: topic.relatedQueries.map(x => x.query.toLowerCase())
                    })
                }

            } catch (error) {
                this.bot.log(this.bot.isMobile, 'SEARCH-GOOGLE-TRENDS', 'An error occurred:' + error, 'error')
                break
            }
        }

        return queryTerms
    }

    private async getRelatedTerms(term: string): Promise<string[]> {
        try {
            const request = {
                url: `https://api.bing.com/osjson.aspx?query=${term}`,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }

            const response = await this.bot.axios.request(request)

            return response.data[1] as string[]
        } catch (error) {
            this.bot.log(this.bot.isMobile, 'SEARCH-BING-RELATED', 'An error occurred:' + error, 'error')
        }
        return []
    }

    private formatDate(date: Date): string {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')

        return `${year}${month}${day}`
    }

    private async randomScroll(page: Page) {
        try {
            const viewportHeight = await page.evaluate(() => window.innerHeight)
            const totalHeight = await page.evaluate(() => document.body.scrollHeight)
            const randomScrollPosition = Math.floor(Math.random() * (totalHeight - viewportHeight))

            await page.evaluate((scrollPos) => {
                window.scrollTo(0, scrollPos)
            }, randomScrollPosition)

        } catch (error) {
            this.bot.log(this.bot.isMobile, 'SEARCH-RANDOM-SCROLL', 'An error occurred:' + error, 'error')
        }
    }

    private async clickRandomLink(page: Page) {
        try {
            await page.click('#b_results .b_algo h2', { timeout: 2000 }).catch(() => { }) // Since we don't really care if it did it or not

            // Only used if the browser is not the edge browser (continue on Edge popup)
            await this.closeContinuePopup(page)

            // Stay for 10 seconds for page to load and "visit"
            await this.bot.utils.wait(10_000)

            // Will get current tab if no new one is created, this will always be the visited site or the result page if it failed to click
            let lastTab = await this.bot.browser.utils.getLatestTab(page)

            let lastTabURL = new URL(lastTab.url()) // Get new tab info, this is the website we're visiting

            // Check if the URL is different from the original one, don't loop more than 5 times.
            let i = 0
            while (lastTabURL.href !== this.searchPageURL && i < 5) {

                await this.closeTabs(lastTab)

                // End of loop, refresh lastPage
                lastTab = await this.bot.browser.utils.getLatestTab(page) // Finally update the lastTab var again
                lastTabURL = new URL(lastTab.url()) // Get new tab info
                i++
            }

        } catch (error) {
            this.bot.log(this.bot.isMobile, 'SEARCH-RANDOM-CLICK', 'An error occurred:' + error, 'error')
        }
    }

    private async closeTabs(lastTab: Page) {
        const browser = lastTab.context()
        const tabs = browser.pages()

        // If more than 2 tabs are open, close the last tab
        if (tabs.length > 2) {
            await lastTab.close()

            // If only 1 tab is open, open a new one to search in
        } else if (tabs.length === 1) {
            const newPage = await browser.newPage()
            await this.bot.utils.wait(1000)
            await newPage.goto(this.bingHome)
            await this.bot.utils.wait(3000)
            this.searchPageURL = newPage.url()

            // Else reset the last tab back to the search listing or Bing.com
        } else {
            lastTab = await this.bot.browser.utils.getLatestTab(lastTab)
            await lastTab.goto(this.searchPageURL ? this.searchPageURL : this.bingHome)
        }
    }

    private calculatePoints(counters: Counters) {
        const mobileData = counters.mobileSearch?.[0] // Mobile searches
        const genericData = counters.pcSearch?.[0] // Normal searches
        const edgeData = counters.pcSearch?.[1] // Edge searches

        const missingPoints = (this.bot.isMobile && mobileData)
            ? mobileData.pointProgressMax - mobileData.pointProgress
            : (edgeData ? edgeData.pointProgressMax - edgeData.pointProgress : 0)
            + (genericData ? genericData.pointProgressMax - genericData.pointProgress : 0)

        return missingPoints
    }

    private async closeContinuePopup(page: Page) {
        try {
            await page.waitForSelector('#sacs_close', { timeout: 1000 })
            const continueButton = await page.$('#sacs_close')

            if (continueButton) {
                await continueButton.click()
            }
        } catch (error) {
            // Continue if element is not found or other error occurs
        }
    }

}