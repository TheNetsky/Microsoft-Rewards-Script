import { Page } from 'puppeteer'

import { doPoll } from './activities/Poll'
import { doQuiz } from './activities/Quiz'
import { doUrlReward } from './activities/UrlReward'
import { doThisOrThat } from './activities/ThisOrThat'

import { wait } from '../util/Utils'
import { log } from '../util/Logger'

import { DashboardData, MorePromotion } from '../interface/DashboardData'

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
            // Quiz (Poll/Quiz)
            case 'quiz':

                switch (activity.pointProgressMax) {
                    // Poll (Usually 10 points)
                    case 10:
                        log('ACTIVITY', 'Found promotion activity type: Poll')
                        await doPoll(page, activity)
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