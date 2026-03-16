import type { Page } from 'patchright'
import type { MicrosoftRewardsBot } from '../index'
import type { DashboardData, PunchCard } from '../interface/DashboardData'

export class Workers {
    protected bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    public async doDailySet(data: DashboardData, page: Page) {
        // V4 MODERN UI LOGIC
        if (this.bot.rewardsVersion === 'modern' && (data as any).v4Data) {
            this.bot.logger.debug(this.bot.isMobile, 'DAILY-SET', 'Using Modern UI (V4) detection logic')
            const v4Data = (data as any).v4Data

            // Also try to get data from /earn page for additional activities
            let earnPageData = null
            try {
                await page
                    .goto('https://rewards.bing.com/earn', { waitUntil: 'networkidle', timeout: 15000 })
                    .catch(() => {})
                const earnHtml = await page.content()
                const earnNextData = this.bot.nextParser.parse(earnHtml)
                if (earnNextData.length > 0) {
                    earnPageData = earnNextData
                    this.bot.logger.debug(this.bot.isMobile, 'DAILY-SET', 'Fetched additional data from /earn page')
                }
            } catch (e) {
                this.bot.logger.debug(this.bot.isMobile, 'DAILY-SET', 'Could not fetch /earn page data')
            }

            // Combine both sources of data
            const combinedData = earnPageData ? [...v4Data, ...earnPageData] : v4Data

            // Get today's date in MM/DD/YYYY format (matching V4 API format)
            const today = new Date()
            const todayStr = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`

            // Filter by today's date and uncompleted status
            const dailySetItems = this.bot.nextParser.find(combinedData, 'dailySetItems') ?? []
            const todayItems = dailySetItems.filter((x: any) => x.date === todayStr)
            const uncompleted = todayItems.filter((x: any) => !x.isCompleted && x.points > 0)

            this.bot.logger.debug(
                this.bot.isMobile,
                'DAILY-SET',
                `Date: ${todayStr}, Found ${dailySetItems.length} total items, ${todayItems.length} for today, ${uncompleted.length} uncompleted`
            )

            // If no items from /earn page, also check all items (not just today)
            if (uncompleted.length === 0 && dailySetItems.length > 0) {
                const allUncompleted = dailySetItems.filter((x: any) => !x.isCompleted && x.points > 0)
                if (allUncompleted.length > 0) {
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'DAILY-SET',
                        `Found ${allUncompleted.length} uncompleted items (any date)`
                    )
                    const mapped = allUncompleted.map((x: any) => ({
                        title: x.title || 'Unknown Title',
                        offerId: x.offerId || 'Unknown ID',
                        destination: x.destination || x.destinationUrl,
                        complete: false,
                        pointProgressMax: x.points || x.pointProgressMax || 0
                    }))
                    await this.solveActivities(mapped, page)
                    return
                }
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'DAILY-SET',
                `Date: ${todayStr}, Found ${dailySetItems.length} total items, ${todayItems.length} for today, ${uncompleted.length} uncompleted`
            )

            if (uncompleted.length) {
                this.bot.logger.info(this.bot.isMobile, 'DAILY-SET', `Solving ${uncompleted.length} modern items`)
                const mapped = uncompleted.map((x: any) => ({
                    title: x.title || 'Unknown Title',
                    offerId: x.offerId || 'Unknown ID',
                    destination: x.destination || x.destinationUrl,
                    complete: false,
                    pointProgressMax: x.points || x.pointProgressMax || 0
                }))
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'DAILY-SET',
                    `Detected items: ${mapped.map((m: any) => `${m.title} (ID: ${m.offerId})`).join(', ')}`
                )
                await this.solveActivities(mapped, page)
            } else {
                this.bot.logger.info(this.bot.isMobile, 'DAILY-SET', 'All modern daily items already completed')
            }
            return
        }

        // V3 LEGACY LOGIC
        this.bot.logger.debug(this.bot.isMobile, 'DAILY-SET', 'Using Legacy UI (V3) detection logic')
        const todayKey = this.bot.utils.getFormattedDate()
        const todayData = data.dailySetPromotions?.[todayKey] ?? []
        const activitiesUncompleted = todayData.filter(x => !x?.complete && x.pointProgressMax > 0)

        if (activitiesUncompleted.length > 0) {
            this.bot.logger.info(
                this.bot.isMobile,
                'DAILY-SET',
                `Found ${activitiesUncompleted.length} uncompleted items`
            )
            await this.solveActivities(activitiesUncompleted, page)
        }
    }

    public async doMorePromotions(data: DashboardData, page: Page) {
        // V4 MODERN UI LOGIC
        if (this.bot.rewardsVersion === 'modern' && (data as any).v4Data) {
            this.bot.logger.debug(this.bot.isMobile, 'MORE-PROMOTIONS', 'Using Modern UI (V4) detection logic')
            const v4Data = (data as any).v4Data
            const moreActivities = this.bot.nextParser.find(v4Data, 'moreActivities') ?? []
            const uncompleted = moreActivities.filter((x: any) => !x.isCompleted && x.points > 0)

            if (uncompleted.length) {
                this.bot.logger.info(this.bot.isMobile, 'MORE-PROMOTIONS', `Solving ${uncompleted.length} modern items`)
                const mapped = uncompleted.map((x: any) => ({
                    title: x.title || 'Unknown Title',
                    offerId: x.offerId || 'Unknown ID',
                    destination: x.destination || x.destinationUrl,
                    complete: false,
                    pointProgressMax: x.points || x.pointProgressMax || 0
                }))
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'MORE-PROMOTIONS',
                    `Detected items: ${mapped.map((m: any) => `${m.title} (ID: ${m.offerId})`).join(', ')}`
                )
                await this.solveActivities(mapped, page)
            } else {
                this.bot.logger.info(this.bot.isMobile, 'MORE-PROMOTIONS', 'All modern more items already completed')
            }
            return
        }

        // V3 LEGACY LOGIC
        this.bot.logger.debug(this.bot.isMobile, 'MORE-PROMOTIONS', 'Using Legacy UI (V3) detection logic')
        const morePromotions = data.morePromotions ?? []
        const activitiesUncompleted = morePromotions.filter(x => !x?.complete && x.pointProgressMax > 0)

        if (activitiesUncompleted.length > 0) {
            this.bot.logger.info(
                this.bot.isMobile,
                'MORE-PROMOTIONS',
                `Found ${activitiesUncompleted.length} uncompleted items`
            )
            await this.solveActivities(activitiesUncompleted as any, page)
        }
    }

    public async doAppPromotions(data: any) {}

    protected async solveActivities(activities: any[], page: Page, punchCard?: PunchCard) {
        for (const activity of activities) {
            this.bot.logger.info(this.bot.isMobile, 'ACTIVITY', `Solving: ${activity.title}`)

            try {
                // Ensure we are on the dashboard
                if (!page.url().includes('rewards.bing.com')) {
                    await page
                        .goto('https://rewards.bing.com/', { waitUntil: 'networkidle', timeout: 20000 })
                        .catch(() => {})
                }

                const url = activity.destinationUrl ?? activity.destination

                if (url) {
                    // Optimized Desktop V4 Selectors
                    const selectors = [
                        `a[href*="${activity.offerId}"]`,
                        `a[data-bi-id*="${activity.offerId}"]`,
                        `a:has-text("${activity.title}")`,
                        `a:has-text("${activity.title.toLowerCase()}")`,
                        `div[role="button"]:has-text("${activity.title}")`,
                        `a[href*="${encodeURIComponent(url).substring(0, 15)}"]`
                    ]

                    let cardElement = null
                    for (const selector of selectors) {
                        try {
                            const elements = page.locator(selector)
                            const count = await elements.count()
                            for (let i = 0; i < count; i++) {
                                const el = elements.nth(i)
                                const text = await el.innerText().catch(() => '')
                                const href = await el.getAttribute('href').catch(() => null)
                                if (
                                    text.toLowerCase().includes(activity.title.toLowerCase()) ||
                                    (href && href.includes(activity.offerId))
                                ) {
                                    cardElement = el
                                    break
                                }
                            }
                            if (cardElement) break
                        } catch {}
                    }

                    if (cardElement) {
                        this.bot.logger.debug(this.bot.isMobile, 'ACTIVITY', `Card found for: ${activity.title}`)

                        await cardElement.scrollIntoViewIfNeeded().catch(() => {})
                        await this.bot.utils.wait(1000)

                        // DESKTOP SPECIFIC: Trigger human-like events
                        if (!this.bot.isMobile) {
                            await cardElement.hover().catch(() => {})
                            await this.bot.utils.wait(500)

                            // Manually dispatch events
                            await page
                                .evaluate(
                                    (sel: any) => {
                                        const el = document.querySelector(sel)
                                        if (el) {
                                            ;['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach(evt => {
                                                el.dispatchEvent(
                                                    new MouseEvent(evt, {
                                                        bubbles: true,
                                                        cancelable: true,
                                                        view: window
                                                    })
                                                )
                                            })
                                        }
                                    },
                                    (cardElement as any)._selector
                                )
                                .catch(() => {})
                        }

                        const [newPage] = await Promise.all([
                            page
                                .context()
                                .waitForEvent('page', { timeout: 10000 })
                                .catch(() => null),
                            cardElement.click({ delay: this.bot.utils.randomDelay(200, 500) }).catch(() => {
                                return page.evaluate(targetUrl => {
                                    window.open(targetUrl, '_blank')
                                }, url)
                            })
                        ])

                        if (newPage) {
                            await newPage.waitForLoadState('domcontentloaded').catch(() => {})
                            this.bot.logger.debug(
                                this.bot.isMobile,
                                'ACTIVITY',
                                `New tab opened for: ${activity.title}`
                            )
                            await this.bot.utils.wait(this.bot.utils.randomDelay(20000, 30000))
                            await newPage.close().catch(() => {})
                        } else {
                            await this.bot.utils.wait(this.bot.utils.randomDelay(15000, 25000))
                        }
                    } else {
                        this.bot.logger.warn(
                            this.bot.isMobile,
                            'ACTIVITY',
                            `Card NOT found on dashboard for: ${activity.title}. Navigating directly.`
                        )
                        await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {})
                        await this.bot.utils.wait(this.bot.utils.randomDelay(20000, 30000))
                    }
                }

                this.bot.logger.debug(this.bot.isMobile, 'ACTIVITY', `Finished attempt for: ${activity.title}`)
            } catch (error) {
                this.bot.logger.error(this.bot.isMobile, 'ACTIVITY', `Failed: ${activity.title}`)
            }
        }
    }

    public async doSpecialPromotions(data: DashboardData) {}
    public async doPunchCards(data: DashboardData, page: Page) {}
}
