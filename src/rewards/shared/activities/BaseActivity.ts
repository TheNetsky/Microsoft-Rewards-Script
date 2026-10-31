import type { BotContext } from '../../../core/BotContext'

export abstract class BaseActivity {
    protected readonly bot: BotContext

    constructor(bot: BotContext) {
        this.bot = bot
    }
}
