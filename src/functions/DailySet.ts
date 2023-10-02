import { Page } from 'puppeteer'

import { doPoll } from './activities/Poll'
import { doQuiz } from './activities/Quiz'
import { doUrlReward } from './activities/UrlReward'
import { doThisOrThat } from './activities/ThisOrThat'

import { getFormattedDate, wait } from '../util/Utils'
import { log } from '../util/Logger'

import { DashboardData } from '../interface/DashboardData'

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
            // Quiz (Poll/Quiz)
            case 'quiz':

                switch (activity.pointProgressMax) {
                    // Poll (Usually 10 points)
                    case 10:
                        log('ACTIVITY', 'Found daily activity type: Poll')
                        await doPoll(page, activity)
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