import { ghostClick } from '../../GhostClick'
import { browserTimeout } from '../../BrowserTiming'
import type { Page } from 'patchright'
import type { LoginContext } from '../LoginContext'
import { canPromptForInput, getErrorMessage, getSubtitleMessage, promptInput, waitForInputResponse } from './LoginUtils'

export class CodeLogin {
    private readonly codeInputSelector =
        '[data-testid="codeInputWrapper"] input, input[data-testid="codeInputWrapper"], input#otc-confirmation-input, input[name="otc"]'
    private readonly emailInputSelector =
        'input#proof-confirmation-email-input, input[data-testid="proof-confirmation"], [data-testid="proof-confirmation"] input'
    private readonly maxManualSeconds = 60
    private readonly maxManualAttempts = 5

    constructor(private bot: LoginContext) {}

    private async findEmailVerificationInput(page: Page) {
        await page
            .locator(`:is(${this.emailInputSelector}, ${this.codeInputSelector}):visible`)
            .first()
            .waitFor({ state: 'visible', timeout: browserTimeout(this.bot) })
        const input = page.locator(`:is(${this.emailInputSelector}):visible`).first()
        return (await input.isVisible()) ? input : null
    }

    private async fillCode(page: Page, code: string): Promise<boolean> {
        try {
            this.bot.signal.throwIfAborted()
            const timeout = browserTimeout(this.bot)
            const inputs = page.locator(`:is(${this.codeInputSelector}):visible`)
            await inputs.first().waitFor({ state: 'visible', timeout })
            await ghostClick(page, inputs.first(), timeout, this.bot.signal)
            const count = await inputs.count()
            if (count > 1) {
                if (count !== code.length) throw new Error(`Unexpected verification code field count: ${count}`)
                for (let index = 0; index < count; index++) await inputs.nth(index).fill('', { timeout })
                for (let index = 0; index < count; index++) await inputs.nth(index).fill(code[index]!, { timeout })
            } else {
                const input = inputs.first()
                await input.fill(code, { timeout })
                if (await input.isVisible()) await input.press('Enter', { timeout })
            }
            this.bot.logger.debug(this.bot.isMobile, 'LOGIN-CODE', 'Verification code submitted; waiting for response')
            return true
        } catch (error) {
            this.bot.signal.throwIfAborted()
            this.bot.logger.warn(
                this.bot.isMobile,
                'LOGIN-CODE',
                `Failed to fill code input: ${error instanceof Error ? error.message : String(error)}`
            )
            return false
        }
    }

    private async fillEmail(page: Page, email: string): Promise<boolean> {
        try {
            this.bot.signal.throwIfAborted()
            const input = await this.findEmailVerificationInput(page)
            if (!input) throw new Error('Email verification input not found')
            const timeout = browserTimeout(this.bot)
            await ghostClick(page, input, timeout, this.bot.signal)
            await input.fill(email, { timeout })
            await input.press('Enter', { timeout })
            this.bot.logger.debug(this.bot.isMobile, 'LOGIN-CODE', 'Verification email submitted; waiting for response')
            return true
        } catch (error) {
            this.bot.signal.throwIfAborted()
            this.bot.logger.warn(
                this.bot.isMobile,
                'LOGIN-CODE',
                `Failed to fill email input: ${error instanceof Error ? error.message : String(error)}`
            )
            return false
        }
    }

    async handle(page: Page): Promise<void> {
        try {
            this.bot.logger.debug(this.bot.isMobile, 'LOGIN-CODE', 'Code login authentication requested')

            if (!canPromptForInput()) {
                throw new Error('Email-code authentication requires interactive stdin; unavailable in background mode')
            }

            const emailMessage = await getSubtitleMessage(page)
            if (emailMessage) {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-CODE', `Page message: "${emailMessage}"`)
            } else {
                this.bot.logger.warn(this.bot.isMobile, 'LOGIN-CODE', 'Unable to retrieve email code destination')
            }

            const emailProofInput = await this.findEmailVerificationInput(page)

            if (emailProofInput) {
                const maskedHint = emailMessage?.match(/[A-Za-z0-9._*+-]+@[A-Za-z0-9.*-]+\.[A-Za-z]{2,}/)?.[0]
                this.bot.logger.info(
                    this.bot.isMobile,
                    'LOGIN-CODE',
                    'Email verification challenge detected, awaiting email address'
                )

                let emailVerified = false
                for (let attempt = 1; attempt <= this.maxManualAttempts; attempt++) {
                    const email = await promptInput({
                        question: maskedHint
                            ? `Enter the full email address for "${maskedHint}" to send the code to (waiting ${this.maxManualSeconds}s): `
                            : `Enter the email address to send the code to (waiting ${this.maxManualSeconds}s): `,
                        timeoutSeconds: this.maxManualSeconds,
                        validate: value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
                    })

                    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                        this.bot.logger.warn(
                            this.bot.isMobile,
                            'LOGIN-CODE',
                            `Invalid or missing email (attempt ${attempt}/${this.maxManualAttempts}) | input length=${email?.length}`
                        )

                        if (attempt === this.maxManualAttempts) {
                            throw new Error('Manual email input failed or timed out')
                        }
                        continue
                    }

                    const filled = await this.fillEmail(page, email)
                    if (!filled) {
                        this.bot.logger.error(
                            this.bot.isMobile,
                            'LOGIN-CODE',
                            `Unable to fill email input (attempt ${attempt}/${this.maxManualAttempts})`
                        )

                        if (attempt === this.maxManualAttempts) {
                            throw new Error('Email verification input not found')
                        }
                        continue
                    }

                    await waitForInputResponse(page, this.emailInputSelector, browserTimeout(this.bot))

                    const emailError = await getErrorMessage(page)
                    if (emailError) {
                        this.bot.logger.warn(
                            this.bot.isMobile,
                            'LOGIN-CODE',
                            `Email rejected: ${emailError} (attempt ${attempt}/${this.maxManualAttempts})`
                        )

                        if (attempt === this.maxManualAttempts) {
                            throw new Error(`Maximum email attempts reached: ${emailError}`)
                        }

                        continue
                    }

                    this.bot.logger.info(this.bot.isMobile, 'LOGIN-CODE', 'Email accepted, verification code sent')
                    emailVerified = true
                    break
                }

                if (!emailVerified) {
                    throw new Error('Email verification failed')
                }
            }

            for (let attempt = 1; attempt <= this.maxManualAttempts; attempt++) {
                const code = await promptInput({
                    question: `Enter the 6-digit code (waiting ${this.maxManualSeconds}s): `,
                    timeoutSeconds: this.maxManualSeconds,
                    validate: code => /^\d{6}$/.test(code)
                })

                if (!code || !/^\d{6}$/.test(code)) {
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'LOGIN-CODE',
                        `Invalid or missing code (attempt ${attempt}/${this.maxManualAttempts}) | input length=${code?.length}`
                    )

                    if (attempt === this.maxManualAttempts) {
                        throw new Error('Manual code input failed or timed out')
                    }
                    continue
                }

                const filled = await this.fillCode(page, code)
                if (!filled) {
                    this.bot.logger.error(
                        this.bot.isMobile,
                        'LOGIN-CODE',
                        `Unable to fill code input (attempt ${attempt}/${this.maxManualAttempts})`
                    )

                    if (attempt === this.maxManualAttempts) {
                        throw new Error('Code input field not found')
                    }
                    continue
                }

                await waitForInputResponse(page, this.codeInputSelector, browserTimeout(this.bot))

                // Check if wrong code was entered
                const errorMessage = await getErrorMessage(page)
                if (errorMessage) {
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'LOGIN-CODE',
                        `Incorrect code: ${errorMessage} (attempt ${attempt}/${this.maxManualAttempts})`
                    )

                    if (attempt === this.maxManualAttempts) {
                        throw new Error(`Maximum attempts reached: ${errorMessage}`)
                    }

                    continue
                }

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'LOGIN-CODE',
                    'Code response received; checking next sign-in state'
                )
                return
            }

            throw new Error(`Code input failed after ${this.maxManualAttempts} attempts`)
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'LOGIN-CODE',
                `Error occurred: ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }
}
