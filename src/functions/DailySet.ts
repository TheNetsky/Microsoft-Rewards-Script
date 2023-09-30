import { Page } from 'puppeteer'
import { DashboardData } from '../interface/DashboardData'
import { doPoll } from './activities/Poll'
import { getFormattedDate, wait } from '../util/Utils'
import { doQuiz } from './activities/Quiz'
import { log } from '../util/Logger'
import { doUrlReward } from './activities/UrlReward'


export async function doDailySet(page: Page, data: DashboardData) {
    const todayData = data.dailySetPromotions[getFormattedDate()]

    const activitiesUncompleted = todayData?.filter(x => !x.complete) ?? []

    if (!activitiesUncompleted.length) {
        log('DAILY-SET', 'All daily set items have already been completed')
        return
    }

    for (const activity of activitiesUncompleted) {
        log('DAILY-SET', 'Started doing daily set items')
        switch (activity.promotionType) {
            // Quiz (Poll/Quiz)
            case 'quiz':

                switch (activity.pointProgressMax) {
                    // Poll (Usually 10 points)
                    case 10:
                        log('ACTIVITY', 'Found daily activity type: Poll')
                        await doPoll(page, activity)
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