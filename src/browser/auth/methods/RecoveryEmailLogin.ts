import { ghostClick } from '../../GhostClick'
import { browserTimeout } from '../../BrowserTiming'
import type { Page } from 'patchright'
import type { LoginContext } from '../LoginContext'
import { canPromptForInput, getErrorMessage, promptInput, waitForInputResponse } from './LoginUtils'

export class RecoveryLogin {
    private readonly textInputSelector =
        'input#proof-confirmation-email-input, input[data-testid="proof-confirmation"], [data-testid="proof-confirmation"] input'
    private readonly maxManualSeconds = 60
    private readonly maxManualAttempts = 5

    constructor(private bot: LoginContext) {}

    private async fillEmail(page: Page, email: string): Promise<boolean> {
        try {
            this.bot.logger.debug(this.bot.isMobile, 'LOGIN-RECOVERY', 'Filling recovery email')

            this.bot.signal.throwIfAborted()
            const timeout = browserTimeout(this.bot)
            const input = page.locator(`:is(${this.textInputSelector}):visible`).first()
            await input.waitFor({ state: 'visible', timeout })
            await ghostClick(page, input, timeout, this.bot.signal)
            await input.fill(email, { timeout })
            await input.press('Enter', { timeout })
            this.bot.logger.debug(this.bot.isMobile, 'LOGIN-RECOVERY', 'Recovery email submitted; waiting for response')
            return true
        } catch (error) {
            this.bot.signal.throwIfAborted()
            this.bot.logger.warn(
                this.bot.isMobile,
                'LOGIN-RECOVERY',
                `Failed to fill email input: ${error instanceof Error ? error.message : String(error)}`
            )
            return false
        }
    }

    async handle(page: Page, recoveryEmail: string): Promise<void> {
        try {
            this.bot.logger.debug(this.bot.isMobile, 'LOGIN-RECOVERY', 'Email recovery authentication flow initiated')

            if (recoveryEmail) {
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN-RECOVERY', 'Using configured recovery email')

                const filled = await this.fillEmail(page, recoveryEmail)
                if (!filled) {
                    throw new Error('Email input field not found')
                }

                this.bot.logger.debug(this.bot.isMobile, 'LOGIN-RECOVERY', 'Waiting for page response')
                await waitForInputResponse(page, this.textInputSelector, browserTimeout(this.bot))

                const errorMessage = await getErrorMessage(page)
                if (errorMessage) {
                    throw new Error(`Email verification failed: ${errorMessage}`)
                }

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'LOGIN-RECOVERY',
                    'Recovery email response received; checking next sign-in state'
                )
                return
            }

            if (!canPromptForInput()) {
                throw new Error('Recovery email is required because interactive stdin is unavailable')
            }

            this.bot.logger.info(
                this.bot.isMobile,
                'LOGIN-RECOVERY',
                'No recovery email provided, will prompt user for input'
            )

            for (let attempt = 1; attempt <= this.maxManualAttempts; attempt++) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'LOGIN-RECOVERY',
                    `Starting attempt ${attempt}/${this.maxManualAttempts}`
                )

                this.bot.logger.info(
                    this.bot.isMobile,
                    'LOGIN-RECOVERY',
                    `Prompting user for email input (timeout: ${this.maxManualSeconds}s)`
                )

                const email = await promptInput({
                    question: `Recovery email (waiting ${this.maxManualSeconds}s): `,
                    timeoutSeconds: this.maxManualSeconds,
                    validate: email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
                })

                if (!email) {
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'LOGIN-RECOVERY',
                        `No or invalid email input received (attempt ${attempt}/${this.maxManualAttempts})`
                    )

                    if (attempt === this.maxManualAttempts) {
                        throw new Error('Manual email input failed: no input received')
                    }
                    continue
                }

                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'LOGIN-RECOVERY',
                        `Invalid email format received (attempt ${attempt}/${this.maxManualAttempts}) | length=${email.length}`
                    )

                    if (attempt === this.maxManualAttempts) {
                        throw new Error('Manual email input failed: invalid format')
                    }
                    continue
                }

                this.bot.logger.debug(this.bot.isMobile, 'LOGIN-RECOVERY', 'Valid recovery email received from user')

                const filled = await this.fillEmail(page, email)
                if (!filled) {
                    this.bot.logger.error(
                        this.bot.isMobile,
                        'LOGIN-RECOVERY',
                        `Failed to fill email input field (attempt ${attempt}/${this.maxManualAttempts})`
                    )

                    if (attempt === this.maxManualAttempts) {
                        throw new Error('Email input field not found after maximum attempts')
                    }

                    await this.bot.utils.wait(1000)
                    continue
                }

                this.bot.logger.debug(this.bot.isMobile, 'LOGIN-RECOVERY', 'Waiting for page response')
                await waitForInputResponse(page, this.textInputSelector, browserTimeout(this.bot))

                const errorMessage = await getErrorMessage(page)
                if (errorMessage) {
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'LOGIN-RECOVERY',
                        `Error from page: "${errorMessage}" (attempt ${attempt}/${this.maxManualAttempts})`
                    )

                    if (attempt === this.maxManualAttempts) {
                        throw new Error(`Maximum attempts reached. Last error: ${errorMessage}`)
                    }

                    await this.bot.utils.wait(1000)
                    continue
                }

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'LOGIN-RECOVERY',
                    'Recovery email response received; checking next sign-in state'
                )
                return
            }

            throw new Error(`Email input failed after ${this.maxManualAttempts} attempts`)
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            this.bot.logger.error(this.bot.isMobile, 'LOGIN-RECOVERY', `Fatal error: ${errorMsg}`)
            throw error
        }
    }
}
