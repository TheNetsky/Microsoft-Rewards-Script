import { createAccountData } from '../shared/data/createAccountData'
import type { BotContext } from '../../core/BotContext'
import type { ModeServices } from '../types/ModeServices'
import { ApiUrlReward } from './actions/ApiUrlReward'
import { ApiPunchCards } from './actions/ApiPunchCards'
import { ClaimBonusPoints } from '../shared/activities/ClaimBonusPoints'
import { EnsureStreakProtection } from './actions/EnsureStreakProtection'
import { ClaimReward } from './actions/ClaimReward'
import { ActivateSearchPerk } from './actions/ActivateSearchPerk'
import { ApiSearch } from './search/ApiSearch'
import { ApiSearchOnBing } from './search/ApiSearchOnBing'
import { ApiVisualSearch } from './visual/ApiVisualSearch'
import { ApiReadToEarn } from './actions/ApiReadToEarn'

export function createApiMode(bot: BotContext): ModeServices {
    const { accountData, serverActions } = createAccountData(bot)
    const url = new ApiUrlReward(bot)
    const cards = new ApiPunchCards(bot)
    return {
        accountData,
        data: accountData,
        reportStreakProtection: html => serverActions.reportStreakProtection(html),
        serverActions,
        allowClosedBrowserHttp: true,
        snapshotRoutes: ['/earn', '/dashboard'],
        createVisualSearch: () => new ApiVisualSearch(bot),
        actions: {
            search: (_page, isMobile) => new ApiSearch(bot).search(isMobile),
            bonusSearches: () => new ApiSearch(bot).searchBonus(),
            searchOnBing: promotion => new ApiSearchOnBing(bot).run(promotion),
            urlReward: promotion => url.run(promotion),
            punchCardsMobile: data => cards.runMobile(data),
            punchCardsDesktop: () => cards.runDesktop(),
            claimBonusPoints: () => new ClaimBonusPoints(bot).run(),
            ensureStreakProtection: () => new EnsureStreakProtection(bot).run(),
            claimReward: (child, parentId) => new ClaimReward(bot).run(child, parentId),
            activateSearchPerk: data => new ActivateSearchPerk(bot).activate(data),
            readToEarn: promotion => new ApiReadToEarn(bot).run(promotion)
        }
    }
}
