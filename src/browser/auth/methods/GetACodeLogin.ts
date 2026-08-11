import type { Page } from 'patchright'
import type { MicrosoftRewardsBot } from '../../../index'
import { canPromptForInput, getErrorMessage, getSubtitleMessage, promptInput } from './LoginUtils'

export class CodeLogin {
    private readonly textInputSelector = '[data-testid="codeInputWrapper"]'
    private readonly secondairyInputSelector = 'input[id="otc-confirmation-input"], input[name="otc"]'
    private readonly emailVerificationInputSelectors = [
        'input#proof-confirmation-email-input',
        '[data-testid="proof-confirmation"]'
    ] as const
    private readonly maxManualSeconds = 60
    private readonly maxManualAttempts = 5

    constructor(private bot: MicrosoftRewardsBot) {}

    private async findEmailVerificationInput(page: Page) {
        for (const selector of this.emailVerificationInputSelectors) {
            const input = await page.waitForSelector(selector, { state: 'visible', timeout: 500 }).catch(() => null)

            if (input) return { input, selector }
        }

        return null
    }

    private async fillCode(page: Page, code: string): Promise<boolean> {
        try {
            const visibleInput = await page
                .waitForSelector(this.textInputSelector, { state: 'visible', timeout: 500 })
                .catch(() => null)

            if (visibleInput) {
                await page.keyboard.type(code, { delay: 50 })
                const stilOnPage = await page
                    .waitForSelector(this.textInputSelector, { state: 'visible', timeout: 750 })
                    .then(() => true)
                    .catch(() => false)
                if (stilOnPage) {
                    await page.keyboard.press('Enter')
                }
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-CODE', 'Filled code input')
                return true
            }

            const secondairyInput = await page.$(this.secondairyInputSelector)
            if (secondairyInput) {
                await page.keyboard.type(code, { delay: 50 })

                const stilOnPage = await page
                    .waitForSelector(this.secondairyInputSelector, { state: 'visible', timeout: 750 })
                    .then(() => true)
                    .catch(() => false)
                if (stilOnPage) {
                    await page.keyboard.press('Enter')
                }

                this.bot.logger.info(this.bot.isMobile, 'LOGIN-CODE', 'Filled code input')
                return true
            }

            this.bot.logger.warn(this.bot.isMobile, 'LOGIN-CODE', 'No code input field found')
            return false
        } catch (error) {
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
            const visibleInput = await this.findEmailVerificationInput(page)

            if (visibleInput) {
                await visibleInput.input.click().catch(() => {})
                await page.keyboard.type(email, { delay: 50 })
                await page.keyboard.press('Enter')
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-CODE', 'Submitted verification email')
                return true
            }

            this.bot.logger.warn(this.bot.isMobile, 'LOGIN-CODE', 'Email verification input not found')
            return false
        } catch (error) {
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
            this.bot.logger.info(this.bot.isMobile, 'LOGIN-CODE', 'Code login authentication requested')

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
                const selectorVariant =
                    emailProofInput.selector === this.emailVerificationInputSelectors[0] ? 'new' : 'old'
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'LOGIN-CODE',
                    `Using ${selectorVariant} email verification input selector`
                )
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

                    await this.bot.utils.wait(500)
                    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})

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

                        const inputToClear = await this.findEmailVerificationInput(page)
                        if (inputToClear) {
                            await inputToClear.input.click()
                            await page.keyboard.press('Control+A')
                            await page.keyboard.press('Backspace')
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

                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
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

                await this.bot.utils.wait(500)
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})

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

                    // Clear the input field before retrying
                    const inputToClear = await page.$(this.textInputSelector).catch(() => null)
                    if (inputToClear) {
                        await inputToClear.click()
                        await page.keyboard.press('Control+A')
                        await page.keyboard.press('Backspace')
                    }
                    continue
                }

                this.bot.logger.info(this.bot.isMobile, 'LOGIN-CODE', 'Code authentication completed successfully')
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
