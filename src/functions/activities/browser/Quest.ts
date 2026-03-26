import type { Page } from 'patchright'

import { Workers } from '../../Workers'
import type { MicrosoftRewardsBot } from '../../../index'

interface QuestCard {
    href: string
    title: string
    points: string
    tasks: string
}

interface QuestTask {
    title: string
    destination: string
    offerId: string
    isCompleted: boolean
    isLocked: boolean
}

/**
 * Quest activity handler - discovers and completes quest tasks
 *
 * LIMITATION: Only supports bing.com/search URLs
 * ============================================
 * ms-search:// protocol URLs are NOT supported for the following reasons:
 * 1. ms-search:// is a custom protocol that doesn't load in standard browsers
 * 2. Task content (title, description, completion status) is NOT visible in the DOM
 * 3. Task metadata is embedded in Next.js JSON data, not accessible via DOM queries
 * 4. No way to reliably determine if a task is completed without API calls
 * 5. Click handlers are obfuscated and don't follow standard HTML link patterns
 *
 * WORKAROUND: Only bing.com/search tasks are processed because:
 * - They render as standard <a> tags with href attributes
 * - Click opens new tab/window, allowing standard navigation detection
 * - Task completion can be inferred from page state changes
 * - No API calls required for task discovery
 *
 * CONSEQUENCE: quests with exclusively ms-search:// tasks will be skipped
 */
export class Quest extends Workers {
    constructor(bot: MicrosoftRewardsBot) {
        super(bot)
    }

    public async doQuests(page: Page): Promise<void> {
        this.bot.logger.info(this.bot.isMobile, 'QUEST', 'Starting Quest activity')

        const allQuests = new Map<string, QuestCard>()

        try {
            // Set desktop viewport FIRST (before navigation)
            try {
                await page.setViewportSize({ width: 1920, height: 1080 })
            } catch {
                /* ignore */
            }

            await page
                .goto('https://rewards.bing.com/earn', { waitUntil: 'domcontentloaded', timeout: 15000 })
                .catch(() => {})
            await this.bot.utils.wait(3000)

            // Scroll to trigger lazy loading
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {})
            await this.bot.utils.wait(3000)
            await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {})
            await this.bot.utils.wait(2000)

            // Search for all quest links
            const foundQuests = await this.findQuestLinks(page)

            // Also search raw HTML for quest links
            const html = await page.content()
            const htmlQuestMatches = html.matchAll(/href="(\/earn\/quest\/[^"]+)"/g)
            for (const match of htmlQuestMatches) {
                const href = match[1] ?? ''
                if (href && !allQuests.has(href)) {
                    allQuests.set(href, {
                        href,
                        title: 'Quest (from HTML)',
                        points: '?',
                        tasks: '?/?'
                    })
                    this.bot.logger.debug(this.bot.isMobile, 'QUEST', `Found in HTML: ${href}`)
                }
            }

            // Try known quest URLs (unique quests only)
            const knownQuestIds = ['ENstar_pcparent_FY26_WSB_Dec_punchcard']

            for (const questId of knownQuestIds) {
                const href = `/earn/quest/${questId}`
                if (allQuests.has(href)) continue

                try {
                    const response = await page
                        .goto(`https://rewards.bing.com${href}`, { waitUntil: 'domcontentloaded', timeout: 10000 })
                        .catch(() => null)
                    if (response && response.status() === 200) {
                        const questHtml = await page.content()
                        if (questHtml.includes(questId)) {
                            allQuests.set(href, {
                                href,
                                title: `Quest ${questId}`,
                                points: '?',
                                tasks: '?/?'
                            })
                            this.bot.logger.debug(this.bot.isMobile, 'QUEST', `Found via navigation: ${href}`)
                        }
                    }
                } catch {
                    /* ignore */
                }
            }

            for (const q of foundQuests) {
                if (!allQuests.has(q.href)) allQuests.set(q.href, q)
            }

            const questLinks = Array.from(allQuests.values())

            if (questLinks.length === 0) {
                this.bot.logger.info(this.bot.isMobile, 'QUEST', 'No quests found')
                return
            }

            this.bot.logger.info(this.bot.isMobile, 'QUEST', `Found ${questLinks.length} unique quest(s) total`)

            for (const quest of questLinks) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'QUEST',
                    `Processing: "${quest.title}" (${quest.points}, ${quest.tasks})`
                )
                await this.processQuest(page, quest)
            }

            this.bot.logger.info(this.bot.isMobile, 'QUEST', 'All quests processed', 'green')
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'QUEST',
                `Error: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async findQuestLinks(page: Page): Promise<QuestCard[]> {
        const quests: QuestCard[] = []
        const seenHrefs = new Set<string>()

        try {
            // Use JavaScript to find ALL elements with quest URLs across entire page
            const questData = await page
                .evaluate(() => {
                    const results: Array<{ href: string; text: string }> = []

                    // Search all <a> tags
                    document.querySelectorAll('a[href]').forEach(el => {
                        const href = el.getAttribute('href') ?? ''
                        if (href.includes('/earn/quest/') || href.includes('punchcard')) {
                            results.push({ href, text: el.textContent?.trim() ?? '' })
                        }
                    })

                    // Search all elements with onclick or data attributes containing quest URLs
                    document
                        .querySelectorAll('[onclick*="quest"], [data-href*="quest"], [data-url*="quest"]')
                        .forEach(el => {
                            const onclick = el.getAttribute('onclick') ?? ''
                            const dataHref = el.getAttribute('data-href') ?? ''
                            const dataUrl = el.getAttribute('data-url') ?? ''
                            const href = onclick || dataHref || dataUrl
                            if (href.includes('/earn/quest/')) {
                                results.push({ href, text: el.textContent?.trim() ?? '' })
                            }
                        })

                    return results
                })
                .catch(() => [])

            for (const item of questData) {
                const href = item.href
                if (!href || seenHrefs.has(href)) continue
                seenHrefs.add(href)

                const text = item.text
                const lines = text
                    .split('\n')
                    .map(l => l.trim())
                    .filter(Boolean)
                const title = lines.find(l => l.length > 20) || lines[0] || 'Unknown Quest'
                const pointsMatch = text.match(/\+(\d+)/)
                const tasksMatch = text.match(/(\d+\/\d+)\s*tasks?/i)

                quests.push({
                    href,
                    title,
                    points: pointsMatch?.[1] ? `+${pointsMatch[1]}` : '?',
                    tasks: tasksMatch?.[1] ?? '?/?'
                })

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'QUEST',
                    `Quest found: "${title.substring(0, 60)}..." | ${href}`
                )
            }

            this.bot.logger.debug(this.bot.isMobile, 'QUEST', `Found ${quests.length} unique quest(s) on page`)
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'QUEST',
                `Error finding quests: ${error instanceof Error ? error.message : String(error)}`
            )
        }

        return quests
    }

    private async processQuest(page: Page, quest: QuestCard): Promise<void> {
        try {
            const questId = quest.href.split('/').pop() || ''

            // Ensure desktop viewport
            try {
                await page.setViewportSize({ width: 1920, height: 1080 })
            } catch {
                /* ignore */
            }

            // Navigate to quest detail page
            await page.goto(quest.href, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})

            // Wait for page content to load
            await this.bot.utils.wait(2000)

            // Scroll to trigger lazy loading
            for (let i = 0; i < 5; i++) {
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {})
                await this.bot.utils.wait(1000)
                await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {})
                await this.bot.utils.wait(1000)
            }

            // Wait for task links to appear
            try {
                await page.waitForFunction(() => !!document.querySelectorAll('a[href*="bing.com/search"]').length, {
                    timeout: 15000
                })
            } catch {
                this.bot.logger.debug(this.bot.isMobile, 'QUEST', 'Timed out waiting for task links to appear')
            }

            // Additional wait for React/Vue components to fully render
            await this.bot.utils.wait(2000)

            // Use JavaScript to find ALL task links on the page
            let allLinks = await page
                .evaluate(() => {
                    const results: Array<{ href: string; text: string; ariaLabel: string }> = []

                    // Method 1: Direct attribute search for bing.com/search
                    document.querySelectorAll('a[href]').forEach(el => {
                        const href = el.getAttribute('href') ?? ''
                        const text = el.textContent?.trim() ?? ''
                        const ariaLabel = el.getAttribute('aria-label') ?? ''
                        if (href.includes('bing.com/search')) {
                            results.push({ href, text, ariaLabel })
                        }
                    })

                    // Method 2: Search in all elements' outer HTML as fallback
                    if (results.length === 0) {
                        document.querySelectorAll('[class*="button"], [class*="link"], div, span').forEach(el => {
                            const html = el.outerHTML ?? ''
                            if (html.includes('bing.com/search') && html.includes('<a')) {
                                const linkMatch = html.match(/href=["']([^"']*bing\.com\/search[^"']*)["']/g)
                                if (linkMatch) {
                                    linkMatch.forEach(match => {
                                        const href = match.replace(/^href=["']|["']$/g, '')
                                        const textEl = el.textContent?.trim() ?? ''
                                        if (href && !results.some(r => r.href === href)) {
                                            results.push({
                                                href,
                                                text: textEl,
                                                ariaLabel: el.getAttribute('aria-label') ?? ''
                                            })
                                        }
                                    })
                                }
                            }
                        })
                    }

                    return results
                })
                .catch(() => [])

            // If still no links found, try regex extraction
            if (allLinks.length === 0) {
                allLinks = await page
                    .evaluate(() => {
                        const results: Array<{ href: string; text: string; ariaLabel: string }> = []
                        const html = document.body.innerHTML

                        // Extract bing search URLs using regex
                        const bingMatches = html.matchAll(/href=["']([^"']*bing\.com\/search[^"']*)["']/g)
                        for (const match of bingMatches) {
                            const href = match[1] ?? ''
                            if (href && !results.some(r => r.href === href)) {
                                results.push({ href, text: '', ariaLabel: '' })
                            }
                        }

                        return results
                    })
                    .catch(() => [])
            }

            this.bot.logger.debug(this.bot.isMobile, 'QUEST', `Found ${allLinks.length} task links on ${questId} page`)

            if (allLinks.length === 0) {
                this.bot.logger.info(this.bot.isMobile, 'QUEST', `No available tasks for "${quest.title}"`)
                return
            }

            // Process each task link
            for (const link of allLinks) {
                const title = link.ariaLabel || link.text || 'Unknown'
                const cleanTitle = title
                    .replace(/^.*?,\s*/, '')
                    .replace(/\s*-\s*Click to complete\.?/i, '')
                    .replace(/\s*Click to complete\.?/i, '')
                    .trim()

                if (!cleanTitle || cleanTitle.length < 3) continue

                // Create task object
                const task: QuestTask = {
                    title: cleanTitle.substring(0, 150),
                    destination: link.href,
                    offerId: `task_${Date.now()}`,
                    isCompleted: false,
                    isLocked: false
                }

                this.bot.logger.info(this.bot.isMobile, 'QUEST-TASK', `Processing: "${cleanTitle}"`)
                await this.clickTask(page, task)

                const cooldown = this.bot.utils.randomDelay(8000, 15000)
                this.bot.logger.debug(this.bot.isMobile, 'QUEST-TASK', `Cooldown ${cooldown}ms`)
                await this.bot.utils.wait(cooldown)

                // Re-navigate to quest page for next task to refresh state
                try {
                    await page.goto(quest.href, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
                    await this.bot.utils.wait(2000)

                    // Scroll to trigger lazy loading again
                    for (let i = 0; i < 3; i++) {
                        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {})
                        await this.bot.utils.wait(500)
                        await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {})
                        await this.bot.utils.wait(500)
                    }

                    await this.bot.utils.wait(1000)
                } catch (e) {
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'QUEST',
                        `Failed to re-navigate to quest page: ${e instanceof Error ? e.message : String(e)}`
                    )
                }
            }
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'QUEST',
                `Error processing quest "${quest.title}": ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async clickTask(page: Page, task: QuestTask): Promise<void> {
        try {
            if (!task.destination) {
                this.bot.logger.warn(this.bot.isMobile, 'QUEST-TASK', `No URL for: "${task.title}"`)
                return
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'QUEST-TASK',
                `Attempting to click: "${task.title}" | ${task.destination.substring(0, 80)}`
            )

            // Find the link - try multiple strategies
            // NOTE: Only works for bing.com/search URLs (ms-search:// tasks never reach here)
            let linkElement: any = null

            // Strategy 1: Find by exact href match
            // Most reliable - exact URL from DOM
            try {
                linkElement = await page.locator(`a[href="${task.destination}"]`).first()
                const count = await linkElement.count().catch(() => 0)
                if (count > 0) {
                    this.bot.logger.debug(this.bot.isMobile, 'QUEST-TASK', 'Found by exact href match')
                }
            } catch {}

            // Strategy 2: If exact match fails, find by partial href (bing.com/search)
            if (!linkElement || (await linkElement.count().catch(() => 0)) === 0) {
                try {
                    linkElement = page.locator(`a[href*="bing.com/search"]`).first()
                    const count = await linkElement.count().catch(() => 0)
                    if (count > 0) {
                        this.bot.logger.debug(this.bot.isMobile, 'QUEST-TASK', 'Found by partial href match')
                    }
                } catch {}
            }

            // Strategy 3: Last resort - use JavaScript to simulate the click
            if (!linkElement || (await linkElement.count().catch(() => 0)) === 0) {
                this.bot.logger.debug(this.bot.isMobile, 'QUEST-TASK', 'Using JavaScript click simulation')
                await page
                    .evaluate(href => {
                        const link = Array.from(document.querySelectorAll('a[href]')).find(
                            el => el.getAttribute('href') === href
                        ) as HTMLAnchorElement | undefined
                        if (link) {
                            link.click()
                            return true
                        }
                        return false
                    }, task.destination)
                    .catch(() => false)

                await this.bot.utils.wait(3000)
                this.bot.logger.info(this.bot.isMobile, 'QUEST-TASK', `Clicked (JS): "${task.title}"`)
                return
            }

            // Now we have a valid linkElement, click it
            await linkElement.scrollIntoViewIfNeeded().catch(() => {})
            await this.bot.utils.wait(500)

            // Handle Bing search URLs - click and open new tab
            const [newPage] = await Promise.all([
                page
                    .context()
                    .waitForEvent('page', { timeout: 10000 })
                    .catch(() => null),
                linkElement.click({ delay: this.bot.utils.randomDelay(200, 500) }).catch(() => {})
            ])

            if (newPage) {
                await newPage.waitForLoadState('domcontentloaded').catch(() => {})
                this.bot.logger.info(
                    this.bot.isMobile,
                    'QUEST-TASK',
                    `Clicked: "${task.title}" → ${newPage.url().substring(0, 60)}...`
                )
                await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 8000))
                await newPage.close().catch(() => {})
            } else {
                await this.bot.utils.wait(this.bot.utils.randomDelay(3000, 5000))
                this.bot.logger.info(this.bot.isMobile, 'QUEST-TASK', `Clicked: "${task.title}" (same tab)`)
            }

            // Navigate back to earn page if needed
            if (!page.url().includes('/earn')) {
                await page
                    .goto('https://rewards.bing.com/earn', { waitUntil: 'networkidle', timeout: 15000 })
                    .catch(() => {})
                await this.bot.utils.wait(2000)
            }
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'QUEST-TASK',
                `Error: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }
}
