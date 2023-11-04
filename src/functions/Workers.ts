import { Page } from 'puppeteer'

import { DashboardData, MorePromotion, PromotionalItem, PunchCard } from '../interface/DashboardData'

import { MicrosoftRewardsBot } from '../index'

export class Workers {
    public bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    // Daily Set
    async doDailySet(page: Page, data: DashboardData) {
        const todayData = data.dailySetPromotions[this.bot.utils.getFormattedDate()]

        const activitiesUncompleted = todayData?.filter(x => !x.complete && x.pointProgressMax > 0) ?? []

        if (!activitiesUncompleted.length) {
            this.bot.log('DAILY-SET', 'All Daily Set" items have already been completed')
            return
        }

        // Solve Activities
        this.bot.log('DAILY-SET', 'Started solving "Daily Set" items')

        await this.solveActivities(page, activitiesUncompleted)

        this.bot.log('DAILY-SET', 'All "Daily Set" items have been completed')
    }

    // Punch Card
    async doPunchCard(page: Page, data: DashboardData) {

        const punchCardsUncompleted = data.punchCards?.filter(x => !x.parentPromotion.complete) ?? [] // Only return uncompleted punch cards

        if (!punchCardsUncompleted.length) {
            this.bot.log('PUNCH-CARD', 'All "Punch Cards" have already been completed')
            return
        }

        for (const punchCard of punchCardsUncompleted) {
            const activitiesUncompleted = punchCard.childPromotions.filter(x => !x.complete) // Only return uncompleted activities

            // Solve Activities
            this.bot.log('PUNCH-CARD', `Started solving "Punch Card" items for punchcard: "${punchCard.parentPromotion.title}"`)

            const browser = page.browser()
            page = await browser.newPage()

            // Got to punch card index page in a new tab
            await page.goto(punchCard.parentPromotion.destinationUrl, { referer: this.bot.config.baseURL })

            // Wait for new page to load, max 10 seconds, however try regardless in case of error
            await page.waitForNetworkIdle({ timeout: 10_000 }).catch(() => { })

            await this.solveActivities(page, activitiesUncompleted, punchCard)

            // Close the punch card index page
            await page.close()

            this.bot.log('PUNCH-CARD', `All items for punchcard: "${punchCard.parentPromotion.title}" have been completed`)
        }

        this.bot.log('PUNCH-CARD', 'All "Punch Card" items have been completed')
    }

    // More Promotions
    async doMorePromotions(page: Page, data: DashboardData) {
        const morePromotions = data.morePromotions

        // Check if there is a promotional item
        if (data.promotionalItem) { // Convert and add the promotional item to the array
            morePromotions.push(data.promotionalItem as unknown as MorePromotion)
        }

        const activitiesUncompleted = morePromotions?.filter(x => !x.complete && x.pointProgressMax > 0) ?? []

        if (!activitiesUncompleted.length) {
            this.bot.log('MORE-PROMOTIONS', 'All "More Promotion" items have already been completed')
            return
        }

        // Solve Activities
        this.bot.log('MORE-PROMOTIONS', 'Started solving "More Promotions" item')

        await this.solveActivities(page, activitiesUncompleted)

        this.bot.log('MORE-PROMOTIONS', 'All "More Promotion" items have been completed')
    }

    // Solve all the different types of activities
    private async solveActivities(page: Page, activities: PromotionalItem[] | MorePromotion[], punchCard?: PunchCard) {
        for (const activity of activities) {
            try {

                let selector = `[data-bi-id="${activity.offerId}"]`

                if (punchCard) {
                    selector = await this.bot.browser.func.getPunchCardActivity(page, activity)

                } else if (activity.name.toLowerCase().includes('membercenter')) {

                    // Promotion
                    if (activity.priority === 1) {
                        selector = await page.waitForSelector('#promo-item', { visible: true, timeout: 2000 }).then(() => true).catch(() => false) ?
                            '#promo-item' : activity.name
                    } else {
                        selector = `[data-bi-id="${activity.name}"]`
                    }
                }

                // Wait for element to load
                await page.waitForSelector(selector, { timeout: 10_000 })

                // Click element, it will be opened in a new tab
                page.click(selector)

                // Select the new activity page
                const activityPage = await this.bot.browser.utils.getLatestTab(page)

                // Wait for the new tab to fully load, ignore error.
                /*
                Due to common false timeout on this function, we're ignoring the error regardless, if it worked then it's faster, 
                if it didn't then it gave enough time for the page to load.
                */
                await activityPage.waitForNetworkIdle({ timeout: 10_000 }).catch(() => { })

                // Cooldown
                await this.bot.utils.wait(4000)

                switch (activity.promotionType) {
                    // Quiz (Poll, Quiz or ABC)
                    case 'quiz':
                        switch (activity.pointProgressMax) {
                            // Poll or ABC (Usually 10 points)
                            case 10:
                                // Normal poll
                                if (activity.destinationUrl.toLowerCase().includes('pollscenarioid')) {
                                    this.bot.log('ACTIVITY', `Found activity type: "Poll" title: "${activity.title}"`)
                                    await this.bot.activities.doPoll(activityPage)
                                } else { // ABC
                                    this.bot.log('ACTIVITY', `Found activity type: "ABC" title: "${activity.title}"`)
                                    await this.bot.activities.doABC(activityPage)
                                }
                                break

                            // This Or That Quiz (Usually 50 points)
                            case 50:
                                this.bot.log('ACTIVITY', `Found activity type: "ThisOrThat" title: "${activity.title}"`)
                                await this.bot.activities.doThisOrThat(activityPage)
                                break

                            // Quizzes are usually 30-40 points
                            default:
                                this.bot.log('ACTIVITY', `Found activity type: "Quiz" title: "${activity.title}"`)
                                await this.bot.activities.doQuiz(activityPage)
                                break
                        }
                        break

                    // UrlReward (Visit)
                    case 'urlreward':
                        this.bot.log('ACTIVITY', `Found activity type: "UrlReward" title: "${activity.title}"`)
                        await this.bot.activities.doUrlReward(activityPage)
                        break

                    // Misc, Usually UrlReward Type
                    default:
                        this.bot.log('ACTIVITY', `Found activity type: "Misc" title: "${activity.title}"`)
                        await this.bot.activities.doUrlReward(activityPage)
                        break
                }

                // Cooldown
                await this.bot.utils.wait(2000)
            } catch (error) {
                this.bot.log('ACTIVITY', 'An error occurred:' + error, 'error')
            }
        }
    }

}