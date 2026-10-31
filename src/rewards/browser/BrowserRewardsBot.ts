import type { Config } from '../../config/Config'
import { BotContext } from '../../core/BotContext'
import { BotRunner } from '../../core/BotRunner'
import { BrowserWorkflow } from './BrowserWorkflow'
import { createBrowserMode } from './createBrowserMode'

export class BrowserRewardsBot extends BotRunner {
    constructor(config: Config) {
        super(new BotContext(config, createBrowserMode), context => new BrowserWorkflow(context))
    }
}
