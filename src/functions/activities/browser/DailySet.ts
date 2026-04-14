import type { Page } from 'patchright'

import { Workers } from '../../Workers'

interface DailySetItem {
    title: string
    href: string
    completed: boolean
}

export class DailySetModern extends Workers {
    public async doDailySetModern(page: Page): Promise<void> {
        this.bot.logger.info(this.bot.isMobile, 'DAILY-SET-MODERN', 'Starting Daily Set activities')

        try {
            await page.goto(`${this.bot.config.baseURL}/dashboard`, {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            }).catch(() => {})
            await this.bot.utils.wait(3000)
            await this.bot.browser.utils.tryDismissAllMessages(page)

            // Expand the Daily Set section if collapsed
            await page.evaluate(() => {
                const buttons = document.querySelectorAll('button')
                for (const btn of buttons) {
                    if (btn.textContent?.trim() === 'Daily set' && btn.getAttribute('aria-expanded') !== 'true') {
                        btn.click()
                    }
                }
            })
            await this.bot.utils.wait(1000)

            const items = await this.getDailySetItems(page)
            const uncompleted = items.filter(item => !item.completed)

            if (!uncompleted.length) {
                this.bot.logger.info(this.bot.isMobile, 'DAILY-SET-MODERN', 'All Daily Set items already completed')
                return
            }

            this.bot.logger.info(
                this.bot.isMobile,
                'DAILY-SET-MODERN',
                `Found ${uncompleted.length} uncompleted Daily Set items (${items.length} total)`
            )

            for (const item of uncompleted) {
                try {
                    await this.completeDailySetItem(page, item)
                    await this.bot.utils.wait(this.bot.utils.randomDelay(3000, 6000))
                } catch (error) {
                    this.bot.logger.error(
                        this.bot.isMobile,
                        'DAILY-SET-MODERN',
                        `Error completing "${item.title}": ${error instanceof Error ? error.message : String(error)}`
                    )
                }
            }

            this.bot.logger.info(this.bot.isMobile, 'DAILY-SET-MODERN', 'Completed all Daily Set items')
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'DAILY-SET-MODERN',
                `Fatal error: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async getDailySetItems(page: Page): Promise<DailySetItem[]> {
        return await page.evaluate(() => {
            const items: Array<{ title: string; href: string; completed: boolean }> = []

            // Find the Daily set group
            const groups = document.querySelectorAll('[role="group"]')
            for (const g of groups) {
                const prevText = g.previousElementSibling?.textContent || ''
                if (prevText.includes('Daily set')) {
                    const links = g.querySelectorAll('a')
                    for (const link of links) {
                        const title = (link.querySelector('p')?.textContent || '').trim()
                        const href = link.getAttribute('href') || ''
                        const allText = link.textContent || ''

                        // Completed items show "Completed" text or points without "+" prefix
                        const isCompleted = allText.includes('Completed') || (!/\+\d+/.test(allText) && /\d+/.test(allText))

                        if (title && href) {
                            items.push({ title, href, completed: isCompleted })
                        }
                    }
                    break
                }
            }

            return items
        })
    }

    private async completeDailySetItem(page: Page, item: DailySetItem): Promise<void> {
        this.bot.logger.info(this.bot.isMobile, 'DAILY-SET-MODERN', `Clicking: "${item.title}"`)

        // Click the link from the dashboard page
        const clicked = await page.evaluate((title: string) => {
            const groups = document.querySelectorAll('[role="group"]')
            for (const g of groups) {
                const prevText = g.previousElementSibling?.textContent || ''
                if (prevText.includes('Daily set')) {
                    const links = g.querySelectorAll('a')
                    for (const link of links) {
                        const linkTitle = (link.querySelector('p')?.textContent || '').trim()
                        if (linkTitle === title) {
                            ;(link as HTMLAnchorElement).setAttribute('target', '_blank')
                            ;(link as HTMLAnchorElement).click()
                            return true
                        }
                    }
                }
            }
            return false
        }, item.title)

        if (!clicked) {
            this.bot.logger.warn(this.bot.isMobile, 'DAILY-SET-MODERN', `Could not click: "${item.title}"`)
            return
        }

        await this.bot.utils.wait(3000)

        // Close the new tab that opened
        const browser = page.context()
        const pages = browser.pages()

        if (pages.length > 1) {
            const newTab = pages[pages.length - 1]!
            if (newTab !== page) {
                await newTab.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {})
                await this.bot.utils.wait(this.bot.utils.randomDelay(2000, 5000))

                if (!newTab.isClosed()) {
                    await newTab.close().catch(() => {})
                }
            }
        }

        // Navigate back to the dashboard for the next item
        await page.goto(`${this.bot.config.baseURL}/dashboard`, {
            waitUntil: 'domcontentloaded',
            timeout: 15000
        }).catch(() => {})
        await this.bot.utils.wait(1000)
        await this.bot.browser.utils.tryDismissAllMessages(page)

        // Re-expand Daily Set section
        await page.evaluate(() => {
            const buttons = document.querySelectorAll('button')
            for (const btn of buttons) {
                if (btn.textContent?.trim() === 'Daily set' && btn.getAttribute('aria-expanded') !== 'true') {
                    btn.click()
                }
            }
        })
        await this.bot.utils.wait(500)

        this.bot.logger.info(
            this.bot.isMobile,
            'DAILY-SET-MODERN',
            `Completed: "${item.title}"`,
            'green'
        )
    }
}
