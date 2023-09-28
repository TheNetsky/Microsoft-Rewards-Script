import { Page } from 'puppeteer'
import axios from 'axios'

import { log } from '../../util/Logger'
import { shuffleArray, wait } from '../../util/Utils'
import { getSearchPoints } from '../../BrowserFunc'

import { searches } from '../../config.json'

import { DashboardData, DashboardImpression } from '../../interface/DashboardData'
import { GoogleTrends } from '../../interface/GoogleDailyTrends'
import { GoogleSearch } from '../../interface/Search'

export async function doSearch(page: Page, data: DashboardData, mobile: boolean) {
    const locale = await page.evaluate(() => {
        return navigator.language
    })

    log('SEARCH-BING', 'Starting bing searches')

    const mobileData = data.userStatus.counters.mobileSearch[0] as DashboardImpression  // Mobile searches
    const edgeData = data.userStatus.counters.pcSearch[1] as DashboardImpression // Edge searches
    const genericData = data.userStatus.counters.pcSearch[0] as DashboardImpression  // Normal searches

    let missingPoints = mobile ?
        (mobileData.pointProgressMax - mobileData.pointProgress) :
        (edgeData.pointProgressMax - edgeData.pointProgress) + (genericData.pointProgressMax - genericData.pointProgress)

    if (missingPoints == 0) {
        log('SEARCH-BING', `Bing searches for ${mobile ? 'MOBILE' : 'DESKTOP'} have already been completed`)
        return
    }

    // Generate search queries 
    let googleSearchQueries = await getGoogleTrends(locale, missingPoints) as GoogleSearch[]
    googleSearchQueries = shuffleArray(googleSearchQueries)

    // Deduplicate the search terms
    googleSearchQueries = [...new Set(googleSearchQueries)]

    // Open a new tab
    const browser = page.browser()
    const searchPage = await browser.newPage()

    // Go to bing
    await searchPage.goto('https://bing.com')

    let maxLoop = 0 // If the loop hits 20 this when not gaining any points, we're assuming it's stuck.

    const queries: string[] = []
    googleSearchQueries.forEach(x => queries.push(x.topic, ...x.related))

    // Loop over Google search queries
    for (let i = 0; i < queries.length; i++) {
        const query = queries[i] as string

        log('SEARCH-BING', `${missingPoints} Points Remaining | Query: ${query} | Mobile: ${mobile}`)

        const newData = await bingSearch(page, searchPage, query)

        const newMobileData = newData.mobileSearch[0] as DashboardImpression  // Mobile searches
        const newEdgeData = newData.pcSearch[1] as DashboardImpression // Edge searches
        const newGenericData = newData.pcSearch[0] as DashboardImpression  // Normal searches

        const newMissingPoints = mobile ?
            (newMobileData.pointProgressMax - newMobileData.pointProgress) :
            (newEdgeData.pointProgressMax - newEdgeData.pointProgress) + (newGenericData.pointProgressMax - newGenericData.pointProgress)

        // If the new point amount is the same as before
        if (newMissingPoints == missingPoints) {
            maxLoop++ // Add to max loop
        } else { // There has been a change in points
            maxLoop = 0 // Reset the loop
        }

        missingPoints = newMissingPoints

        if (missingPoints == 0) {
            break
        }

        if (maxLoop > 20) {
            log('SEARCH-BING', 'Search didn\'t gain point for 20 iterations aborting searches', 'warn')
            maxLoop = 0 // Reset to 0 so we can retry with related searches below
            break
        }
    }

    // If we still got remaining search queries, generate extra ones
    if (missingPoints > 0) {
        log('SEARCH-BING', `Search completed but we're missing ${missingPoints} points, generating extra searches`)

        let i = 0
        while (missingPoints > 0) {
            const query = googleSearchQueries[i++] as GoogleSearch

            // Get related search terms to the Google search queries
            const relatedTerms = await getRelatedTerms(query?.topic)
            if (relatedTerms.length > 3) {
                // Search for the first 2 related terms
                for (const term of relatedTerms.slice(1, 3)) {
                    log('SEARCH-BING-EXTRA', `${missingPoints} Points Remaining | Query: ${term} | Mobile: ${mobile}`)
                    const newData = await bingSearch(page, searchPage, query.topic)

                    const newMobileData = newData.mobileSearch[0] as DashboardImpression  // Mobile searches
                    const newEdgeData = newData.pcSearch[1] as DashboardImpression // Edge searches
                    const newGenericData = newData.pcSearch[0] as DashboardImpression  // Normal searches

                    const newMissingPoints = mobile ?
                        (newMobileData.pointProgressMax - newMobileData.pointProgress) :
                        (newEdgeData.pointProgressMax - newEdgeData.pointProgress) + (newGenericData.pointProgressMax - newGenericData.pointProgress)

                    // If the new point amount is the same as before
                    if (newMissingPoints == missingPoints) {
                        maxLoop++ // Add to max loop
                    } else { // There has been a change in points
                        maxLoop = 0 // Reset the loop
                    }

                    missingPoints = newMissingPoints

                    // If we satisfied the searches
                    if (missingPoints == 0) {
                        break
                    }

                    // Try 5 more times
                    if (maxLoop > 5) {
                        log('SEARCH-BING-EXTRA', 'Search didn\'t gain point for 5 iterations aborting searches', 'warn')
                        break
                    }
                }
            }
        }
    }

    log('SEARCH-BING', 'Completed searches')
}

async function bingSearch(page: Page, searchPage: Page, query: string) {
    // Try a max of 5 times
    for (let i = 0; i < 5; i++) {
        try {
            const searchBar = '#sb_form_q'
            await searchPage.waitForSelector(searchBar, { timeout: 3000 })
            await searchPage.click(searchBar) // Focus on the textarea
            await wait(500)
            await searchPage.keyboard.down('Control')
            await searchPage.keyboard.press('A')
            await searchPage.keyboard.press('Backspace')
            await searchPage.keyboard.up('Control')
            await searchPage.keyboard.type(query)
            await searchPage.keyboard.press('Enter')

            if (searches.scrollRandomResults) {
                await wait(2000)
                await randomScroll(searchPage)
            }

            if (searches.clickRandomResults) {
                await wait(2000)
                await clickRandomLink(searchPage)
            }

            await wait(Math.floor(Math.random() * (20_000 - 10_000) + 1) + 10_000)

            return await getSearchPoints(page)

        } catch (error) {
            if (i === 5) {
                log('SEARCH-BING', 'Failed after 5 retries... An error occurred:' + error, 'error')
                return await getSearchPoints(page)
            }

            log('SEARCH-BING', 'Search failed, retrying...', 'warn')
            await wait(4000)
        }
    }

    log('SEARCH-BING', 'Search failed after 5 retries, ending', 'error')
    return await getSearchPoints(page)
}

async function getGoogleTrends(locale: string, queryCount: number): Promise<GoogleSearch[]> {
    const queryTerms: GoogleSearch[] = []
    let i = 0

    while (queryCount > queryTerms.length) {
        i += 1
        const date = new Date()
        date.setDate(date.getDate() - i)
        const formattedDate = formatDate(date)

        try {
            const request = {
                url: `https://trends.google.com/trends/api/dailytrends?geo=US&hl=en&ed=${formattedDate}&ns=15`,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }

            const response = await axios(request)

            const data: GoogleTrends = JSON.parse((await response.data).slice(5))

            for (const topic of data.default.trendingSearchesDays[0]?.trendingSearches ?? []) {
                queryTerms.push({
                    topic: topic.title.query.toLowerCase(),
                    related: topic.relatedQueries.map(x => x.query.toLocaleLowerCase())
                })
            }

        } catch (error) {
            log('SEARCH-GOOGLE-TRENDS', 'An error occurred:' + error, 'error')
        }
    }

    return queryTerms
}

async function getRelatedTerms(term: string): Promise<string[]> {
    try {
        const request = {
            url: `https://api.bing.com/osjson.aspx?query=${term}`,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        }

        const response = await axios(request)

        return response.data[1] as string[]
    } catch (error) {
        log('SEARCH-BING-RELTATED', 'An error occurred:' + error, 'error')
    }
    return []
}

function formatDate(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    return `${year}${month}${day}`
}

async function randomScroll(page: Page) {
    const randomNumber = Math.random() * (50 - 5 + 1) + 5

    // Press the arrow down key to scroll
    for (let i = 0; i < randomNumber; i++) {
        await page.keyboard.press('ArrowDown')
    }
}

async function clickRandomLink(page: Page) {
    await page.click('#b_results h2')

    await wait(3000)
    await page.goBack()
}