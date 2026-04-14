import type { Page } from 'patchright'

import { Workers } from '../../Workers'

interface KeepEarningItem {
    title: string
    href: string
    points: number
}

export class KeepEarning extends Workers {
    // Only process items with these URL patterns (safe to auto-complete)
    private readonly allowedUrlPatterns = [
        'bing.com/search',
        'bing.com/shop',
        'bing.com/spotlight',
        'bing.com?form='
    ]

    // Skip items matching these patterns
    private readonly skipUrlPatterns = [
        '/redeem/',
        '/sweepstakes/',
        '/referandearn',
        'bingapp.microsoft.com',
        'aka.ms/',
        'microsoft.com/edge',
        'xbox.com'
    ]

    public async doKeepEarning(page: Page): Promise<void> {
        this.bot.logger.info(this.bot.isMobile, 'KEEP-EARNING', 'Starting Keep Earning activities')

        try {
            await page.goto(`${this.bot.config.baseURL}/earn`, {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            }).catch(() => {})
            await this.bot.utils.wait(3000)
            await this.bot.browser.utils.tryDismissAllMessages(page)

            // Click "Show more" to reveal all items
            await this.expandShowMore(page)

            const items = await this.getKeepEarningItems(page)

            if (!items.length) {
                this.bot.logger.info(this.bot.isMobile, 'KEEP-EARNING', 'No actionable Keep Earning items found')
                return
            }

            this.bot.logger.info(
                this.bot.isMobile,
                'KEEP-EARNING',
                `Found ${items.length} actionable Keep Earning items`
            )

            for (const item of items) {
                try {
                    await this.completeKeepEarningItem(page, item)
                    await this.bot.utils.wait(this.bot.utils.randomDelay(3000, 8000))
                } catch (error) {
                    this.bot.logger.error(
                        this.bot.isMobile,
                        'KEEP-EARNING',
                        `Error completing "${item.title}": ${error instanceof Error ? error.message : String(error)}`
                    )
                }
            }

            this.bot.logger.info(this.bot.isMobile, 'KEEP-EARNING', 'Completed all Keep Earning items')
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'KEEP-EARNING',
                `Fatal error: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async expandShowMore(page: Page): Promise<void> {
        // Keep clicking "Show more" until it's gone
        for (let i = 0; i < 5; i++) {
            const clicked = await page.evaluate(() => {
                const groups = document.querySelectorAll('[role="group"]')
                for (const g of groups) {
                    const prevText = g.previousElementSibling?.textContent || ''
                    if (prevText.includes('Keep earning')) {
                        const showMore = g.querySelector('button')
                        if (showMore && showMore.textContent?.includes('Show more')) {
                            showMore.click()
                            return true
                        }
                    }
                }
                return false
            })

            if (!clicked) break
            await this.bot.utils.wait(1500)
        }
    }

    private async getKeepEarningItems(page: Page): Promise<KeepEarningItem[]> {
        const allowedPatterns = this.allowedUrlPatterns
        const skipPatterns = this.skipUrlPatterns

        return await page.evaluate(({ allowed, skip }) => {
            const items: Array<{ title: string; href: string; points: number }> = []

            const groups = document.querySelectorAll('[role="group"]')
            for (const g of groups) {
                const prevText = g.previousElementSibling?.textContent || ''
                if (prevText.includes('Keep earning')) {
                    const links = g.querySelectorAll('a')
                    for (const link of links) {
                        const ps = link.querySelectorAll('p')
                        const title = (ps[0]?.textContent || '').replace(/\u200B/g, '').trim()
                        const href = link.getAttribute('href') || ''
                        const allText = link.textContent || ''

                        // Only process items with points
                        const pointsMatch = allText.match(/\+(\d+)/)
                        if (!pointsMatch) continue

                        const points = parseInt(pointsMatch[1] || '0')

                        // Skip completed items
                        if (allText.includes('Completed')) continue

                        // Check URL against allowed/skip patterns
                        const isAllowed = allowed.some(pattern => href.includes(pattern))
                        const isSkipped = skip.some(pattern => href.includes(pattern))

                        if (isAllowed && !isSkipped && title && href) {
                            items.push({ title, href, points })
                        }
                    }
                    break
                }
            }

            // Deduplicate by title
            return items.filter((item, i, self) =>
                i === self.findIndex(t => t.title === item.title)
            )
        }, { allowed: allowedPatterns, skip: skipPatterns })
    }

    private async completeKeepEarningItem(page: Page, item: KeepEarningItem): Promise<void> {
        this.bot.logger.info(
            this.bot.isMobile,
            'KEEP-EARNING',
            `Clicking: "${item.title}" | +${item.points} | ${item.href.substring(0, 80)}`
        )

        // Click the link from the Earn page
        const clicked = await page.evaluate((title: string) => {
            const groups = document.querySelectorAll('[role="group"]')
            for (const g of groups) {
                const prevText = g.previousElementSibling?.textContent || ''
                if (prevText.includes('Keep earning')) {
                    const links = g.querySelectorAll('a')
                    for (const link of links) {
                        const linkTitle = (link.querySelector('p')?.textContent || '').replace(/\u200B/g, '').trim()
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
            this.bot.logger.warn(this.bot.isMobile, 'KEEP-EARNING', `Could not click: "${item.title}"`)
            return
        }

        await this.bot.utils.wait(3000)

        // Handle the new tab
        const browser = page.context()
        const pages = browser.pages()

        if (pages.length > 1) {
            const newTab = pages[pages.length - 1]!
            if (newTab !== page) {
                await newTab.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {})

                // Check if the page has a quiz or puzzle and auto-complete it
                await this.handleInteractivePage(newTab, item.title)

                await this.bot.utils.wait(this.bot.utils.randomDelay(2000, 5000))

                if (!newTab.isClosed()) {
                    await newTab.close().catch(() => {})
                }
            }
        }

        // Navigate back to the Earn page
        await page.goto(`${this.bot.config.baseURL}/earn`, {
            waitUntil: 'domcontentloaded',
            timeout: 15000
        }).catch(() => {})
        await this.bot.utils.wait(1000)
        await this.bot.browser.utils.tryDismissAllMessages(page)

        // Re-expand Show more
        await this.expandShowMore(page)

        this.bot.logger.info(
            this.bot.isMobile,
            'KEEP-EARNING',
            `Completed: "${item.title}" | +${item.points}`,
            'green'
        )
    }

    private async handleInteractivePage(tab: Page, activityTitle: string): Promise<void> {
        // Handle puzzle pages — click "Skip puzzle" if available
        const skippedPuzzle = await tab.evaluate(() => {
            const skipLink = Array.from(document.querySelectorAll('a')).find(
                a => a.textContent?.trim() === 'Skip puzzle'
            )
            if (skipLink) {
                ;(skipLink as HTMLAnchorElement).click()
                return true
            }
            return false
        })

        if (skippedPuzzle) {
            this.bot.logger.info(
                this.bot.isMobile,
                'KEEP-EARNING-PUZZLE',
                `Skipped puzzle for "${activityTitle}"`
            )
            await tab.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {})
            await this.bot.utils.wait(2000)
            return
        }

        // Handle quiz pages
        await this.handleQuiz(tab, activityTitle)
    }

    private async handleQuiz(tab: Page, activityTitle: string): Promise<void> {
        const maxQuestions = 10

        for (let q = 0; q < maxQuestions; q++) {
            const quizState = await tab.evaluate(() => {
                const container = document.querySelector('.answer_container')
                if (!container) return { hasQuiz: false }

                const answers = container.querySelectorAll('a.acf-button-standard__link')
                const viewResult = Array.from(document.querySelectorAll('a')).find(
                    a => a.textContent?.trim() === 'View result'
                )

                return {
                    hasQuiz: true,
                    answerCount: answers.length,
                    hasViewResult: !!viewResult
                }
            })

            if (!quizState.hasQuiz) return

            // Quiz is done — click View result
            if (quizState.hasViewResult) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'KEEP-EARNING-QUIZ',
                    `Quiz complete for "${activityTitle}" | Clicking View result`
                )

                await tab.evaluate(() => {
                    const viewResult = Array.from(document.querySelectorAll('a')).find(
                        a => a.textContent?.trim() === 'View result'
                    )
                    if (viewResult) viewResult.click()
                })

                await tab.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {})
                await this.bot.utils.wait(2000)
                return
            }

            // Click the first answer option
            if ((quizState.answerCount ?? 0) > 0) {
                const answerText = await tab.evaluate(() => {
                    const answer = document.querySelector('a.acf-button-standard__link')
                    if (answer) {
                        const text = answer.textContent?.trim()
                        ;(answer as HTMLAnchorElement).click()
                        return text
                    }
                    return null
                })

                this.bot.logger.info(
                    this.bot.isMobile,
                    'KEEP-EARNING-QUIZ',
                    `Quiz "${activityTitle}" | Q${q + 1} answered: "${answerText}"`
                )

                await tab.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {})
                await this.bot.utils.wait(this.bot.utils.randomDelay(1500, 3000))
            } else {
                return
            }
        }
    }
}
