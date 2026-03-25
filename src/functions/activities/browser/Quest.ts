import type { Page } from 'patchright'
import * as fs from 'fs'
import path from 'path'

import { Workers } from '../../Workers'
import type { MicrosoftRewardsBot } from '../../../index'

// These imports are used for file saving in debug mode
void fs
void path

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

export class Quest extends Workers {
    constructor(bot: MicrosoftRewardsBot) {
        super(bot)
    }

    public async doQuests(page: Page): Promise<void> {
        this.bot.logger.info(this.bot.isMobile, 'QUEST', 'Starting Quest activity')

        try {
            // IMPORTANT: Quest task links (ms-search:// and bing.com/search URLs) do not render in headless mode
            // even with proper viewport/user agent settings. This is a Microsoft-side rendering limitation.
            // Solution: Use API-based approach when headless mode is enabled
            if (this.bot.config.headless) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'QUEST',
                    'Headless mode detected - using API-based quest processing'
                )
                await this.doQuestsViaAPI(page)
                return
            }

            // Switch to desktop viewport and user agent BEFORE processing quests
            // This ensures Microsoft renders task links properly
            try {
                await page.setViewportSize({ width: 1920, height: 1080 })
                this.bot.logger.debug(this.bot.isMobile, 'QUEST', 'Set desktop viewport (1920x1080)')
            } catch {
                /* ignore */
            }

            // Set desktop user agent
            try {
                const desktopUA =
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36 Edg/146.0.3856.62'
                await (page.context() as any)._setExtraHTTPHeaders?.({ 'User-Agent': desktopUA })
                this.bot.logger.debug(this.bot.isMobile, 'QUEST', 'Set desktop user agent')
            } catch {
                /* ignore */
            }

            const allQuests = new Map<string, QuestCard>()

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

    private async doQuestsViaAPI(page: Page): Promise<void> {
        try {
            // Fetch dashboard data from API
            const dashboardData = await this.bot.browser.func.getDashboardData()

            if (!dashboardData.punchCards || dashboardData.punchCards.length === 0) {
                this.bot.logger.info(this.bot.isMobile, 'QUEST', 'No punchcards found in API response')
                return
            }

            this.bot.logger.info(
                this.bot.isMobile,
                'QUEST',
                `Found ${dashboardData.punchCards.length} punchcard(s) in API response`
            )

            // Process each punchcard's child promotions (quest tasks)
            for (const punchCard of dashboardData.punchCards) {
                if (!punchCard.childPromotions || punchCard.childPromotions.length === 0) {
                    continue
                }

                const questName = punchCard.name || 'Unknown Quest'
                this.bot.logger.info(
                    this.bot.isMobile,
                    'QUEST',
                    `Processing quest: "${questName}" with ${punchCard.childPromotions.length} task(s)`
                )

                // Process each task in the punchcard
                for (const task of punchCard.childPromotions) {
                    if (!task.destinationUrl) {
                        continue
                    }

                    // Skip completed tasks
                    if (task.complete) {
                        this.bot.logger.debug(this.bot.isMobile, 'QUEST', `Skipping completed task: "${task.title}"`)
                        continue
                    }

                    const taskTitle = task.title || 'Unknown Task'
                    const destination = task.destinationUrl

                    this.bot.logger.info(this.bot.isMobile, 'QUEST-TASK', `Processing: "${taskTitle}"`)

                    await this.processQuestTaskViaAPI(page, taskTitle, destination)

                    const cooldown = this.bot.utils.randomDelay(8000, 15000)
                    this.bot.logger.debug(this.bot.isMobile, 'QUEST-TASK', `Cooldown ${cooldown}ms`)
                    await this.bot.utils.wait(cooldown)
                }
            }

            this.bot.logger.info(this.bot.isMobile, 'QUEST', 'API-based quest processing completed', 'green')
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'QUEST',
                `API-based quest error: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async processQuestTaskViaAPI(page: Page, title: string, destination: string): Promise<void> {
        try {
            if (!destination) {
                this.bot.logger.warn(this.bot.isMobile, 'QUEST-TASK', `No destination URL for: "${title}"`)
                return
            }

            const isMsSearch = destination.startsWith('ms-search://')

            this.bot.logger.debug(this.bot.isMobile, 'QUEST-TASK', `Destination: ${destination.substring(0, 80)}`)

            if (isMsSearch) {
                // Handle ms-search:// URLs
                // Extract query parameter from ms-search URL
                const queryMatch = destination.match(/q=([^&]+)/)
                if (queryMatch) {
                    const query = decodeURIComponent(queryMatch[1] ?? '')
                    const bingSearchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`

                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'QUEST-TASK',
                        `Converted ms-search to Bing search: ${query}`
                    )

                    await page.goto(bingSearchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
                    await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 8000))

                    this.bot.logger.info(this.bot.isMobile, 'QUEST-TASK', `Completed: "${title}" (Bing search)`)
                } else {
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'QUEST-TASK',
                        `Could not extract query from ms-search URL: ${destination}`
                    )
                }
            } else if (destination.includes('bing.com/search')) {
                // Handle bing.com/search URLs - navigate directly
                await page.goto(destination, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
                await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 8000))

                this.bot.logger.info(this.bot.isMobile, 'QUEST-TASK', `Completed: "${title}" (Bing search)`)
            } else {
                // Handle other URLs
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'QUEST-TASK',
                    `Unknown destination type, attempting navigation: ${destination.substring(0, 60)}`
                )

                await page.goto(destination, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
                await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 8000))

                this.bot.logger.info(this.bot.isMobile, 'QUEST-TASK', `Completed: "${title}"`)
            }

            // Navigate back to earn page
            try {
                await page.goto('https://rewards.bing.com/earn', { waitUntil: 'domcontentloaded', timeout: 10000 })
                await this.bot.utils.wait(1000)
            } catch {
                // Ignore navigation errors
            }
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'QUEST-TASK',
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

            // Navigate to quest detail page with full networkidle wait to ensure all content loads
            const questUrl = `https://rewards.bing.com${quest.href}`
            this.bot.logger.debug(this.bot.isMobile, 'QUEST', `Navigating to: ${questUrl}`)

            try {
                await page.goto(questUrl, { waitUntil: 'networkidle', timeout: 30000 })
            } catch (e) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'QUEST',
                    `Navigation timeout or error: ${e instanceof Error ? e.message : String(e)}`
                )
                // Continue anyway
            }

            // Wait for page content to load (initial)
            await this.bot.utils.wait(3000)

            // --- Diagnostic instrumentation: capture page content, console, and network failures ---
            try {
                try {
                    fs.mkdirSync('./logs', { recursive: true })
                } catch {}

                page.on('console', msg => {
                    try {
                        this.bot.logger.debug(this.bot.isMobile, 'QUEST-DIAG', `PAGE_CONSOLE: ${msg.text()}`)
                    } catch {}
                })

                page.on('requestfailed', req => {
                    try {
                        this.bot.logger.warn(
                            this.bot.isMobile,
                            'QUEST-DIAG',
                            `REQUEST_FAILED: ${req.url()} ${req.failure()?.errorText ?? ''}`
                        )
                    } catch {}
                })

                const snapshot = await page.content().catch(() => '')
                try {
                    const fname = `./logs/quest-${questId}-${Date.now()}-headless-${String(this.bot.config.headless)}.html`
                    fs.writeFileSync(fname, snapshot)
                    this.bot.logger.info(this.bot.isMobile, 'QUEST-DIAG', `Wrote quest HTML snapshot: ${fname}`)
                } catch (e) {
                    this.bot.logger.warn(this.bot.isMobile, 'QUEST-DIAG', `Failed writing snapshot: ${String(e)}`)
                }

                const diagnostics = await page
                    .evaluate(() => {
                        return {
                            bodyLength: document.body.innerHTML.length,
                            totalAnchorTags: document.querySelectorAll('a').length,
                            msSearchLinks: Array.from(document.querySelectorAll('a[href^="ms-search://"]')).map(a =>
                                a.getAttribute('href')
                            ),
                            bingSearchLinks: Array.from(document.querySelectorAll('a[href*="bing.com/search"]')).map(
                                a => a.getAttribute('href')
                            ),
                            visibleText: document.body.innerText.substring(0, 500)
                        }
                    })
                    .catch(() => ({
                        bodyLength: 0,
                        totalAnchorTags: 0,
                        msSearchLinks: [],
                        bingSearchLinks: [],
                        visibleText: 'Error collecting diagnostics'
                    }))

                this.bot.logger.info(
                    this.bot.isMobile,
                    'QUEST-DIAG',
                    `HTML body length: ${diagnostics.bodyLength} bytes | Total <a> tags: ${diagnostics.totalAnchorTags} | ms-search: ${diagnostics.msSearchLinks.length} | bing search: ${diagnostics.bingSearchLinks.length}`
                )
                if (
                    (diagnostics.msSearchLinks as string[]).length > 0 ||
                    (diagnostics.bingSearchLinks as string[]).length > 0
                ) {
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'QUEST-DIAG',
                        `Task links found: ms-search=[${(diagnostics.msSearchLinks as string[]).length}] bing=[${(diagnostics.bingSearchLinks as string[]).length}]`
                    )
                }
            } catch (diagErr) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'QUEST-DIAG',
                    `Diagnostic error: ${diagErr instanceof Error ? diagErr.message : String(diagErr)}`
                )
            }

            // Scroll to trigger lazy loading and wait for ms-search links to appear
            for (let i = 0; i < 5; i++) {
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {})
                await this.bot.utils.wait(1500)
                await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {})
                await this.bot.utils.wait(1500)
            }

            // Additional aggressive waiting for React/Next.js hydration
            await this.bot.utils.wait(3000)

            // Wait for task links using multiple detection patterns
            const linkWaitStart = Date.now()
            let linksFound = false
            while (Date.now() - linkWaitStart < 20000) {
                const hasLinks = await page
                    .evaluate(() => {
                        return (
                            document.querySelectorAll('a[href*="ms-search://"]').length > 0 ||
                            document.querySelectorAll('a[href*="bing.com/search"]').length > 0
                        )
                    })
                    .catch(() => false)

                if (hasLinks) {
                    linksFound = true
                    this.bot.logger.debug(this.bot.isMobile, 'QUEST', 'Task links detected')
                    break
                }

                await this.bot.utils.wait(500)
            }

            if (!linksFound) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'QUEST',
                    'Timed out waiting for task links (will attempt regex extraction)'
                )
            }

            // Use JavaScript to find ALL links on the page with robust detection
            let allLinks = await page
                .evaluate(() => {
                    const results: Array<{ href: string; text: string; ariaLabel: string }> = []

                    // Method 1: Direct attribute search
                    document.querySelectorAll('a[href]').forEach(el => {
                        const href = el.getAttribute('href') ?? ''
                        const text = el.textContent?.trim() ?? ''
                        const ariaLabel = el.getAttribute('aria-label') ?? ''
                        // Filter for task-like links (bing search or ms-search)
                        if (href.includes('bing.com/search') || href.includes('ms-search://')) {
                            results.push({ href, text, ariaLabel })
                        }
                    })

                    // Method 2: Search in all elements' outer HTML as fallback for headless mode
                    if (results.length === 0) {
                        document.querySelectorAll('[class*="button"], [class*="link"], div, span').forEach(el => {
                            const html = el.outerHTML ?? ''
                            if (
                                (html.includes('ms-search://') || html.includes('bing.com/search')) &&
                                html.includes('<a')
                            ) {
                                const linkMatch = html.match(/href=["']([^"']*(?:ms-search|bing\.com)[^"']*)["']/g)
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

            // If still no links found, try one more aggressive search
            if (allLinks.length === 0) {
                allLinks = await page
                    .evaluate(() => {
                        const results: Array<{ href: string; text: string; ariaLabel: string }> = []
                        const html = document.body.innerHTML

                        // Extract ms-search URLs using regex
                        const msSearchMatches = html.matchAll(/href=["']([^"']*ms-search:\/\/[^"']*)["']/g)
                        for (const match of msSearchMatches) {
                            const href = match[1] ?? ''
                            if (href && !results.some(r => r.href === href)) {
                                results.push({ href, text: '', ariaLabel: '' })
                            }
                        }

                        // Extract bing search URLs
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

            const isMsSearch = task.destination.startsWith('ms-search://')

            this.bot.logger.debug(
                this.bot.isMobile,
                'QUEST-TASK',
                `Attempting to click: "${task.title}" | ${task.destination.substring(0, 80)}`
            )

            // Find the link - try multiple strategies
            let linkElement: any = null

            // Strategy 1: Find by exact href match
            try {
                linkElement = await page.locator(`a[href="${task.destination}"]`).first()
                const count = await linkElement.count().catch(() => 0)
                if (count > 0) {
                    this.bot.logger.debug(this.bot.isMobile, 'QUEST-TASK', 'Found by exact href match')
                }
            } catch {}

            // Strategy 2: If exact match fails, find by partial href
            if (!linkElement || (await linkElement.count().catch(() => 0)) === 0) {
                try {
                    if (isMsSearch) {
                        // For ms-search, extract the query parameter to match
                        const queryMatch = task.destination.match(/q=([^&]+)/)
                        if (queryMatch) {
                            const query = queryMatch[1] ?? ''
                            linkElement = page.locator(`a[href*="ms-search://"][href*="${query}"]`).first()
                        } else {
                            linkElement = page.locator(`a[href*="ms-search://"]`).first()
                        }
                    } else {
                        linkElement = page.locator(`a[href*="bing.com/search"]`).first()
                    }
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

                if (isMsSearch) {
                    // For ms-search, still need to handle dialog
                    await this.bot.utils.wait(1000)
                } else {
                    // For bing search, just wait
                    await this.bot.utils.wait(3000)
                }

                this.bot.logger.info(this.bot.isMobile, 'QUEST-TASK', `Clicked (JS): "${task.title}"`)
                return
            }

            // Now we have a valid linkElement, click it
            await linkElement.scrollIntoViewIfNeeded().catch(() => {})
            await this.bot.utils.wait(500)

            if (isMsSearch) {
                // Handle ms-search:// URLs - click and dismiss alert dialog
                const dialogHandler = async (dialog: any) => {
                    this.bot.logger.debug(this.bot.isMobile, 'QUEST-TASK', `Dialog detected: ${dialog.message()}`)
                    await dialog.dismiss().catch(() => {})
                    this.bot.logger.debug(this.bot.isMobile, 'QUEST-TASK', 'Dialog dismissed')
                }
                page.on('dialog', dialogHandler)

                try {
                    await linkElement.click({ delay: this.bot.utils.randomDelay(200, 500) }).catch(() => {})
                    await this.bot.utils.wait(2000)
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'QUEST-TASK',
                        `Clicked: "${task.title}" (ms-search, alert dismissed)`
                    )
                } finally {
                    page.off('dialog', dialogHandler)
                }
            } else {
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
