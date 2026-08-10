import type { MicrosoftRewardsBot } from '../../index'

export abstract class BaseActivity {
    protected readonly bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }
}
