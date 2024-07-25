import { Page } from 'playwright'

import { MicrosoftRewardsBot } from '../index'

import { Search } from './activities/Search'
import { ABC } from './activities/ABC'
import { Poll } from './activities/Poll'
import { Quiz } from './activities/Quiz'
import { ThisOrThat } from './activities/ThisOrThat'
import { UrlReward } from './activities/UrlReward'
import { ReadToEarn } from './activities/ReadToEarn'
import { DailyCheckIn } from './activities/DailyCheckIn'

import { DashboardData } from '../interface/DashboardData'


export default class Activities {
    private bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    doSearch = async (page: Page, data: DashboardData): Promise<void> => {
        const search = new Search(this.bot)
        await search.doSearch(page, data)
    }

    doABC = async (page: Page): Promise<void> => {
        const abc = new ABC(this.bot)
        await abc.doABC(page)
    }

    doPoll = async (page: Page): Promise<void> => {
        const poll = new Poll(this.bot)
        await poll.doPoll(page)
    }

    doThisOrThat = async (page: Page): Promise<void> => {
        const thisOrThat = new ThisOrThat(this.bot)
        await thisOrThat.doThisOrThat(page)
    }

    doQuiz = async (page: Page): Promise<void> => {
        const quiz = new Quiz(this.bot)
        await quiz.doQuiz(page)
    }

    doUrlReward = async (page: Page): Promise<void> => {
        const urlReward = new UrlReward(this.bot)
        await urlReward.doUrlReward(page)
    }

    doReadToEarn = async (accessToken: string, data: DashboardData): Promise<void> => {
        const readToEarn = new ReadToEarn(this.bot)
        await readToEarn.doReadToEarn(accessToken, data)
    }

    doDailyCheckIn = async (accessToken: string, data: DashboardData): Promise<void> => {
        const dailyCheckIn = new DailyCheckIn(this.bot)
        await dailyCheckIn.doDailyCheckIn(accessToken, data)
    }

}