import type { Page } from 'patchright'
import * as OTPAuth from 'otpauth'
import readline from 'readline'
import type { MicrosoftRewardsBot } from '../../../index'

export class TotpLogin {
    private readonly textInputSelector =
        'form[name="OneTimeCodeViewForm"] input[type="text"], input#floatingLabelInput5'
    private readonly hiddenInputSelector = 'input[id="otc-confirmation-input"], input[name="otc"]'
    private readonly submitButtonSelector = 'button[type="submit"]'
    private readonly maxManualSeconds = 60
    private readonly maxManualAttempts = 5

    constructor(private bot: MicrosoftRewardsBot) {}

    private generateTotpCode(secret: string): string {
        return new OTPAuth.TOTP({ secret, digits: 6 }).generate()
    }

    private async promptManualCode(): Promise<string | null> {
        return await new Promise(resolve => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            })

            let resolved = false

            const cleanup = (result: string | null) => {
                if (resolved) return
                resolved = true
                clearTimeout(timer)
                rl.close()
                resolve(result)
            }

            const timer = setTimeout(() => cleanup(null), this.maxManualSeconds * 1000)

            rl.question(`Enter the 6-digit TOTP code (waiting ${this.maxManualSeconds}s): `, answer => {
                cleanup(answer.trim())
            })
        })
    }

    private async fillCode(page: Page, code: string): Promise<boolean> {
        try {
            const visibleInput = await page
                .waitForSelector(this.textInputSelector, { state: 'visible', timeout: 500 })
                .catch(() => null)

            if (visibleInput) {
                await visibleInput.fill(code)
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-TOTP', 'Filled visible TOTP text input')
                return true
            }

            const hiddenInput = await page.$(this.hiddenInputSelector)

            if (hiddenInput) {
                await hiddenInput.fill(code)
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-TOTP', 'Filled hidden TOTP input')
                return true
            }

            this.bot.logger.warn(this.bot.isMobile, 'LOGIN-TOTP', 'No TOTP input field found (visible or hidden)')
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
                    this.bot.logger.error(this.bot.isMobile, 'LOGIN-TOTP', 'Unable to locate or fill TOTP input field')
                    throw new Error('TOTP input field not found')
                }

                await this.bot.utils.wait(500)
                await this.bot.browser.utils.ghostClick(page, this.submitButtonSelector)
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})

                this.bot.logger.info(this.bot.isMobile, 'LOGIN-TOTP', 'TOTP authentication completed successfully')
                return
            }

            this.bot.logger.info(this.bot.isMobile, 'LOGIN-TOTP', 'No TOTP secret provided, awaiting manual input')

            for (let attempt = 1; attempt <= this.maxManualAttempts; attempt++) {
                const code = await this.promptManualCode()

                if (!code || !/^\d{6}$/.test(code)) {
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'LOGIN-TOTP',
                        `Invalid or missing TOTP code (attempt ${attempt}/${this.maxManualAttempts})`
                    )

                    if (attempt === this.maxManualAttempts) {
                        throw new Error('Manual TOTP input failed or timed out')
                    }

                    this.bot.logger.info(
                        this.bot.isMobile,
                        'LOGIN-TOTP',
                        'Retrying manual TOTP input due to invalid code'
                    )
                    continue
                }

                const filled = await this.fillCode(page, code)

                if (!filled) {
                    this.bot.logger.error(
                        this.bot.isMobile,
                        'LOGIN-TOTP',
                        `Unable to locate or fill TOTP input field (attempt ${attempt}/${this.maxManualAttempts})`
                    )

                    if (attempt === this.maxManualAttempts) {
                        throw new Error('TOTP input field not found')
                    }

                    this.bot.logger.info(
                        this.bot.isMobile,
                        'LOGIN-TOTP',
                        'Retrying manual TOTP input due to fill failure'
                    )
                    continue
                }

                await this.bot.utils.wait(500)
                await this.bot.browser.utils.ghostClick(page, this.submitButtonSelector)
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})

                this.bot.logger.info(this.bot.isMobile, 'LOGIN-TOTP', 'TOTP authentication completed successfully')
                return
            }

            throw new Error(`Manual TOTP input failed after ${this.maxManualAttempts} attempts`)
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'LOGIN-TOTP',
                `An error occurred: ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }
}
