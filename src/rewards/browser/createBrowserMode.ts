import { createAccountData } from '../shared/data/createAccountData'
import { activityResult } from '../shared/ActivityResult'
import type { BotContext } from '../../core/BotContext'
import type { ModeServices } from '../types/ModeServices'
import { BrowserRewardsData } from './BrowserRewardsData'
import { BrowserUrlReward } from './actions/BrowserUrlReward'
import { BrowserRewardsActions } from './actions/BrowserRewardsActions'
import { BrowserPunchCards } from './actions/BrowserPunchCards'
import { BrowserSearch } from './search/BrowserSearch'
import { BrowserSearchOnBing } from './search/BrowserSearchOnBing'
import { BrowserVisualSearch } from './visual/BrowserVisualSearch'
import { BrowserTaskRunner } from './BrowserTaskRunner'
import { ClaimBonusPoints } from '../shared/activities/ClaimBonusPoints'
import { BrowserReadToEarn } from './actions/BrowserReadToEarn'
import { EnsureStreakProtection } from '../api/actions/EnsureStreakProtection'

export function createBrowserMode(bot: BotContext): ModeServices {
    const { accountData, serverActions } = createAccountData(bot)
    const url = new BrowserUrlReward(bot)
    const controls = new BrowserRewardsActions(bot)
    const cards = new BrowserPunchCards(bot)
    return {
        accountData,
        data: new BrowserRewardsData(bot, () => bot.activePage),
        reportStreakProtection: html => serverActions.reportStreakProtection(html),
        allowClosedBrowserHttp: false,
        snapshotRoutes: ['/earn'],
        createVisualSearch: () => new BrowserVisualSearch(bot),
        actions: {
            runWebTasks: (data, confirmed) => new BrowserTaskRunner(bot).run(data, confirmed),
            search: (page, isMobile) => new BrowserSearch(bot).search(page ?? bot.requirePage(isMobile), isMobile),
            bonusSearches: page => new BrowserSearch(bot).searchBonus(page ?? bot.requirePage(true)),
            searchOnBing: (promotion, source) => new BrowserSearchOnBing(bot).run(promotion, source),
            urlReward: (promotion, source) => url.run(promotion, source),
            punchCardsMobile: () => cards.run(),
            punchCardsDesktop: () => cards.run(),
            claimBonusPoints: () => new ClaimBonusPoints(bot).run(),
            ensureStreakProtection: () => new EnsureStreakProtection(bot).run(),
            claimReward: async () => activityResult('skipped', 'direct-claim-unavailable-in-browser-mode'),
            activateSearchPerk: data => controls.activateSearchPerk(data),
            readToEarn: promotion => new BrowserReadToEarn(bot).run(promotion)
        }
    }
}
