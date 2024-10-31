import { Page } from 'rebrowser-playwright'
import * as fs from 'fs'
import path from 'path'

import { Workers } from '../Workers'

import { MorePromotion, PromotionalItem } from '../../interface/DashboardData'


export class SearchOnBing extends Workers {

    async doSearchOnBing(page: Page, activity: MorePromotion | PromotionalItem) {
        this.bot.log(this.bot.isMobile, 'SEARCH-ON-BING', 'Trying to complete UrlReward')

        try {
            await this.bot.utils.wait(5000)

            await this.bot.browser.utils.tryDismissAllMessages(page)

            const query = await this.getSearchQuery(activity.title)

            const searchBar = '#sb_form_q'
            await page.waitForSelector(searchBar, { state: 'visible', timeout: 10_000 })
            await page.click(searchBar)
            await this.bot.utils.wait(500)
            await page.keyboard.type(query)
            await page.keyboard.press('Enter')
            await this.bot.utils.wait(3000)

            await page.close()

            this.bot.log(this.bot.isMobile, 'SEARCH-ON-BING', 'Completed the SearchOnBing successfully')
        } catch (error) {
            await page.close()
            this.bot.log(this.bot.isMobile, 'SEARCH-ON-BING', 'An error occurred:' + error, 'error')
        }
    }

    // Fetch hardcoded or from GH repo?
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