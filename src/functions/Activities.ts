import type { MicrosoftRewardsBot } from '../index'

// 应用
import { DailyCheckIn } from './activities/app/DailyCheckIn'
import { ReadToEarn } from './activities/app/ReadToEarn'
import { AppReward } from './activities/app/AppReward'

// API
import { UrlReward } from './activities/api/UrlReward'
import { ClaimBonusPoints } from './activities/api/ClaimBonusPoints'
import { EnsureStreakProtection } from './activities/api/EnsureStreakProtection'
import { ClaimReward } from './activities/api/ClaimReward'
import { ActivateSearchPerk } from './activities/api/ActivateSearchPerk'
import { VisualSearch } from './activities/api/VisualSearch'

// 浏览器
import { Search as BrowserSearch } from './activities/browser/Search'
import { SearchOnBing as BrowserSearchOnBing } from './activities/browser/SearchOnBing'

// 实验性功能
import { Search as ApiSearch } from './activities/api/Search'
import { SearchOnBing as ApiSearchOnBing } from './activities/api/SearchOnBing'

import type { Page } from 'patchright'
import type { BasePromotion, DashboardData } from '../interface/DashboardData'
import type { Promotion } from '../interface/AppDashBoardData'
import type { QuestChild } from '../browser/ReactFunc'

export default class Activities {
    private bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

// 搜索活动
    doSearch = async (page: Page, isMobile: boolean): Promise<number> => {
        if (this.bot.config.experimental.apiSearch) {
            return await new ApiSearch(this.bot).doSearch(isMobile)
        }
        return await new BrowserSearch(this.bot).doSearch(page, isMobile)
    }

    doBonusSearches = async (page: Page): Promise<number> => {
        if (this.bot.config.experimental.apiSearch) {
            return await new ApiSearch(this.bot).doBonusSearches()
        }
        return await new BrowserSearch(this.bot).doBonusSearches(page)
    }

    doSearchOnBing = async (promotion: BasePromotion, page: Page): Promise<void> => {
        if (this.bot.config.experimental.apiSearchOnBing) {
            await new ApiSearchOnBing(this.bot).doSearchOnBing(promotion)
            return
        }
        await new BrowserSearchOnBing(this.bot).doSearchOnBing(promotion, page)
    }

    // API
    doUrlReward = async (promotion: BasePromotion): Promise<void> => {
        const urlReward = new UrlReward(this.bot)
        await urlReward.doUrlReward(promotion)
    }

    doClaimBonusPoints = async (): Promise<void> => {
        const claimBonusPoints = new ClaimBonusPoints(this.bot)
        await claimBonusPoints.claimBonusPoints()
    }

    doEnsureStreakProtection = async (): Promise<void> => {
        const ensureStreakProtection = new EnsureStreakProtection(this.bot)
        await ensureStreakProtection.ensureStreakProtection()
    }

    doClaimReward = async (child: QuestChild, parentId: string): Promise<void> => {
        const claimReward = new ClaimReward(this.bot)
        await claimReward.claimReward(child, parentId)
    }

    doActivateSearchPerk = async (data: DashboardData): Promise<void> => {
        const activateSearchPerk = new ActivateSearchPerk(this.bot)
        await activateSearchPerk.activate(data)
    }

    doVisualSearch = async (data: DashboardData): Promise<number> => {
        const visualSearch = new VisualSearch(this.bot)
        return await visualSearch.doVisualSearch(data)
    }

// 应用
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
