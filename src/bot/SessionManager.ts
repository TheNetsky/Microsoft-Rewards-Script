import type { Account } from '../interface/Account'
import type { MicrosoftRewardsBot } from './MicrosoftRewardsBot'
import type { BrowserSession } from './types'
import { executionContext } from './ExecutionContextStore'

export class SessionManager {
    private mobileSession: BrowserSession | null = null
    private desktopSession: BrowserSession | null = null

    constructor(private readonly bot: MicrosoftRewardsBot) {}

    setMobileSession(session: BrowserSession | null): void {
        this.mobileSession = session
    }

    setDesktopSession(session: BrowserSession | null): void {
        this.desktopSession = session
    }

    async closeMobileSession(account: Account, accountEmail: string): Promise<void> {
        const session = this.mobileSession
        if (!session) return
        this.mobileSession = null

        await executionContext.run({ isMobile: true, account }, async () => {
            await this.bot.browser.func.checkpointActiveSession('PRE-BROWSER-CLOSE')
            await this.bot.browser.func.closeBrowser(session.context, accountEmail)
        })
    }

    async closeDesktopSession(account: Account, accountEmail: string): Promise<void> {
        const session = this.desktopSession
        if (!session) return
        this.desktopSession = null

        await executionContext.run({ isMobile: false, account }, async () => {
            await this.bot.browser.func.checkpointActiveSession('PRE-BROWSER-CLOSE')
            await this.bot.browser.func.closeBrowser(session.context, accountEmail)
        })
    }
}
