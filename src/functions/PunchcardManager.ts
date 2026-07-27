import { MicrosoftRewardsBot } from '../index'
import type { DashboardData } from '../interface/DashboardData'

export class PunchcardManager {
    constructor(private bot: MicrosoftRewardsBot) {}

    async runMobile(data: DashboardData): Promise<void> {
        try {
            await this.bot.workers.doPunchCards(data)
        } catch (error) {
            this.bot.logger.error(
                'main',
                'PUNCHCARD-MANAGER',
                `Mobile punchcards failed | ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    async runDesktop(): Promise<void> {
        let data: DashboardData | null = null
        try {
            data = await this.bot.browser.func.getDashboardData(this.bot.cookies.desktop)
        } catch (error) {
            this.bot.logger.warn(
                'main',
                'PUNCHCARD-MANAGER',
                `Desktop punchcard data unavailable (non-fatal) | ${
                    error instanceof Error ? error.message : String(error)
                }`
            )
        }

        if (!this.bot.config.workers.doPunchCards || !data) return

        try {
            await this.bot.workers.doPunchCards(data)
        } catch (error) {
            this.bot.logger.error(
                'main',
                'PUNCHCARD-MANAGER',
                `Desktop punchcards failed | ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }
}
