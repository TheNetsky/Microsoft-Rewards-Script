import type { Page } from 'patchright'
import type { Counters, DashboardData } from '../../../interface/DashboardData'

import { QueryCore } from '../../QueryEngine'
import { Workers } from '../../Workers'

export class Search extends Workers {
    private bingHome = 'https://bing.com'
    private searchPageURL = ''
    private searchCount = 0

    public async doSearch(data: DashboardData, page: Page, isMobile: boolean): Promise<number> {
        const startBalance = Number(this.bot.userData.currentPoints ?? 0)

        this.bot.logger.info(isMobile, 'SEARCH-BING', `Starting Bing searches | currentPoints=${startBalance}`)

        let totalGainedPoints = 0

        try {
            let searchCounters: Counters = await this.bot.browser.func.getSearchPoints()
            const missingPoints = this.bot.browser.func.missingSearchPoints(searchCounters, isMobile)
            let missingPointsTotal = missingPoints.totalPoints

            this.bot.logger.debug(
                isMobile,
                'SEARCH-BING',
                `Initial search counters | mobile=${missingPoints.mobilePoints} | desktop=${missingPoints.desktopPoints} | edge=${missingPoints.edgePoints}`
            )

            this.bot.logger.info(
                isMobile,
                'SEARCH-BING',
                `Search points remaining | Edge=${missingPoints.edgePoints} | Desktop=${missingPoints.desktopPoints} | Mobile=${missingPoints.mobilePoints}`
            )

            let queries: string[] = []

            const queryCore = new QueryCore(this.bot)

            const locale = this.bot.userData.geoLocale.toUpperCase()

            this.bot.logger.debug(isMobile, 'SEARCH-BING', `Resolving search queries | locale=${locale}`)

            // Set Google search queries
            queries = await queryCore.getGoogleTrends(locale)

            this.bot.logger.debug(isMobile, 'SEARCH-BING', `Fetched base queries | count=${queries.length}`)

            // Deduplicate queries
            queries = [...new Set(queries)]

            this.bot.logger.debug(isMobile, 'SEARCH-BING', `Deduplicated queries | count=${queries.length}`)

            // Shuffle
            queries = this.bot.utils.shuffleArray(queries)

            this.bot.logger.debug(isMobile, 'SEARCH-BING', `Shuffled queries | count=${queries.length}`)

            // Go to bing
            const targetUrl = this.searchPageURL ? this.searchPageURL : this.bingHome
            this.bot.logger.debug(isMobile, 'SEARCH-BING', `Navigating to search page | url=${targetUrl}`)

            await page.goto(targetUrl)

            // Wait until page loaded
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})

            await this.bot.browser.utils.tryDismissAllMessages(page)

            let stagnantLoop = 0
            const stagnantLoopMax = 10

            for (let i = 0; i < queries.length; i++) {
                const query = queries[i] as string

                searchCounters = await this.bingSearch(page, query, isMobile)
                const newMissingPoints = this.bot.browser.func.missingSearchPoints(searchCounters, isMobile)
                const newMissingPointsTotal = newMissingPoints.totalPoints

                // Points gained for THIS query only
                const rawGained = missingPointsTotal - newMissingPointsTotal
                const gainedPoints = Math.max(0, rawGained)

                if (gainedPoints === 0) {
                    stagnantLoop++
                    this.bot.logger.info(
                        isMobile,
                        'SEARCH-BING',
                        `No points gained ${stagnantLoop}/${stagnantLoopMax} | query="${query}" | remaining=${newMissingPointsTotal}`
                    )
                } else {
                    stagnantLoop = 0

                    // Update global user data
                    const newBalance = Number(this.bot.userData.currentPoints ?? 0) + gainedPoints
                    this.bot.userData.currentPoints = newBalance
                    this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + gainedPoints

                    // Track for return value
                    totalGainedPoints += gainedPoints

                    this.bot.logger.info(
                        isMobile,
                        'SEARCH-BING',
                        `gainedPoints=${gainedPoints} points | query="${query}" | remaining=${newMissingPointsTotal}`,
                        'green'
                    )
                }

                // Update loop state
                missingPointsTotal = newMissingPointsTotal

                // Completed
                if (missingPointsTotal === 0) {
                    this.bot.logger.info(
                        isMobile,
                        'SEARCH-BING',
                        'All required search points earned, stopping main search loop'
                    )
                    break
                }

                // Stuck
                if (stagnantLoop > stagnantLoopMax) {
                    this.bot.logger.warn(
                        isMobile,
                        'SEARCH-BING',
                        `Search did not gain points for ${stagnantLoopMax} iterations, aborting main search loop`
                    )
                    stagnantLoop = 0
                    break
                }
            }

            if (missingPointsTotal > 0) {
                this.bot.logger.info(
                    isMobile,
                    'SEARCH-BING',
                    `Search completed but still missing points, generating extra searches | remaining=${missingPointsTotal}`
                )

                let i = 0
                let stagnantLoop = 0
                const stagnantLoopMax = 5

                while (missingPointsTotal > 0) {
                    const query = queries[i++] as string

                    this.bot.logger.debug(
                        isMobile,
                        'SEARCH-BING-EXTRA',
                        `Fetching related terms for extra searches | baseQuery="${query}"`
                    )

                    const relatedTerms = await queryCore.getBingRelatedTerms(query)
                    this.bot.logger.debug(
                        isMobile,
                        'SEARCH-BING-EXTRA',
                        `Related terms resolved | baseQuery="${query}" | count=${relatedTerms.length}`
                    )

                    if (relatedTerms.length > 3) {
                        for (const term of relatedTerms.slice(1, 3)) {
                            this.bot.logger.info(
                                isMobile,
                                'SEARCH-BING-EXTRA',
                                `Extra search | remaining=${missingPointsTotal} | query="${term}"`
                            )

                            searchCounters = await this.bingSearch(page, term, isMobile)
                            const newMissingPoints = this.bot.browser.func.missingSearchPoints(searchCounters, isMobile)
                            const newMissingPointsTotal = newMissingPoints.totalPoints

                            // Points gained for THIS extra query only
                            const rawGained = missingPointsTotal - newMissingPointsTotal
                            const gainedPoints = Math.max(0, rawGained)

                            if (gainedPoints === 0) {
                                stagnantLoop++
                                this.bot.logger.info(
                                    isMobile,
                                    'SEARCH-BING-EXTRA',
                                    `No points gained for extra query ${stagnantLoop}/${stagnantLoopMax} | query="${term}" | remaining=${newMissingPointsTotal}`
                                )
                            } else {
                                stagnantLoop = 0

                                // Update global user data
                                const newBalance = Number(this.bot.userData.currentPoints ?? 0) + gainedPoints
                                this.bot.userData.currentPoints = newBalance
                                this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + gainedPoints

                                // Track for return value
                                totalGainedPoints += gainedPoints

                                this.bot.logger.info(
                                    isMobile,
                                    'SEARCH-BING-EXTRA',
                                    `gainedPoints=${gainedPoints} points | query="${term}" | remaining=${newMissingPointsTotal}`,
                                    'green'
                                )
                            }

                            // Update loop state
                            missingPointsTotal = newMissingPointsTotal

                            // Completed
                            if (missingPointsTotal === 0) {
                                this.bot.logger.info(
                                    isMobile,
                                    'SEARCH-BING-EXTRA',
                                    'All required search points earned during extra searches'
                                )
                                break
                            }

                            // Stuck again
                            if (stagnantLoop > stagnantLoopMax) {
                                this.bot.logger.warn(
                                    isMobile,
                                    'SEARCH-BING-EXTRA',
                                    `Search did not gain points for ${stagnantLoopMax} extra iterations, aborting extra searches`
                                )
                                const finalBalance = Number(this.bot.userData.currentPoints ?? startBalance)
                                this.bot.logger.info(
                                    isMobile,
                                    'SEARCH-BING',
                                    `Aborted extra searches | startBalance=${startBalance} | finalBalance=${finalBalance}`
                                )
                                return totalGainedPoints
                            }
                        }
                    }
                }
            }

            const finalBalance = Number(this.bot.userData.currentPoints ?? startBalance)

            this.bot.logger.info(
                isMobile,
                'SEARCH-BING',
                `Completed Bing searches | startBalance=${startBalance} | newBalance=${finalBalance}`
            )

            return totalGainedPoints
        } catch (error) {
            this.bot.logger.error(
                isMobile,
                'SEARCH-BING',
                `Error in doSearch | message=${error instanceof Error ? error.message : String(error)}`
            )
            return totalGainedPoints
        }
    }

    private async bingSearch(searchPage: Page, query: string, isMobile: boolean) {
        const maxAttempts = 5
        const refreshThreshold = 10 // Page gets sluggish after x searches?

        this.searchCount++

        // Page fill seems to get more sluggish over time
        if (this.searchCount % refreshThreshold === 0) {
            this.bot.logger.info(
                isMobile,
                'SEARCH-BING',
                `Returning to home page to clear accumulated page context | count=${this.searchCount} | threshold=${refreshThreshold}`
            )

            this.bot.logger.debug(isMobile, 'SEARCH-BING', `Returning home to refresh state | url=${this.bingHome}`)

            await searchPage.goto(this.bingHome)
            await searchPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
            await this.bot.browser.utils.tryDismissAllMessages(searchPage) // Not always the case but possible for new cookie headers
        }

        this.bot.logger.debug(
            isMobile,
            'SEARCH-BING',
            `Starting bingSearch | query="${query}" | maxAttempts=${maxAttempts} | searchCount=${this.searchCount} | refreshEvery=${refreshThreshold} | scrollRandomResults=${this.bot.config.searchSettings.scrollRandomResults} | clickRandomResults=${this.bot.config.searchSettings.clickRandomResults}`
        )

        for (let i = 0; i < maxAttempts; i++) {
            try {
                const searchBar = '#sb_form_q'
                const searchBox = searchPage.locator(searchBar)

                await searchPage.evaluate(() => {
                    window.scrollTo({ left: 0, top: 0, behavior: 'auto' })
                })

                await searchPage.keyboard.press('Home')
                await searchBox.waitFor({ state: 'visible', timeout: 15000 })

                await this.bot.utils.wait(1000)
                await this.bot.browser.utils.ghostClick(searchPage, searchBar, { clickCount: 3 })
                await searchBox.fill('')

                await searchPage.keyboard.type(query, { delay: 50 })
                await searchPage.keyboard.press('Enter')

                this.bot.logger.debug(
                    isMobile,
                    'SEARCH-BING',
                    `Submitted query to Bing | attempt=${i + 1}/${maxAttempts} | query="${query}"`
                )

                await this.bot.utils.wait(3000)

                if (this.bot.config.searchSettings.scrollRandomResults) {
                    await this.bot.utils.wait(2000)
                    await this.randomScroll(searchPage, isMobile)
                }

                if (this.bot.config.searchSettings.clickRandomResults) {
                    await this.bot.utils.wait(2000)
                    await this.clickRandomLink(searchPage, isMobile)
                }

                await this.bot.utils.wait(
                    this.bot.utils.randomDelay(
                        this.bot.config.searchSettings.searchDelay.min,
                        this.bot.config.searchSettings.searchDelay.max
                    )
                )

                const counters = await this.bot.browser.func.getSearchPoints()

                this.bot.logger.debug(
                    isMobile,
                    'SEARCH-BING',
                    `Search counters after query | attempt=${i + 1}/${maxAttempts} | query="${query}"`
                )

                return counters
            } catch (error) {
                if (i >= 5) {
                    this.bot.logger.error(
                        isMobile,
                        'SEARCH-BING',
                        `Failed after 5 retries | query="${query}" | message=${error instanceof Error ? error.message : String(error)}`
                    )
                    break
                }

                this.bot.logger.error(
                    isMobile,
                    'SEARCH-BING',
                    `Search attempt failed | attempt=${i + 1}/${maxAttempts} | query="${query}" | message=${error instanceof Error ? error.message : String(error)}`
                )

                this.bot.logger.warn(
                    isMobile,
                    'SEARCH-BING',
                    `Retrying search | attempt=${i + 1}/${maxAttempts} | query="${query}"`
                )

                await this.bot.utils.wait(2000)
            }
        }

        this.bot.logger.debug(
            isMobile,
            'SEARCH-BING',
            `Returning current search counters after failed retries | query="${query}"`
        )

        return await this.bot.browser.func.getSearchPoints()
    }

    private async randomScroll(page: Page, isMobile: boolean) {
        try {
            const viewportHeight = await page.evaluate(() => window.innerHeight)
            const totalHeight = await page.evaluate(() => document.body.scrollHeight)
            const randomScrollPosition = Math.floor(Math.random() * (totalHeight - viewportHeight))

            this.bot.logger.debug(
                isMobile,
                'SEARCH-RANDOM-SCROLL',
                `Random scroll | viewportHeight=${viewportHeight} | totalHeight=${totalHeight} | scrollPos=${randomScrollPosition}`
            )

            await page.evaluate((scrollPos: number) => {
                window.scrollTo({ left: 0, top: scrollPos, behavior: 'auto' })
            }, randomScrollPosition)
        } catch (error) {
            this.bot.logger.error(
                isMobile,
                'SEARCH-RANDOM-SCROLL',
                `An error occurred during random scroll | message=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async clickRandomLink(page: Page, isMobile: boolean) {
        try {
            this.bot.logger.debug(isMobile, 'SEARCH-RANDOM-CLICK', 'Attempting to click a random search result link')

            const searchPageUrl = page.url()

            await this.bot.browser.utils.ghostClick(page, '#b_results .b_algo h2')
            await this.bot.utils.wait(this.bot.config.searchSettings.searchResultVisitTime)

            if (isMobile) {
                // Mobile
                await page.goto(searchPageUrl)
                this.bot.logger.debug(isMobile, 'SEARCH-RANDOM-CLICK', 'Navigated back to search page')
            } else {
                // Desktop
                const newTab = await this.bot.browser.utils.getLatestTab(page)
                const newTabUrl = newTab.url()

                this.bot.logger.debug(isMobile, 'SEARCH-RANDOM-CLICK', `Visited result tab | url=${newTabUrl}`)

                await this.bot.browser.utils.closeTabs(newTab)
                this.bot.logger.debug(isMobile, 'SEARCH-RANDOM-CLICK', 'Closed result tab')
            }
        } catch (error) {
            this.bot.logger.error(
                isMobile,
                'SEARCH-RANDOM-CLICK',
                `An error occurred during random click | message=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }
}
