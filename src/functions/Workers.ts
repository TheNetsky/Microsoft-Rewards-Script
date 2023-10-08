import { Page } from 'puppeteer'

import { doPoll } from './activities/Poll'
import { doQuiz } from './activities/Quiz'
import { doUrlReward } from './activities/UrlReward'
import { doThisOrThat } from './activities/ThisOrThat'
import { doABC } from './activities/ABC'

import { getFormattedDate, wait } from '../util/Utils'
import { log } from '../util/Logger'

import { DashboardData, MorePromotion } from '../interface/DashboardData'

// Daily Set
export async function doDailySet(page: Page, data: DashboardData) {
    const todayData = data.dailySetPromotions[getFormattedDate()]

    const activitiesUncompleted = todayData?.filter(x => !x.complete) ?? []

    if (!activitiesUncompleted.length) {
        log('DAILY-SET', 'All daily set items have already been completed')
        return
    }

    for (const activity of activitiesUncompleted) {
        log('DAILY-SET', 'Started doing daily set items')

        // If activity does not give points, skip
        if (activity.pointProgressMax <= 0) {
            continue
        }

        switch (activity.promotionType) {
            // Quiz (Poll, Quiz or ABC)
            case 'quiz':

                switch (activity.pointProgressMax) {
                    // Poll or ABC (Usually 10 points)
                    case 10:
                        // Normal poll
                        if (activity.destinationUrl.toLowerCase().includes('pollscenarioid')) {
                            log('ACTIVITY', 'Found daily activity type: Poll')
                            await doPoll(page, activity)
                        } else { // ABC
                            log('ACTIVITY', 'Found daily activity type: ABC')
                            await doABC(page, activity)
                        }
                        break

                    // This Or That Quiz (Usually 50 points)
                    case 50:
                        log('ACTIVITY', 'Found daily activity type: ThisOrThat')
                        await doThisOrThat(page, activity)
                        break

                    // Quizzes are usually 30-40 points
                    default:
                        log('ACTIVITY', 'Found daily activity type: Quiz')
                        await doQuiz(page, activity)
                        break
                }
                break

            // UrlReward (Visit)
            case 'urlreward':
                log('ACTIVITY', 'Found daily activity type: UrlReward')
                await doUrlReward(page, activity)
                break

            default:
                break
        }
        await wait(1500)
    }

    log('DAILY-SET', 'Daily set items have been completed')
}

// Punch Card
export async function doPunchCard(page: Page, data: DashboardData) {

    const punchCardsUncompleted = data.punchCards?.filter(x => !x.parentPromotion.complete) ?? [] // Only return uncompleted punch cards

    if (!punchCardsUncompleted.length) {
        log('PUNCH-CARD', 'All punch cards have already been completed')
        return
    }

    for (const promotion of punchCardsUncompleted) {
        const activities = promotion.childPromotions.filter(x => !x.complete) // Only return uncompleted activities

        for (const activity of activities) {
            log('PUNCH-CARD', 'Started doing daily set items')

            // If activity does not give points, skip
            if (activity.pointProgressMax <= 0) {
                continue
            }

            switch (activity.promotionType) {
                // Quiz (Poll, Quiz or ABC)
                case 'quiz':

                    switch (activity.pointProgressMax) {
                        // Poll or ABC (Usually 10 points)
                        case 10:
                            // Normal poll
                            if (activity.destinationUrl.toLowerCase().includes('pollscenarioid')) {
                                log('ACTIVITY', 'Found daily activity type: Poll')
                                await doPoll(page, activity)
                            } else { // ABC
                                log('ACTIVITY', 'Found daily activity type: ABC')
                                await doABC(page, activity)
                            }
                            break

                        // This Or That Quiz (Usually 50 points)
                        case 50:
                            log('ACTIVITY', 'Found daily activity type: ThisOrThat')
                            await doThisOrThat(page, activity)
                            break

                        // Quizzes are usually 30-40 points
                        default:
                            log('ACTIVITY', 'Found daily activity type: Quiz')
                            await doQuiz(page, activity)
                            break
                    }
                    break

                // UrlReward (Visit)
                case 'urlreward':
                    log('ACTIVITY', 'Found daily activity type: UrlReward')
                    await doUrlReward(page, activity)
                    break

                default:
                    break
            }
            await wait(1500)
        }
    }

    log('PUNCH-CARD', 'Punch card items have been completed')
}

// More Promotions
export async function doMorePromotions(page: Page, data: DashboardData) {
    const morePromotions = data.morePromotions

    // Check if there is a promotional item
    if (data.promotionalItem) { // Convert and add the promotional item to the array
        morePromotions.push(data.promotionalItem as unknown as MorePromotion)
    }

    const activitiesUncompleted = morePromotions?.filter(x => !x.complete) ?? []

    if (!activitiesUncompleted.length) {
        log('MORE-PROMOTIONS', 'All more promotion items have already been completed')
        return
    }

    for (const activity of activitiesUncompleted) {
        // If activity does not give points, skip
        if (activity.pointProgressMax <= 0) {
            continue
        }

        switch (activity.promotionType) {
            // Quiz (Poll, Quiz or ABC)
            case 'quiz':

                switch (activity.pointProgressMax) {
                    // Poll or ABC (Usually 10 points)
                    case 10:
                        // Normal poll
                        if (activity.destinationUrl.toLowerCase().includes('pollscenarioid')) {
                            log('ACTIVITY', 'Found daily activity type: Poll')
                            await doPoll(page, activity)
                        } else { // ABC
                            log('ACTIVITY', 'Found daily activity type: ABC')
                            await doABC(page, activity)
                        }
                        break

                    // This Or That Quiz (Usually 50 points)
                    case 50:
                        log('ACTIVITY', 'Found daily activity type: ThisOrThat')
                        await doThisOrThat(page, activity)
                        break

                    // Quizzes are usually 30-40 points
                    default:
                        log('ACTIVITY', 'Found promotion activity type: Quiz')
                        await doQuiz(page, activity)
                        break
                }
                break

            // UrlReward (Visit)
            case 'urlreward':
                log('ACTIVITY', 'Found promotion activity type: UrlReward')
                await doUrlReward(page, activity)
                break

            default:
                break
        }
        await wait(1500)
    }
}