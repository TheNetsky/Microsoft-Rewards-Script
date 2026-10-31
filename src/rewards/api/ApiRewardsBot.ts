import type { Config } from '../../config/Config'
import { BotContext } from '../../core/BotContext'
import { BotRunner } from '../../core/BotRunner'
import { ApiWorkflow } from './ApiWorkflow'
import { createApiMode } from './createApiMode'

export class ApiRewardsBot extends BotRunner {
    constructor(config: Config) {
        super(new BotContext(config, createApiMode), context => new ApiWorkflow(context))
    }
}
