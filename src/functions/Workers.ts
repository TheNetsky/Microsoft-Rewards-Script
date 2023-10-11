import { Page } from 'puppeteer'

import { doPoll } from './activities/Poll'
import { doQuiz } from './activities/Quiz'
import { doUrlReward } from './activities/UrlReward'
import { doThisOrThat } from './activities/ThisOrThat'
import { doABC } from './activities/ABC'

import { getPunchCardActivity } from '../browser/BrowserFunc'
import { getLatestTab } from '../browser/BrowserUtil'

import { getFormattedDate, wait } from '../util/Utils'
import { log } from '../util/Logger'

import { DashboardData, MorePromotion, PromotionalItem, PunchCard } from '../interface/DashboardData'


// Daily Set
export async function doDailySet(page: Page, data: DashboardData) {

    const todayData = data.dailySetPromotions[getFormattedDate()]

    const activitiesUncompleted = todayData?.filter(x => !x.complete && x.pointProgressMax > 0) ?? []

    if (!activitiesUncompleted.length) {
        log('DAILY-SET', 'All Daily Set" items have already been completed')
        return
    }

    // Solve Activities
    log('DAILY-SET', 'Started solving "Daily Set" items')

    await solveActivities(page, activitiesUncompleted)

    log('DAILY-SET', 'All "Daily Set" items have been completed')
}

// Punch Card
export async function doPunchCard(page: Page, data: DashboardData) {

    const punchCardsUncompleted = data.punchCards?.filter(x => !x.parentPromotion.complete) ?? [] // Only return uncompleted punch cards

    if (!punchCardsUncompleted.length) {
        log('PUNCH-CARD', 'All "Punch Cards" have already been completed')
        return
    }

    for (const punchCard of punchCardsUncompleted) {
        const activitiesUncompleted = punchCard.childPromotions.filter(x => !x.complete) // Only return uncompleted activities

        // Solve Activities
        log('PUNCH-CARD', `Started solving "Punch Card" items for punchcard: "${punchCard.parentPromotion.title}"`)

        const browser = page.browser()
        page = await browser.newPage()

        // Got to punch card index page in a new tab
        await page.goto(punchCard.parentPromotion.destinationUrl, { referer: 'https://rewards.bing.com/' })

        await solveActivities(page, activitiesUncompleted, punchCard)

        // Close the punch card index page
        await page.close()

        log('PUNCH-CARD', `All items for punchcard: "${punchCard.parentPromotion.title}" have been completed`)
    }

    log('PUNCH-CARD', 'All "Punch Card" items have been completed')
}

// More Promotions
export async function doMorePromotions(page: Page, data: DashboardData) {
    const morePromotions = data.morePromotions

    // Check if there is a promotional item
    if (data.promotionalItem) { // Convert and add the promotional item to the array
        morePromotions.push(data.promotionalItem as unknown as MorePromotion)
    }

    const activitiesUncompleted = morePromotions?.filter(x => !x.complete && x.pointProgressMax > 0) ?? []

    if (!activitiesUncompleted.length) {
        log('MORE-PROMOTIONS', 'All "More Promotion" items have already been completed')
        return
    }

    // Solve Activities
    log('MORE-PROMOTIONS', 'Started solving "More Promotions" item')

    await solveActivities(page, activitiesUncompleted)

    log('MORE-PROMOTIONS', 'All "More Promotion" items have been completed')
}

// Solve all the different types of activities
async function solveActivities(page: Page, activities: PromotionalItem[] | MorePromotion[], punchCard?: PunchCard) {
    try {
        for (const activity of activities) {

            if (punchCard) {
                const selector = await getPunchCardActivity(page, activity)

                // Wait for page to load and click to load the activity in a new tab
                await page.waitForSelector(selector, { timeout: 5000 })
                await page.click(selector)

            } else {
                const selector = `[data-bi-id="${activity.offerId}"]`

                // Wait for page to load and click to load the activity in a new tab
                await page.waitForSelector(selector, { timeout: 5000 })
                await page.click(selector)
            }

            // Select the new activity page
            const activityPage = await getLatestTab(page)

            switch (activity.promotionType) {
                // Quiz (Poll, Quiz or ABC)
                case 'quiz':
                    switch (activity.pointProgressMax) {
                        // Poll or ABC (Usually 10 points)
                        case 10:
                            // Normal poll
                            if (activity.destinationUrl.toLowerCase().includes('pollscenarioid')) {
                                log('ACTIVITY', `Found activity type: "Poll" title: "${activity.title}"`)
                                await doPoll(activityPage)
                            } else { // ABC
                                log('ACTIVITY', `Found activity type: "ABC" title: "${activity.title}"`)
                                await doABC(activityPage)
                            }
                            break

                        // This Or That Quiz (Usually 50 points)
                        case 50:
                            log('ACTIVITY', `Found activity type: "ThisOrThat" title: "${activity.title}"`)
                            await doThisOrThat(activityPage, activity)
                            break

                        // Quizzes are usually 30-40 points
                        default:
                            log('ACTIVITY', `Found activity type: "Quiz" title: "${activity.title}"`)
                            await doQuiz(activityPage)
                            break
                    }
                    break

                // UrlReward (Visit)
                case 'urlreward':
                    log('ACTIVITY', `Found activity type: "UrlReward" title: "${activity.title}"`)
                    await doUrlReward(activityPage)
                    break

                default:
                    break
            }
            await wait(1500)
        }

    } catch (error) {
        log('ACTIVITY', 'An error occurred:' + error, 'error')
    }
}