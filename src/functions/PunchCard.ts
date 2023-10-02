import { Page } from 'puppeteer'

import { doPoll } from './activities/Poll'
import { doQuiz } from './activities/Quiz'
import { doUrlReward } from './activities/UrlReward'
import { doThisOrThat } from './activities/ThisOrThat'

import { wait } from '../util/Utils'
import { log } from '../util/Logger'

import { DashboardData } from '../interface/DashboardData'

export async function doPunchCard(page: Page, data: DashboardData) {

    const punchCardsUncompleted = data.punchCards?.filter(x => !x.parentPromotion.complete) ?? [] // filter out the uncompleted punch cards

    if (!punchCardsUncompleted.length) {
        log('PUNCH-CARD', 'All punch cards have already been completed')
        return
    }

    // Todo
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activitiesUncompleted: any = ''

    for (const activity of activitiesUncompleted) {
        log('PUNCH-CARD', 'Started doing daily set items')

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

    log('PUNCH-CARD', 'Punch card items have been completed')
}