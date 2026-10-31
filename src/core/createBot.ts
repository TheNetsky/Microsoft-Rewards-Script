import type { Config } from '../config/Config'
import { ApiRewardsBot } from '../rewards/api/ApiRewardsBot'
import { BrowserRewardsBot } from '../rewards/browser/BrowserRewardsBot'
import type { BotRunner } from './BotRunner'

export function createBot(config: Config): BotRunner {
    return config.rewardsMode === 'api' ? new ApiRewardsBot(config) : new BrowserRewardsBot(config)
}
