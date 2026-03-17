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
                        hash: x.hash || '',
                        type: x.type || x.activityType || '',
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
                    hash: x.hash || '',
                    type: x.type || x.activityType || '',
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

                            // Try to complete via API for V4
                            if (activity.hash && this.bot.rewardsVersion === 'modern') {
                                await this.completeActivityV4(activity, newPage)
                            }

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

                        // Try to complete via API for V4
                        if (activity.hash && this.bot.rewardsVersion === 'modern') {
                            await this.completeActivityV4(activity, page)
                        }

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

    private async completeActivityV4(activity: any, page: Page): Promise<boolean> {
        const offerId = activity.offerId

        if (!offerId) {
            this.bot.logger.warn(this.bot.isMobile, 'ACTIVITY-V4', 'No offerId found')
            return false
        }

        this.bot.logger.info(this.bot.isMobile, 'ACTIVITY-V4', `Completing: ${activity.title} (${offerId})`)

        try {
            const url = activity.destination || activity.destinationUrl
            if (url) {
                // For URL activities, just visiting the page may complete them
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {})

                // Wait for page to load and any potential auto-complete
                await this.bot.utils.wait(3000)

                // Check if it's a quiz/poll that needs interaction
                const pageText = await page.innerText('body').catch(() => '')

                // If it's a quiz/poll, try to find and click answers (basic)
                if (pageText.toLowerCase().includes('quiz') || pageText.toLowerCase().includes('poll')) {
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'ACTIVITY-V4',
                        'Detected quiz/poll, attempting interaction'
                    )
                    // Try clicking common quiz buttons
                    await page.click('button, [role="button"]', { timeout: 2000 }).catch(() => {})
                    await this.bot.utils.wait(2000)
                }

                this.bot.logger.info(
                    this.bot.isMobile,
                    'ACTIVITY-V4',
                    `Completed (URL visited): ${activity.title}`,
                    'green'
                )
                return true
            }

            // No URL - try API
            const panelData = this.bot.panelData
            const todayKey = this.bot.utils.getFormattedDate()

            const panelPromotion =
                panelData?.flyoutResult?.morePromotions?.find(p => p.offerId === offerId) ||
                panelData?.flyoutResult?.dailySetPromotions?.[todayKey]?.find(p => p.offerId === offerId)

            // Try desktop API endpoint (form data) - works for URL activities
            const formData = new URLSearchParams({
                id: offerId,
                hash: activity.hash || panelPromotion?.hash || '',
                timeZone: '60',
                activityAmount: '1',
                dbs: '0',
                form: '',
                type: '',
                __RequestVerificationToken: ''
            })

            const context = page.context() as any
            const cookies = await context.cookies()
            const cookieHeader = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ')

            const request: any = {
                url: 'https://rewards.bing.com/api/reportactivity?X-Requested-With=XMLHttpRequest',
                method: 'POST',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {}),
                    Cookie: cookieHeader,
                    Referer: 'https://rewards.bing.com/',
                    Origin: 'https://rewards.bing.com',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                data: formData.toString()
            }

            const response = await this.bot.axios.request(request)

            if (response.status === 200) {
                const result = response.data

                // Check for V3/V4 success format
                const earnedCredits = result?.EarnedCredits || result?.earnedCredits || 0
                const activityComplete = result?.ActivityComplete || result?.activityComplete || false
                const errorCode = result?.ErrorDetail?.ErrorCode || result?.errorDetail?.errorCode
                const v3ResultCode = result?.result?.resultCode ?? result?.resultCode

                if (
                    activityComplete ||
                    earnedCredits > 0 ||
                    errorCode === 'I_SUCCESS' ||
                    errorCode === 0 ||
                    v3ResultCode === 0
                ) {
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'ACTIVITY-V4',
                        `Completed: ${activity.title} | +${earnedCredits} points`,
                        'green'
                    )
                    return true
                }
            }

            this.bot.logger.warn(
                this.bot.isMobile,
                'ACTIVITY-V4',
                `API returned status ${response.status} for: ${activity.title}`
            )
            return false
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'ACTIVITY-V4',
                `Failed to complete: ${activity.title} - ${error instanceof Error ? error.message : String(error)}`
            )
            const axiosError = error as any
            if (axiosError.response?.data) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'ACTIVITY-V4',
                    `Response: ${JSON.stringify(axiosError.response.data)}`
                )
            }
            return false
        }
    }
}
