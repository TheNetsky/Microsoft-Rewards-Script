import { Page } from 'rebrowser-playwright'

import { DashboardData, MorePromotion, PromotionalItem, PunchCard } from '../interface/DashboardData'

import { MicrosoftRewardsBot } from '../index'
import JobState from '../util/JobState'
import Retry from '../util/Retry'
import { AdaptiveThrottler } from '../util/AdaptiveThrottler'

export class Workers {
    public bot: MicrosoftRewardsBot
    private jobState: JobState

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
        this.jobState = new JobState(this.bot.config)
    }

    // Daily Set
    async doDailySet(page: Page, data: DashboardData) {
        const todayData = data.dailySetPromotions[this.bot.utils.getFormattedDate()]

        const today = this.bot.utils.getFormattedDate()
        const activitiesUncompleted = (todayData?.filter(x => !x.complete && x.pointProgressMax > 0) ?? [])
            .filter(x => {
                if (this.bot.config.jobState?.enabled === false) return true
                const email = this.bot.currentAccountEmail || 'unknown'
                return !this.jobState.isDone(email, today, x.offerId)
            })

        if (!activitiesUncompleted.length) {
            this.bot.log(this.bot.isMobile, 'DAILY-SET', 'All Daily Set" items have already been completed')
            return
        }

        // Solve Activities
        this.bot.log(this.bot.isMobile, 'DAILY-SET', 'Started solving "Daily Set" items')

        await this.solveActivities(page, activitiesUncompleted)

        // Mark as done to prevent duplicate work if checkpoints enabled
        if (this.bot.config.jobState?.enabled !== false) {
            const email = this.bot.currentAccountEmail || 'unknown'
            for (const a of activitiesUncompleted) {
                this.jobState.markDone(email, today, a.offerId)
            }
        }

        page = await this.bot.browser.utils.getLatestTab(page)

        // Always return to the homepage if not already
        await this.bot.browser.func.goHome(page)

        this.bot.log(this.bot.isMobile, 'DAILY-SET', 'All "Daily Set" items have been completed')

        // Optional: immediately run desktop search bundle
        if (!this.bot.isMobile && this.bot.config.workers.bundleDailySetWithSearch && this.bot.config.workers.doDesktopSearch) {
            try {
                await this.bot.utils.waitRandom(1200, 2600)
                await this.bot.activities.doSearch(page, data)
            } catch (e) {
                this.bot.log(this.bot.isMobile, 'DAILY-SET', `Post-DailySet search failed: ${e instanceof Error ? e.message : e}`, 'warn')
            }
        }
    }

    // Punch Card
    async doPunchCard(page: Page, data: DashboardData) {

        const punchCardsUncompleted = data.punchCards?.filter(x => x.parentPromotion && !x.parentPromotion.complete) ?? [] // Only return uncompleted punch cards

        if (!punchCardsUncompleted.length) {
            this.bot.log(this.bot.isMobile, 'PUNCH-CARD', 'All "Punch Cards" have already been completed')
            return
        }

        for (const punchCard of punchCardsUncompleted) {

            // Ensure parentPromotion exists before proceeding
            if (!punchCard.parentPromotion?.title) {
                this.bot.log(this.bot.isMobile, 'PUNCH-CARD', `Skipped punchcard "${punchCard.name}" | Reason: Parent promotion is missing!`, 'warn')
                continue
            }

            // Get latest page for each card
            page = await this.bot.browser.utils.getLatestTab(page)

            const activitiesUncompleted = punchCard.childPromotions.filter(x => !x.complete) // Only return uncompleted activities

            // Solve Activities
            this.bot.log(this.bot.isMobile, 'PUNCH-CARD', `Started solving "Punch Card" items for punchcard: "${punchCard.parentPromotion.title}"`)

            // Got to punch card index page in a new tab
            await page.goto(punchCard.parentPromotion.destinationUrl, { referer: this.bot.config.baseURL })

            // Wait for new page to load, max 10 seconds, however try regardless in case of error
            await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { })

            await this.solveActivities(page, activitiesUncompleted, punchCard)

            page = await this.bot.browser.utils.getLatestTab(page)

            const pages = page.context().pages()

            if (pages.length > 3) {
                await page.close()
            } else {
                await this.bot.browser.func.goHome(page)
            }

            this.bot.log(this.bot.isMobile, 'PUNCH-CARD', `All items for punchcard: "${punchCard.parentPromotion.title}" have been completed`)
        }

        this.bot.log(this.bot.isMobile, 'PUNCH-CARD', 'All "Punch Card" items have been completed')
    }

    // More Promotions
    async doMorePromotions(page: Page, data: DashboardData) {
        const morePromotions = data.morePromotions

        // Check if there is a promotional item
        if (data.promotionalItem) { // Convert and add the promotional item to the array
            morePromotions.push(data.promotionalItem as unknown as MorePromotion)
        }

        const activitiesUncompleted = morePromotions?.filter(x => !x.complete && x.pointProgressMax > 0 && x.exclusiveLockedFeatureStatus !== 'locked') ?? []

        if (!activitiesUncompleted.length) {
            this.bot.log(this.bot.isMobile, 'MORE-PROMOTIONS', 'All "More Promotion" items have already been completed')
            return
        }

        // Solve Activities
        this.bot.log(this.bot.isMobile, 'MORE-PROMOTIONS', 'Started solving "More Promotions" items')

        page = await this.bot.browser.utils.getLatestTab(page)

        await this.solveActivities(page, activitiesUncompleted)

        page = await this.bot.browser.utils.getLatestTab(page)

        // Always return to the homepage if not already
        await this.bot.browser.func.goHome(page)

        this.bot.log(this.bot.isMobile, 'MORE-PROMOTIONS', 'All "More Promotion" items have been completed')
    }

    // Solve all the different types of activities
    private async solveActivities(activityPage: Page, activities: PromotionalItem[] | MorePromotion[], punchCard?: PunchCard) {
        const activityInitial = activityPage.url()
        const retry = new Retry(this.bot.config.retryPolicy)
        const throttle = new AdaptiveThrottler()

        for (const activity of activities) {
            try {
                activityPage = await this.manageTabLifecycle(activityPage, activityInitial)
                await this.applyThrottle(throttle, 800, 1400)

                const selector = await this.buildActivitySelector(activityPage, activity, punchCard)
                await this.prepareActivityPage(activityPage, selector, throttle)

                const typeLabel = this.bot.activities.getTypeLabel(activity)
                if (typeLabel !== 'Unsupported') {
                    await this.executeActivity(activityPage, activity, selector, throttle, retry)
                } else {
                    this.bot.log(this.bot.isMobile, 'ACTIVITY', `Skipped activity "${activity.title}" | Reason: Unsupported type: "${activity.promotionType}"!`, 'warn')
                }

                await this.applyThrottle(throttle, 1200, 2600)
            } catch (error) {
                await this.bot.browser.utils.captureDiagnostics(activityPage, `activity_error_${activity.title || activity.offerId}`)
                this.bot.log(this.bot.isMobile, 'ACTIVITY', 'An error occurred:' + error, 'error')
                throttle.record(false)
            }
        }
    }

    private async manageTabLifecycle(page: Page, initialUrl: string): Promise<Page> {
        page = await this.bot.browser.utils.getLatestTab(page)

        const pages = page.context().pages()
        if (pages.length > 3) {
            await page.close()
            page = await this.bot.browser.utils.getLatestTab(page)
        }

        if (page.url() !== initialUrl) {
            await page.goto(initialUrl)
        }

        return page
    }

    private async buildActivitySelector(page: Page, activity: PromotionalItem | MorePromotion, punchCard?: PunchCard): Promise<string> {
        if (punchCard) {
            return await this.bot.browser.func.getPunchCardActivity(page, activity)
        }

        const name = activity.name.toLowerCase()
        if (name.includes('membercenter') || name.includes('exploreonbing')) {
            return `[data-bi-id^="${activity.name}"] .pointLink:not(.contentContainer .pointLink)`
        }

        return `[data-bi-id^="${activity.offerId}"] .pointLink:not(.contentContainer .pointLink)`
    }

    private async prepareActivityPage(page: Page, selector: string, throttle: AdaptiveThrottler): Promise<void> {
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
        await this.bot.browser.utils.humanizePage(page)
        await this.applyThrottle(throttle, 1200, 2600)
    }

    private async executeActivity(page: Page, activity: PromotionalItem | MorePromotion, selector: string, throttle: AdaptiveThrottler, retry: Retry): Promise<void> {
        this.bot.log(this.bot.isMobile, 'ACTIVITY', `Found activity type: "${this.bot.activities.getTypeLabel(activity)}" title: "${activity.title}"`)
        
        await page.click(selector)
        page = await this.bot.browser.utils.getLatestTab(page)

        const timeoutMs = this.bot.utils.stringToMs(this.bot.config?.globalTimeout ?? '30s') * 2
        const runWithTimeout = (p: Promise<void>) => Promise.race([
            p,
            new Promise<void>((_, rej) => setTimeout(() => rej(new Error('activity-timeout')), timeoutMs))
        ])

        await retry.run(async () => {
            try {
                await runWithTimeout(this.bot.activities.run(page, activity))
                throttle.record(true)
            } catch (e) {
                await this.bot.browser.utils.captureDiagnostics(page, `activity_timeout_${activity.title || activity.offerId}`)
                throttle.record(false)
                throw e
            }
        }, () => true)

        await this.bot.browser.utils.humanizePage(page)
    }

    private async applyThrottle(throttle: AdaptiveThrottler, min: number, max: number): Promise<void> {
        const multiplier = throttle.getDelayMultiplier()
        await this.bot.utils.waitRandom(Math.floor(min * multiplier), Math.floor(max * multiplier))
    }

}