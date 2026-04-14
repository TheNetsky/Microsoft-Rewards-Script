import type { Page } from 'patchright'

import { Workers } from '../../Workers'

interface QuestInfo {
    title: string
    href: string
    tasksDone: number
    tasksTotal: number
    points: number
}

interface QuestTask {
    title: string
    href: string
    disabled: boolean
}

export class Quests extends Workers {
    // Quest IDs to skip entirely (require manual redemption, multi-day with no auto-completable tasks, etc.)
    private readonly skipQuestPatterns = [
        'Spotify', // Requires manual Spotify redemption
    ]

    public async doQuests(page: Page): Promise<void> {
        this.bot.logger.info(this.bot.isMobile, 'QUESTS', 'Starting Quests activities')

        try {
            await page.goto(`${this.bot.config.baseURL}/earn`, {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            }).catch(() => {})
            await this.bot.utils.wait(3000)
            await this.bot.browser.utils.tryDismissAllMessages(page)

            const quests = await this.getAvailableQuests(page)

            if (!quests.length) {
                this.bot.logger.info(this.bot.isMobile, 'QUESTS', 'No available quests found')
                return
            }

            // Filter out skipped quests
            const actionableQuests = quests.filter(q => {
                const shouldSkip = this.skipQuestPatterns.some(
                    pattern => q.title.toLowerCase().includes(pattern.toLowerCase())
                )
                if (shouldSkip) {
                    this.bot.logger.info(this.bot.isMobile, 'QUESTS', `Skipping quest: "${q.title}" (in skip list)`)
                }
                return !shouldSkip
            })

            if (!actionableQuests.length) {
                this.bot.logger.info(this.bot.isMobile, 'QUESTS', 'No actionable quests found after filtering')
                return
            }

            this.bot.logger.info(
                this.bot.isMobile,
                'QUESTS',
                `Found ${actionableQuests.length} actionable quests`
            )

            for (const quest of actionableQuests) {
                try {
                    await this.completeQuest(page, quest)
                    await this.bot.utils.wait(this.bot.utils.randomDelay(3000, 8000))
                } catch (error) {
                    this.bot.logger.error(
                        this.bot.isMobile,
                        'QUESTS',
                        `Error completing quest "${quest.title}": ${error instanceof Error ? error.message : String(error)}`
                    )
                }
            }

            this.bot.logger.info(this.bot.isMobile, 'QUESTS', 'Completed all available quest tasks')
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'QUESTS',
                `Fatal error: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async getAvailableQuests(page: Page): Promise<QuestInfo[]> {
        // Expand the Quests section if collapsed
        await page.evaluate(() => {
            const buttons = document.querySelectorAll('button')
            for (const btn of buttons) {
                if (btn.textContent?.trim() === 'Quests' && btn.getAttribute('aria-expanded') !== 'true') {
                    btn.click()
                }
            }
        })
        await this.bot.utils.wait(1000)

        return await page.evaluate(() => {
            const quests: Array<{
                title: string
                href: string
                tasksDone: number
                tasksTotal: number
                points: number
            }> = []

            const links = document.querySelectorAll('a[href*="/earn/quest/"]')
            for (const link of links) {
                const href = link.getAttribute('href') || ''

                // Extract title and task progress from individual <p> and span elements
                const allElements = link.querySelectorAll('p, span, div')
                let title = ''
                let tasksDone = 0
                let tasksTotal = 0
                let points = 0

                for (const el of allElements) {
                    const t = el.textContent?.trim() || ''

                    // Match exactly "N/N tasks" as standalone text in an element
                    const taskOnlyMatch = t.match(/^(\d{1,2})\/(\d{1,2}) tasks$/)
                    if (taskOnlyMatch) {
                        tasksDone = parseInt(taskOnlyMatch[1] || '0')
                        tasksTotal = parseInt(taskOnlyMatch[2] || '0')
                        continue
                    }

                    // Match points like "+50" or "+95"
                    const pointsOnlyMatch = t.match(/^\+(\d+)$/)
                    if (pointsOnlyMatch) {
                        points = parseInt(pointsOnlyMatch[1] || '0')
                        continue
                    }

                    // Skip expires text
                    if (t.startsWith('Expires')) continue

                    // First non-status text is the title
                    if (!title && t && t.length > 3) {
                        title = t
                    }
                }

                if (href && title && tasksDone < tasksTotal) {
                    quests.push({ title, href, tasksDone, tasksTotal, points })
                }
            }

            return quests
        })
    }

    private async completeQuest(page: Page, quest: QuestInfo): Promise<void> {
        this.bot.logger.info(
            this.bot.isMobile,
            'QUESTS',
            `Starting quest: "${quest.title}" | Progress: ${quest.tasksDone}/${quest.tasksTotal} | +${quest.points}`
        )

        // Navigate to the quest page
        const questUrl = quest.href.startsWith('http')
            ? quest.href
            : `${this.bot.config.baseURL}${quest.href}`

        await page.goto(questUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 15000
        }).catch(() => {})
        await this.bot.utils.wait(2000)
        await this.bot.browser.utils.tryDismissAllMessages(page)

        // Get available tasks
        const tasks = await this.getQuestTasks(page)

        // Filter to actionable tasks
        const actionableTasks = tasks.filter(t => {
            if (t.disabled) return false
            if (!t.href) return false

            // Skip redeem/claim links
            if (t.href.includes('/redeem/') || t.href.includes('redeem')) {
                this.bot.logger.info(this.bot.isMobile, 'QUESTS', `Skipping redeem task: "${t.title}"`)
                return false
            }

            // Skip "Search to complete" tasks — regular Bing searches will handle these
            if (t.title.toLowerCase() === 'search to complete') {
                this.bot.logger.info(this.bot.isMobile, 'QUESTS', `Skipping "Search to complete" task (handled by regular searches)`)
                return false
            }

            return true
        })

        if (!actionableTasks.length) {
            this.bot.logger.info(
                this.bot.isMobile,
                'QUESTS',
                `No actionable tasks for quest: "${quest.title}" (all completed, time-gated, or skipped)`
            )
            return
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'QUESTS',
            `Found ${actionableTasks.length} actionable task(s) for quest: "${quest.title}"`
        )

        for (const task of actionableTasks) {
            try {
                await this.completeQuestTask(page, task, questUrl)
                await this.bot.utils.wait(this.bot.utils.randomDelay(3000, 6000))
            } catch (error) {
                this.bot.logger.error(
                    this.bot.isMobile,
                    'QUESTS',
                    `Error completing task "${task.title}": ${error instanceof Error ? error.message : String(error)}`
                )
            }
        }
    }

    private async getQuestTasks(page: Page): Promise<QuestTask[]> {
        return await page.evaluate(() => {
            const tasks: Array<{ title: string; href: string; disabled: boolean }> = []

            const headings = document.querySelectorAll('h3')
            for (const h of headings) {
                const container = h.parentElement?.parentElement
                if (!container) continue

                const link = container.querySelector('a')
                if (!link) continue // No link = already completed

                const title = h.textContent?.trim() || ''
                const href = link.getAttribute('href') || ''
                const disabled = link.getAttribute('aria-disabled') === 'true' || link.hasAttribute('disabled')

                if (title && href) {
                    tasks.push({ title, href, disabled })
                }
            }

            return tasks
        })
    }

    private async completeQuestTask(page: Page, task: QuestTask, questUrl: string): Promise<void> {
        this.bot.logger.info(this.bot.isMobile, 'QUESTS', `Clicking task: "${task.title}" | href: ${task.href.substring(0, 80)}`)

        // Convert ms-search:// URLs to Bing search URLs (works cross-platform)
        const isMsSearch = task.href.startsWith('ms-search://')

        const clicked = await page.evaluate(({ taskTitle, isMsSearch: isMsS }) => {
            const headings = document.querySelectorAll('h3')
            for (const h of headings) {
                if (h.textContent?.trim() === taskTitle) {
                    const container = h.parentElement?.parentElement
                    const link = container?.querySelector('a:not([aria-disabled="true"]):not([disabled])') as HTMLAnchorElement | null
                    if (link) {
                        // Convert ms-search:// to bing.com search
                        if (isMsS) {
                            const href = link.getAttribute('href') || ''
                            const params = href.split('?')[1]
                            if (params) {
                                link.setAttribute('href', `https://www.bing.com/search?${params}`)
                            }
                        }

                        // Ensure it opens in a new tab
                        link.setAttribute('target', '_blank')
                        link.click()
                        return true
                    }
                }
            }
            return false
        }, { taskTitle: task.title, isMsSearch })

        if (!clicked) {
            this.bot.logger.warn(this.bot.isMobile, 'QUESTS', `Could not click task: "${task.title}"`)
            return
        }

        if (isMsSearch) {
            this.bot.logger.info(this.bot.isMobile, 'QUESTS', `Converted ms-search:// to Bing search for: "${task.title}"`)
        }

        await this.bot.utils.wait(3000)

        // Close any new tab that opened
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

        // Navigate back to the quest page for the next task
        await page.goto(questUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 15000
        }).catch(() => {})
        await this.bot.utils.wait(1000)

        this.bot.logger.info(
            this.bot.isMobile,
            'QUESTS',
            `Completed task: "${task.title}"`,
            'green'
        )
    }
}
