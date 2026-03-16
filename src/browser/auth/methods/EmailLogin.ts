import type { Page } from 'patchright'
import type { MicrosoftRewardsBot } from '../../../index'
import { getErrorMessage, promptInput } from './LoginUtils'

export class EmailLogin {
    private submitButton = 'button[type="submit"]'
    private readonly maxManualSeconds = 120

    constructor(private bot: MicrosoftRewardsBot) {}

    async enterEmail(page: Page, email: string): Promise<'ok' | 'error'> {
        try {
            const emailInputSelector = 'input[type="email"]'
            const emailField = await page
                .waitForSelector(emailInputSelector, { state: 'visible', timeout: 1000 })
                .catch(() => {})
            if (!emailField) {
                this.bot.logger.warn(this.bot.isMobile, 'LOGIN-ENTER-EMAIL', 'Email field not found')
                return 'error'
            }

            await this.bot.utils.wait(1000)

            const prefilledEmail = await page
                .waitForSelector('#userDisplayName', { state: 'visible', timeout: 1000 })
                .catch(() => {})
            if (!prefilledEmail) {
                await page.fill(emailInputSelector, '').catch(() => {})
                await this.bot.utils.wait(500)
                await page.fill(emailInputSelector, email).catch(() => {})
                await this.bot.utils.wait(1000)
            } else {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-ENTER-EMAIL', 'Email prefilled')
            }

            await page.waitForSelector(this.submitButton, { state: 'visible', timeout: 2000 }).catch(() => {})

            await this.bot.browser.utils.ghostClick(page, this.submitButton)
            this.bot.logger.info(this.bot.isMobile, 'LOGIN-ENTER-EMAIL', 'Email submitted')

            return 'ok'
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'LOGIN-ENTER-EMAIL',
                `An error occurred: ${error instanceof Error ? error.message : String(error)}`
            )
            return 'error'
        }
    }

    async enterPassword(page: Page, password: string): Promise<'ok' | 'needs-2fa' | 'error'> {
        try {
            const passwordInputSelector = 'input[type="password"]'
            const passwordField = await page
                .waitForSelector(passwordInputSelector, { state: 'visible', timeout: 1000 })
                .catch(() => {})
            if (!passwordField) {
                this.bot.logger.warn(this.bot.isMobile, 'LOGIN-ENTER-PASSWORD', 'Password field not found')
                return 'error'
            }

            // 密码为空时，提示手动输入
            password = password?.trim() ? password : ''
            if (!password) {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-ENTER-PASSWORD', 'No password provided, awaiting manual input')
                password = await promptInput({
                    question: `Enter your password (waiting ${this.maxManualSeconds}s): `,
                    timeoutSeconds: this.maxManualSeconds,
                    transform: input => input.trim()
                }) ?? ''
                if (!password) {
                    this.bot.logger.error(this.bot.isMobile, 'LOGIN-ENTER-PASSWORD', 'Password input timed out')
                    return 'error'
                }
            }

            await this.bot.utils.wait(1000)
            await page.fill(passwordInputSelector, '').catch(() => {})
            await this.bot.utils.wait(500)
            await page.fill(passwordInputSelector, password).catch(() => {})
            await this.bot.utils.wait(1000)

            const submitButton = await page
                .waitForSelector(this.submitButton, { state: 'visible', timeout: 2000 })
                .catch(() => null)

            if (submitButton) {
                await this.bot.browser.utils.ghostClick(page, this.submitButton)
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-ENTER-PASSWORD', 'Password submitted')
            }

            await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
            const errorMessage = await getErrorMessage(page)
            if (errorMessage) {
                this.bot.logger.warn(this.bot.isMobile, 'LOGIN-ENTER-PASSWORD', `Password error: ${errorMessage}`)
                return 'error'
            }

            return 'ok'
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'LOGIN-ENTER-PASSWORD',
                `An error occurred: ${error instanceof Error ? error.message : String(error)}`
            )
            return 'error'
        }
    }
}
