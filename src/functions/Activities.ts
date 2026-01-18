import type { MicrosoftRewardsBot } from '../index'
import type { Page } from 'patchright'

// App
import { DailyCheckIn } from './activities/app/DailyCheckIn'
import { ReadToEarn } from './activities/app/ReadToEarn'
import { AppReward } from './activities/app/AppReward'

// API
import { UrlReward } from './activities/api/UrlReward'
import { Quiz } from './activities/api/Quiz'
import { FindClippy } from './activities/api/FindClippy'
import { DoubleSearchPoints } from './activities/api/DoubleSearchPoints'
import { WelcomeTour } from './activities/api/WelcomeTour'

// Browser
import { SearchOnBing } from './activities/browser/SearchOnBing'
import { Search } from './activities/browser/Search'

import type {
    BasePromotion,
    DashboardData,
    FindClippyPromotion,
    PurplePromotionalItem
} from '../interface/DashboardData'
import type { Promotion } from '../interface/AppDashBoardData'

export default class Activities {
    private bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    // Browser Activities
    doSearch = async (data: DashboardData, page: Page, isMobile: boolean): Promise<number> => {
        const search = new Search(this.bot)
        return await search.doSearch(data, page, isMobile)
    }

    doSearchOnBing = async (promotion: BasePromotion, page: Page): Promise<void> => {
        const searchOnBing = new SearchOnBing(this.bot)
        await searchOnBing.doSearchOnBing(promotion, page)
    }

    /*
    doABC = async (page: Page): Promise<void> => {
        const abc = new ABC(this.bot)
        await abc.doABC(page)
    }
    */

    /*
    doPoll = async (page: Page): Promise<void> => {
        const poll = new Poll(this.bot)
        await poll.doPoll(page)
    }
    */

    /*
    doThisOrThat = async (page: Page): Promise<void> => {
        const thisOrThat = new ThisOrThat(this.bot)
        await thisOrThat.doThisOrThat(page)
    }
    */

    // API Activities
    doUrlReward = async (promotion: BasePromotion): Promise<void> => {
        const urlReward = new UrlReward(this.bot)
        await urlReward.doUrlReward(promotion)
    }

    doQuiz = async (promotion: BasePromotion): Promise<void> => {
        const quiz = new Quiz(this.bot)
        await quiz.doQuiz(promotion)
    }

    doFindClippy = async (promotion: FindClippyPromotion): Promise<void> => {
        const findClippy = new FindClippy(this.bot)
        await findClippy.doFindClippy(promotion)
    }

    doDoubleSearchPoints = async (promotion: PurplePromotionalItem): Promise<void> => {
        const doubleSearchPoints = new DoubleSearchPoints(this.bot)
        await doubleSearchPoints.doDoubleSearchPoints(promotion)
    }

    doWelcomeTour = async (promotion: BasePromotion, page: Page): Promise<void> => {
        const welcomeTour = new WelcomeTour(this.bot)
        await welcomeTour.doWelcomeTour(promotion, page)
    }

    // App Activities
    doAppReward = async (promotion: Promotion): Promise<void> => {
        const urlReward = new AppReward(this.bot)
        await urlReward.doAppReward(promotion)
    }

    doReadToEarn = async (): Promise<void> => {
        const readToEarn = new ReadToEarn(this.bot)
        await readToEarn.doReadToEarn()
    }

    doDailyCheckIn = async (): Promise<void> => {
        const dailyCheckIn = new DailyCheckIn(this.bot)
        await dailyCheckIn.doDailyCheckIn()
    }
}
