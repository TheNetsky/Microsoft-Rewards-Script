import { Page } from 'puppeteer'
import { DashboardData } from '../interface/DashboardData'
import { doPoll } from './activities/Poll'
import { doQuiz } from './activities/Quiz'
import { log } from '../util/Logger'
import { doUrlReward } from './activities/UrlReward'
import { wait } from '../util/Utils'


export async function doMorePromotions(page: Page, data: DashboardData) {
    const morePromotions = data.morePromotions

    const activitiesUncompleted = morePromotions?.filter(x => !x.complete) ?? []
    
    if (!activitiesUncompleted.length) {
        log('MORE-PROMOTIONS', 'All more promotion items have already been completed')
        return
    }

    for (const activity of activitiesUncompleted) {

        switch (activity.promotionType) {
            // Quiz (Poll/Quiz)
            case 'quiz':

                switch (activity.pointProgressMax) {
                    // Poll (Usually 10 points)
                    case 10:
                        log('ACTIVITY', 'Found promotion activity type: Poll')
                        await doPoll(page, activity)
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