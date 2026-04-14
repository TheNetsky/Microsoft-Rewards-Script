import type { Page } from 'patchright'
import * as fs from 'fs'
import path from 'path'

import { Workers } from '../../Workers'

interface ExploreActivity {
    title: string
    href: string
}

interface QueryEntry {
    title: string
    queries: string[]
}

export class ExploreOnBing extends Workers {
    private queryData: QueryEntry[] = []
    private completedTitles: Set<string> = new Set()

    public async doExploreOnBing(page: Page): Promise<void> {
        this.bot.logger.info(this.bot.isMobile, 'EXPLORE-ON-BING', 'Starting Explore on Bing activities')

        try {
            this.queryData = await this.loadQueryData()
            this.completedTitles.clear()

            await page.goto(`${this.bot.config.baseURL}/earn`, {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            }).catch(() => {})
            await this.bot.utils.wait(3000)
            await this.bot.browser.utils.tryDismissAllMessages(page)

            const activities = await this.getExploreActivities(page)

            if (!activities.length) {
                this.bot.logger.info(this.bot.isMobile, 'EXPLORE-ON-BING', 'No available Explore on Bing activities found')
                return
            }

            // Deduplicate by title — only process each unique title once
            const uniqueActivities = activities.filter((activity, index, self) =>
                index === self.findIndex(a => a.title === activity.title)
            )

            this.bot.logger.info(
                this.bot.isMobile,
                'EXPLORE-ON-BING',
                `Found ${uniqueActivities.length} unique Explore on Bing activities to complete`
            )

            for (const activity of uniqueActivities) {
                if (this.completedTitles.has(activity.title)) continue

                try {
                    await this.completeExploreActivity(page, activity)
                    this.completedTitles.add(activity.title)
                    await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 10000))
                } catch (error) {
                    this.bot.logger.error(
                        this.bot.isMobile,
                        'EXPLORE-ON-BING',
                        `Error completing "${activity.title}": ${error instanceof Error ? error.message : String(error)}`
                    )
                }
            }

            this.bot.logger.info(this.bot.isMobile, 'EXPLORE-ON-BING', 'Completed all Explore on Bing activities')
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'EXPLORE-ON-BING',
                `Fatal error: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async getExploreActivities(page: Page): Promise<ExploreActivity[]> {
        return await page.evaluate(() => {
            const groups = document.querySelectorAll('[role="group"]')
            for (const g of groups) {
                const prevText = g.previousElementSibling?.textContent || ''
                if (prevText.includes('Explore on Bing')) {
                    const links = g.querySelectorAll('a:not([aria-disabled="true"])')
                    return Array.from(links)
                        .map(a => {
                            const title = (a.querySelector('p')?.textContent || '').replace(/\u200B/g, '').trim()
                            const href = a.getAttribute('href') || ''
                            const allText = a.textContent || ''
                            // Completed activities no longer show "+N" points text
                            const hasPoints = /\+\d+/.test(allText)
                            return { title, href, hasPoints }
                        })
                        .filter(item => item.href && item.title && item.hasPoints)
                        .map(({ title, href }) => ({ title, href }))
                }
            }
            return []
        })
    }

    private async completeExploreActivity(page: Page, activity: ExploreActivity): Promise<void> {
        this.bot.logger.info(
            this.bot.isMobile,
            'EXPLORE-ON-BING',
            `Starting activity: "${activity.title}"`
        )

        // Click the link from the Earn page to activate the activity
        const clicked = await page.evaluate((title: string) => {
            const groups = document.querySelectorAll('[role="group"]')
            for (const g of groups) {
                const prevText = g.previousElementSibling?.textContent || ''
                if (prevText.includes('Explore on Bing')) {
                    const links = g.querySelectorAll('a:not([aria-disabled="true"])')
                    for (const link of links) {
                        const linkTitle = (link.querySelector('p')?.textContent || '').replace(/\u200B/g, '').trim()
                        if (linkTitle === title) {
                            ;(link as HTMLAnchorElement).click()
                            return true
                        }
                    }
                }
            }
            return false
        }, activity.title)

        if (!clicked) {
            this.bot.logger.warn(this.bot.isMobile, 'EXPLORE-ON-BING', `Could not click activity: "${activity.title}"`)
            return
        }

        await this.bot.utils.wait(3000)

        // Switch to the new tab that opened
        const browser = page.context()
        const pages = browser.pages()
        const bingTab = pages[pages.length - 1]

        if (!bingTab || bingTab === page) {
            this.bot.logger.warn(this.bot.isMobile, 'EXPLORE-ON-BING', 'No new tab opened after clicking activity')
            return
        }

        try {
            await bingTab.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {})
            await this.bot.browser.utils.tryDismissAllMessages(bingTab)

            // Get search queries for this activity
            const queries: string[] = this.getQueriesForActivity(activity.title)
            if (!queries.length) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'EXPLORE-ON-BING',
                    `No matching queries found for "${activity.title}", using title as query`
                )
                queries.push(activity.title)
            }

            // Pick a random query and search
            const query = queries[Math.floor(Math.random() * queries.length)] || activity.title
            this.bot.logger.debug(this.bot.isMobile, 'EXPLORE-ON-BING', `Searching: "${query}"`)

            const searchBox = bingTab.locator('#sb_form_q')
            await searchBox.waitFor({ state: 'attached', timeout: 10000 })
            await searchBox.click({ clickCount: 3 }).catch(() => {})
            await searchBox.fill('')
            await bingTab.keyboard.type(query, { delay: 50 })
            await bingTab.keyboard.press('Enter')

            await bingTab.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {})
            await this.bot.utils.wait(this.bot.utils.randomDelay(3000, 6000))

            this.bot.logger.info(
                this.bot.isMobile,
                'EXPLORE-ON-BING',
                `Completed activity: "${activity.title}" | query="${query}"`,
                'green'
            )
        } finally {
            // Close the Bing tab
            if (!bingTab.isClosed()) {
                await bingTab.close().catch(() => {})
            }

            // Re-navigate to the Earn page for the next activity
            await page.goto(`${this.bot.config.baseURL}/earn`, {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            }).catch(() => {})
            await this.bot.utils.wait(2000)
            await this.bot.browser.utils.tryDismissAllMessages(page)
        }
    }

    private getQueriesForActivity(title: string): string[] {
        const normalizedTitle = this.bot.utils.normalizeString(title)

        const match = this.queryData.find(
            q => this.bot.utils.normalizeString(q.title) === normalizedTitle
        )

        if (match) {
            return this.bot.utils.shuffleArray([...match.queries])
        }

        return []
    }

    private async loadQueryData(): Promise<QueryEntry[]> {
        // Always load local queries first (has the most up-to-date Explore on Bing entries)
        try {
            const data = fs.readFileSync(
                path.join(__dirname, '../../bing-search-activity-queries.json'),
                'utf8'
            )
            return JSON.parse(data)
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'EXPLORE-ON-BING',
                `Failed to load local query data: ${error instanceof Error ? error.message : String(error)}`
            )

            // Fallback to remote
            try {
                const response = await this.bot.axios.request({
                    method: 'GET',
                    url: 'https://raw.githubusercontent.com/TheNetsky/Microsoft-Rewards-Script/refs/heads/v3/src/functions/bing-search-activity-queries.json'
                })
                return response.data
            } catch {
                return []
            }
        }
    }
}
