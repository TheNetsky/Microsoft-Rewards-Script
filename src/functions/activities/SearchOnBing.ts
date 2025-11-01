import type { Page } from 'playwright'
import * as fs from 'fs'
import path from 'path'

import { Workers } from '../Workers'
import { DELAYS } from '../../constants'

import { MorePromotion, PromotionalItem } from '../../interface/DashboardData'


export class SearchOnBing extends Workers {

    async doSearchOnBing(page: Page, activity: MorePromotion | PromotionalItem) {
        this.bot.log(this.bot.isMobile, 'SEARCH-ON-BING', 'Trying to complete SearchOnBing')

        try {
            await this.bot.utils.wait(DELAYS.SEARCH_ON_BING_WAIT)

            await this.bot.browser.utils.tryDismissAllMessages(page)

            const query = await this.getSearchQuery(activity.title)

            const searchBar = '#sb_form_q'
            const box = page.locator(searchBar)
            await box.waitFor({ state: 'attached', timeout: DELAYS.SEARCH_BAR_TIMEOUT })
            await this.bot.browser.utils.tryDismissAllMessages(page)
            await this.bot.utils.wait(DELAYS.SEARCH_ON_BING_FOCUS)
            try {
                await box.focus({ timeout: DELAYS.THIS_OR_THAT_START }).catch(() => { /* ignore */ })
                await box.fill('')
                await this.bot.utils.wait(DELAYS.SEARCH_ON_BING_FOCUS)
                await page.keyboard.type(query, { delay: DELAYS.TYPING_DELAY })
                await page.keyboard.press('Enter')
            } catch {
                const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`
                await page.goto(url)
            }
            await this.bot.utils.wait(DELAYS.SEARCH_ON_BING_COMPLETE)

            await page.close()

            this.bot.log(this.bot.isMobile, 'SEARCH-ON-BING', 'Completed the SearchOnBing successfully')
        } catch (error) {
            await page.close()
            this.bot.log(this.bot.isMobile, 'SEARCH-ON-BING', 'An error occurred:' + error, 'error')
        }
    }

    private async getSearchQuery(title: string): Promise<string> {
        interface Queries {
            title: string;
            queries: string[]
        }

        let queries: Queries[] = []

        try {
            if (this.bot.config.searchOnBingLocalQueries) {
                const data = fs.readFileSync(path.join(__dirname, '../queries.json'), 'utf8')
                queries = JSON.parse(data)
            } else {
                // Fetch from the repo directly so the user doesn't need to redownload the script for the new activities
                const response = await this.bot.axios.request({
                    method: 'GET',
                    url: 'https://raw.githubusercontent.com/TheNetsky/Microsoft-Rewards-Script/refs/heads/main/src/functions/queries.json'
                })
                queries = response.data
            }

            const answers = queries.find(x => this.normalizeString(x.title) === this.normalizeString(title))
            const answer = answers ? this.bot.utils.shuffleArray(answers?.queries)[0] as string : title

            this.bot.log(this.bot.isMobile, 'SEARCH-ON-BING-QUERY', `Fetched answer: ${answer} | question: ${title}`)
            return answer

        } catch (error) {
            this.bot.log(this.bot.isMobile, 'SEARCH-ON-BING-QUERY', 'An error occurred:' + error, 'error')
            return title
        }
    }

    private normalizeString(string: string): string {
        return string.normalize('NFD').trim().toLowerCase().replace(/[^\x20-\x7E]/g, '').replace(/[?!]/g, '')
    }
}