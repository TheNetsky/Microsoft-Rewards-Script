import type { Page } from 'patchright'
import * as OTPAuth from 'otpauth'
import type { MicrosoftRewardsBot } from '../../../index'
import { getErrorMessage, promptInput } from './LoginUtils'

export class TotpLogin {
    private readonly textInputSelector =
        'form[name="OneTimeCodeViewForm"] input[type="text"], input#floatingLabelInput5'
    private readonly secondairyInputSelector = 'input[id="otc-confirmation-input"], input[name="otc"]'
    private readonly submitButtonSelector = 'button[type="submit"]'
    private readonly maxManualSeconds = 60
    private readonly maxManualAttempts = 5

    constructor(private bot: MicrosoftRewardsBot) {}

    private generateTotpCode(secret: string): string {
        return new OTPAuth.TOTP({ secret, digits: 6 }).generate()
    }

    private async fillCode(page: Page, code: string): Promise<boolean> {
        try {
            const visibleInput = await page
                .waitForSelector(this.textInputSelector, { state: 'visible', timeout: 500 })
                .catch(() => null)

            if (visibleInput) {
                await visibleInput.fill(code)
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-TOTP', 'Filled TOTP input')
                return true
            }

            const secondairyInput = await page.$(this.secondairyInputSelector)
            if (secondairyInput) {
                await secondairyInput.fill(code)
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-TOTP', 'Filled TOTP input')
                return true
            }

            this.bot.logger.warn(this.bot.isMobile, 'LOGIN-TOTP', 'No TOTP input field found')
            return false
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'LOGIN-TOTP',
                `Failed to fill TOTP input: ${error instanceof Error ? error.message : String(error)}`
            )
            return false
        }
    }

    async handle(page: Page, totpSecret?: string): Promise<void> {
        try {
            this.bot.logger.info(this.bot.isMobile, 'LOGIN-TOTP', 'TOTP 2FA authentication requested')

            if (totpSecret) {
                const code = this.generateTotpCode(totpSecret)
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-TOTP', 'Generated TOTP code from secret')

                const filled = await this.fillCode(page, code)
                if (!filled) {
                    this.bot.logger.error(this.bot.isMobile, 'LOGIN-TOTP', 'Unable to fill TOTP input field')
                    throw new Error('TOTP input field not found')
                }

                await this.bot.utils.wait(500)
                await this.bot.browser.utils.ghostClick(page, this.submitButtonSelector)
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})

                const errorMessage = await getErrorMessage(page)
                if (errorMessage) {
                    this.bot.logger.error(this.bot.isMobile, 'LOGIN-TOTP', `TOTP failed: ${errorMessage}`)
                    throw new Error(`TOTP authentication failed: ${errorMessage}`)
                }

                this.bot.logger.info(this.bot.isMobile, 'LOGIN-TOTP', 'TOTP authentication completed successfully')
                return
            }

            this.bot.logger.info(this.bot.isMobile, 'LOGIN-TOTP', 'No TOTP secret provided, awaiting manual input')

            for (let attempt = 1; attempt <= this.maxManualAttempts; attempt++) {
                const code = await promptInput({
                    question: `Enter the 6-digit TOTP code (waiting ${this.maxManualSeconds}s): `,
                    timeoutSeconds: this.maxManualSeconds,
                    validate: code => /^\d{6}$/.test(code)
                })

                if (!code || !/^\d{6}$/.test(code)) {
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'LOGIN-TOTP',
                        `Invalid or missing code (attempt ${attempt}/${this.maxManualAttempts}) | input length=${code?.length}`
                    )

                    if (attempt === this.maxManualAttempts) {
                        throw new Error('Manual TOTP input failed or timed out')
                    }
                    continue
                }

                const filled = await this.fillCode(page, code)
                if (!filled) {
                    this.bot.logger.error(
                        this.bot.isMobile,
                        'LOGIN-TOTP',
                        `Unable to fill TOTP input (attempt ${attempt}/${this.maxManualAttempts})`
                    )

                    if (attempt === this.maxManualAttempts) {
                        throw new Error('TOTP input field not found')
                    }
                    continue
                }

                await this.bot.utils.wait(500)
                await this.bot.browser.utils.ghostClick(page, this.submitButtonSelector)
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})

                // Check if wrong code was entered
                const errorMessage = await getErrorMessage(page)
                if (errorMessage) {
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'LOGIN-TOTP',
                        `Incorrect code: ${errorMessage} (attempt ${attempt}/${this.maxManualAttempts})`
                    )

                    if (attempt === this.maxManualAttempts) {
                        throw new Error(`Maximum attempts reached: ${errorMessage}`)
                    }
                    continue
                }

                this.bot.logger.info(this.bot.isMobile, 'LOGIN-TOTP', 'TOTP authentication completed successfully')
                return
            }

            throw new Error(`TOTP input failed after ${this.maxManualAttempts} attempts`)
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'LOGIN-TOTP',
                `Error occurred: ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }
}
