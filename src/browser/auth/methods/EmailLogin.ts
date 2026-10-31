import type { Page } from 'patchright'
import type { LoginContext } from '../LoginContext'
import { browserTimeout } from '../../BrowserTiming'

export class EmailLogin {
    constructor(private readonly bot: LoginContext) {}

    enterEmail(page: Page, email: string): Promise<'ok' | 'error'> {
        return this.submitField(page, 'email', email)
    }

    enterPassword(page: Page, password: string): Promise<'ok' | 'error'> {
        return this.submitField(page, 'password', password)
    }

    private async submitField(page: Page, field: 'email' | 'password', value: string): Promise<'ok' | 'error'> {
        const label = `LOGIN-ENTER-${field.toUpperCase()}`
        try {
            this.bot.signal.throwIfAborted()
            const timeout = browserTimeout(this.bot)
            const input = page.locator(`input[type="${field}"]:visible`).first()
            await input.waitFor({ state: 'visible', timeout })
            await input.fill(value, { timeout })
            const submit = 'button[type="submit"]:visible'
            await page.locator(submit).first().waitFor({ state: 'visible', timeout })
            if (!(await this.bot.browser.utils.click(page, submit))) throw new Error(`Could not submit ${field}`)
            this.bot.logger.debug(this.bot.isMobile, label, `${field === 'email' ? 'Email' : 'Password'} submitted`)
            return 'ok'
        } catch (error) {
            this.bot.signal.throwIfAborted()
            this.bot.logger.error(this.bot.isMobile, label, error instanceof Error ? error : String(error))
            return 'error'
        }
    }
}
