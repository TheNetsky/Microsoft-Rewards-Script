import { LoginSession } from './LoginSession'
import { LoginStateDetector, LOGIN_SELECTORS, type LoginState, type LoginStateSnapshot } from './LoginStateDetector'
import { ghostClick } from '../GhostClick'
import { browserTimeout } from '../BrowserTiming'
import { URLs, REWARDS_BASE_URL } from '../../constants/urls'
import type { Page } from 'patchright'
import type { BotContext } from '../../core/BotContext'
import { unknownPageDiagnostic } from '../../util/ErrorDiagnostic'
import { suspendMediaBlocking } from '../MediaBlocker'

import { MobileAccessLogin } from './methods/MobileAccessLogin'
import { EmailLogin } from './methods/EmailLogin'
import { PasswordlessLogin } from './methods/PasswordlessLogin'
import { TotpLogin } from './methods/Totp2FALogin'
import { CodeLogin } from './methods/GetACodeLogin'
import { RecoveryLogin } from './methods/RecoveryEmailLogin'
import { canPromptForInput } from './methods/LoginUtils'

import type { Account } from '../../core/Account'

type SignInMethodOption = {
    index: number
    selector: string
    label: string
    signature: string
}

type SignInMethodType = 'PASSWORD' | 'AUTHENTICATOR' | 'EMAIL' | 'PASSKEY' | 'TOTP' | 'UNKNOWN'

export class Login {
    private lastDetectedState = ''
    emailLogin: EmailLogin
    passwordlessLogin: PasswordlessLogin
    totp2FALogin: TotpLogin
    codeLogin: CodeLogin
    recoveryLogin: RecoveryLogin

    private readonly capturedUnknownUrls = new Set<string>()
    private signInMethodsLogged = false
    private passwordlessMethodSelected = false

    private readonly selectors = LOGIN_SELECTORS

    constructor(private bot: BotContext) {
        this.emailLogin = new EmailLogin(this.bot)
        this.passwordlessLogin = new PasswordlessLogin(this.bot)
        this.totp2FALogin = new TotpLogin(this.bot)
        this.codeLogin = new CodeLogin(this.bot)
        this.recoveryLogin = new RecoveryLogin(this.bot)
    }

    async login(page: Page, account: Account, sessionOnly = false) {
        let removeFidoRoute: (() => Promise<void>) | undefined
        try {
            suspendMediaBlocking(this.bot, page.context())
            this.capturedUnknownUrls.clear()
            this.signInMethodsLogged = false
            this.passwordlessMethodSelected = false
            this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Starting login process')

            await page
                .goto(URLs.rewards.userLogin, {
                    waitUntil: 'domcontentloaded'
                })
                .catch(() => undefined)
            await this.bot.utils.wait(2000)
            await this.bot.browser.utils.reloadNetworkError(page)
            removeFidoRoute = await this.bot.browser.utils.blockPasskeys(page)

            const maxIterations = 25
            let iteration = 0
            let loggedIn = false
            let previousState: LoginState = 'UNKNOWN'
            let sameStateCount = 0

            const deadline = Date.now() + 10 * 60 * 1000
            while (iteration < maxIterations) {
                this.bot.signal.throwIfAborted()
                if (Date.now() > deadline) throw new Error('Login exceeded its 10-minute deadline')
                if (page.isClosed()) throw new Error('Page closed unexpectedly')

                iteration++
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN', `State check iteration ${iteration}/${maxIterations}`)

                const detected = await this.detectCurrentState(page)
                if (page.url() !== detected.url) continue
                const { state } = detected
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN', `Current state: ${state}`)

                if (state !== previousState && previousState !== 'UNKNOWN') {
                    this.bot.logger.debug(this.bot.isMobile, 'LOGIN', `State transition: ${previousState} → ${state}`)
                }

                if (
                    state === previousState &&
                    state !== 'LOGGED_IN' &&
                    state !== 'UNKNOWN' &&
                    state !== 'PAGE_TRANSITION'
                ) {
                    sameStateCount++
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'LOGIN',
                        `Same state count: ${sameStateCount}/4 for state "${state}"`
                    )
                    if (sameStateCount >= 4) {
                        this.bot.logger.warn(
                            this.bot.isMobile,
                            'LOGIN',
                            `Stuck in state "${state}" for 4 loops, refreshing page`
                        )
                        await page.reload({ waitUntil: 'domcontentloaded' })
                        await this.bot.utils.wait(3000)
                        sameStateCount = 0
                        previousState = 'UNKNOWN'
                        continue
                    }
                } else {
                    sameStateCount = 0
                }
                previousState = state

                if (state === 'LOGGED_IN') {
                    loggedIn = true
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Successfully logged in')
                    break
                }

                const shouldContinue = await this.handleState(detected, page, account)
                if (!shouldContinue) {
                    throw new Error(`Login failed or aborted at state: ${state}`)
                }

                await this.bot.utils.wait(1000)
            }

            if (!loggedIn) {
                throw new Error('Login timeout: exceeded maximum iterations')
            }

            await removeFidoRoute()
            removeFidoRoute = undefined
            await this.finalizeLogin(page, account, sessionOnly)
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'LOGIN',
                `Fatal error: ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        } finally {
            await removeFidoRoute?.().catch(() => undefined)
        }
    }

    private async detectCurrentState(page: Page): Promise<LoginStateSnapshot> {
        const snapshot = await new LoginStateDetector(this.bot, this.passwordlessMethodSelected).detect(page)
        const url = new URL(snapshot.url)
        const observation = `${snapshot.state} | page=${url.hostname}${url.pathname}`
        if (observation !== this.lastDetectedState) {
            this.lastDetectedState = observation
            this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', observation)
        }
        return snapshot
    }

    private async checkSelector(page: Page, selector: string): Promise<boolean> {
        return page
            .locator(selector)
            .first()
            .isVisible()
            .catch(() => false)
    }

    private normalizeSignInText(value: string): string {
        return value.replace(/\s+/g, ' ').trim()
    }

    private sanitizeSignInLabel(value: string): string {
        return this.normalizeSignInText(value)
            .replace(/[\w.+*-]+@[\w.-]+\.[a-z]{2,}/gi, '<email>')
            .replace(/\+?\d[\d\s().*-]{5,}\d/g, '<phone>')
    }

    private async getSignInMethodOptions(page: Page): Promise<SignInMethodOption[]> {
        const tiles = page.locator(this.selectors.signInTile)
        const count = await tiles.count().catch(() => 0)
        const options = await Promise.all(
            Array.from({ length: count }, async (_, index): Promise<SignInMethodOption | null> => {
                const tile = tiles.nth(index)
                if (!(await tile.isVisible().catch(() => false))) return null

                const metadata = await tile
                    .evaluate(element => {
                        const elements = [element, ...Array.from(element.querySelectorAll('*'))]
                        const structuralAttributeNames = new Set([
                            'id',
                            'name',
                            'src',
                            'data-testid',
                            'data-value',
                            'data-bind',
                            'd'
                        ])
                        const accessibleText = elements
                            .flatMap(node => ['aria-label', 'title', 'alt'].map(name => node.getAttribute(name) ?? ''))
                            .filter(Boolean)
                            .join(' ')
                        const structuralAttributes = elements
                            .flatMap(node =>
                                Array.from(node.attributes)
                                    .filter(attribute => structuralAttributeNames.has(attribute.name))
                                    .map(attribute => `${attribute.name}=${attribute.value}`)
                            )
                            .join(' ')

                        return {
                            text: element.textContent ?? '',
                            accessibleText,
                            structuralAttributes
                        }
                    })
                    .catch(() => null)

                if (!metadata) return null

                const label = this.normalizeSignInText(`${metadata.text} ${metadata.accessibleText}`)
                const signature = this.normalizeSignInText(metadata.structuralAttributes).toLowerCase()

                return {
                    index,
                    selector: `${this.selectors.signInTile} >> nth=${index}`,
                    label: label || `Sign-in option ${index + 1}`,
                    signature
                }
            })
        )

        return options.filter((option): option is SignInMethodOption => option !== null)
    }

    private classifySignInMethod(option: SignInMethodOption): SignInMethodType {
        const signature = option.signature

        // Sign in another way - classify method tiles from structural signatures, not translated labels
        if (signature.includes('m5.25 4h13.5a3.25') || signature.includes('picker_verify_email')) return 'EMAIL'
        if (signature.includes('m11.78 10.22a.75')) return 'PASSWORD'
        // Known passkey/security-key SVG signature keeps it out of the Authenticator fallback
        if (/picker_fido|passkey|fido|m18 16\.66a3\.51/.test(signature)) return 'PASSKEY'
        if (/phone[\s_-]*app[\s_-]*otp|\btotp\b/.test(signature)) return 'TOTP'
        // Known Remote NGC/mobile-app SVG signature identifies Microsoft Authenticator language-independently
        if (
            /remote[\s_-]*ngc|picker_remote_ngc|phone[\s_-]*app[\s_-]*notification|push[\s_-]*notification|m15\.75 2c16\.99 2 18 3/.test(
                signature
            )
        ) {
            return 'AUTHENTICATOR'
        }

        return 'UNKNOWN'
    }

    private async clickSignInMethodOption(page: Page, option: SignInMethodOption): Promise<boolean> {
        const clicked = await this.bot.browser.utils.click(page, option.selector)
        if (clicked) return true

        return ghostClick(
            page,
            page.locator(this.selectors.signInTile).nth(option.index),
            browserTimeout(this.bot),
            this.bot.signal
        )
            .then(() => true)
            .catch(() => false)
    }

    private logAvailableSignInMethods(options: SignInMethodOption[]): void {
        if (this.signInMethodsLogged) return
        this.signInMethodsLogged = true
        if (options.length === 0) return

        const labels = options.map(option => this.sanitizeSignInLabel(option.label))
        this.bot.logger.debug(this.bot.isMobile, 'LOGIN', `Available sign-in methods: ${labels.join(' | ')}`)
    }

    private async waitForIdle(page: Page, note: string, timeout = 5000): Promise<void> {
        await page.waitForLoadState('domcontentloaded', { timeout }).catch(() => {
            this.bot.logger.debug(this.bot.isMobile, 'LOGIN', `Document readiness timeout: ${note}`)
        })
    }

    private async tryClick(page: Page, selector: string, label: string, timeout = 2000): Promise<boolean> {
        const found = await page.waitForSelector(selector, { state: 'visible', timeout }).catch(() => null)
        if (!found) return false

        const clicked = await this.bot.browser.utils.click(page, selector)
        if (!clicked) return false

        await this.waitForIdle(page, `after ${label}`)
        this.bot.logger.debug(this.bot.isMobile, 'LOGIN', `${label} clicked`)
        return true
    }

    private async handleState(
        { state, url: detectedUrl }: LoginStateSnapshot,
        page: Page,
        account: Account
    ): Promise<boolean> {
        if (page.url() !== detectedUrl) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'HANDLE-STATE',
                'Page changed after state detection; checking again'
            )
            return true
        }
        this.bot.logger.debug(this.bot.isMobile, 'HANDLE-STATE', `Processing state: ${state}`)

        switch (state) {
            case 'ACCOUNT_LOCKED': {
                const msg = 'This account has been locked! Remove from config and restart!'
                this.bot.logger.error(this.bot.isMobile, 'LOGIN', msg)
                throw new Error(msg)
            }

            case 'ERROR_ALERT': {
                const alertEl = page.locator(this.selectors.errorAlert)
                const errorMsg = await alertEl.innerText().catch(() => 'Unknown Error')
                this.bot.logger.error(this.bot.isMobile, 'LOGIN', `Account error: ${errorMsg}`)
                throw new Error(`Microsoft login error: ${errorMsg}`)
            }

            case 'LOGGED_IN':
                return true

            case 'EMAIL_INPUT': {
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN', 'Entering email')
                const result = await this.emailLogin.enterEmail(page, account.email)
                if (result !== 'ok') return false
                await this.waitForIdle(page, 'after email entry')
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN', 'Email entered successfully')
                return true
            }

            // Enter password - use it only when Microsoft actually presents the password page
            case 'PASSWORD_INPUT': {
                if (!account.password) {
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'LOGIN',
                        'Password input detected but no password is configured; returning to sign-in methods'
                    )
                    if (await this.tryClick(page, this.selectors.backButton, 'Back button')) return true

                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'LOGIN',
                        'No configured password and no way to return to sign-in methods'
                    )
                    return false
                }

                this.bot.logger.debug(this.bot.isMobile, 'LOGIN', 'Entering password')
                const result = await this.emailLogin.enterPassword(page, account.password)
                if (result === 'error') return false
                await this.waitForIdle(page, 'after password entry')
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN', 'Password entered successfully')
                return true
            }

            // Generic alternative-method footer - open the method picker before choosing a credential
            case 'FOOTER_ACTION': {
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN', 'Opening alternative sign-in methods')
                const clicked = await this.bot.browser.utils.click(page, this.selectors.footerAction)
                if (!clicked) {
                    this.bot.logger.warn(this.bot.isMobile, 'LOGIN', 'Could not open alternative sign-in methods')
                    return false
                }
                this.passwordlessMethodSelected = false
                await this.waitForIdle(page, 'after sign-in footer action')
                return true
            }

            // Get a sign-in request - keep the primary Authenticator action when footer is a proof fallback
            case 'PASSWORDLESS_SEND_CODE': {
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN', 'Continuing with primary sign-in method')
                const clicked = await this.bot.browser.utils.click(page, this.selectors.primaryButton)
                if (!clicked) {
                    this.bot.logger.warn(this.bot.isMobile, 'LOGIN', 'Could not continue with primary sign-in method')
                    return false
                }
                await this.waitForIdle(page, 'after primary sign-in action')
                return true
            }

            // Sign in another way - prefer offered password, then Authenticator, then interactive email code
            case 'SIGN_IN_METHOD_PICKER': {
                const options = await this.getSignInMethodOptions(page)
                this.logAvailableSignInMethods(options)

                const methods = options.map(option => ({ option, type: this.classifySignInMethod(option) }))
                const passwordOption = methods.find(method => method.type === 'PASSWORD')?.option
                const authenticatorOption = methods.find(method => method.type === 'AUTHENTICATOR')?.option
                const emailOption = methods.find(method => method.type === 'EMAIL')?.option

                if (account.password && passwordOption) {
                    this.bot.logger.debug(this.bot.isMobile, 'LOGIN', 'Password sign-in is available; selecting it')
                    this.passwordlessMethodSelected = false

                    if (!(await this.clickSignInMethodOption(page, passwordOption))) {
                        this.bot.logger.warn(this.bot.isMobile, 'LOGIN', 'Could not select password sign-in method')
                        return false
                    }

                    await this.waitForIdle(page, 'after password method selection')
                    return true
                }

                const passwordlessOptionOldFound = await this.checkSelector(page, this.selectors.passwordlessOptionOld)
                if (authenticatorOption || passwordlessOptionOldFound) {
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Selecting Microsoft Authenticator sign-in')
                    this.passwordlessMethodSelected = true

                    const clicked = authenticatorOption
                        ? await this.clickSignInMethodOption(page, authenticatorOption)
                        : await this.bot.browser.utils.click(page, this.selectors.passwordlessOptionOld)

                    if (!clicked) {
                        this.passwordlessMethodSelected = false
                        this.bot.logger.warn(this.bot.isMobile, 'LOGIN', 'Could not select Microsoft Authenticator')
                        return false
                    }

                    await this.waitForIdle(page, 'after Microsoft Authenticator selection')

                    const passwordlessChallengeVisible =
                        (await this.checkSelector(page, this.selectors.passwordlessCheck)) ||
                        (await this.checkSelector(page, this.selectors.passwordlessNumber))

                    if (
                        !passwordlessChallengeVisible &&
                        (await this.checkSelector(page, this.selectors.primaryButton))
                    ) {
                        this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Sending Microsoft Authenticator request')
                        const confirmed = await this.bot.browser.utils.click(page, this.selectors.primaryButton)
                        if (!confirmed) {
                            this.passwordlessMethodSelected = false
                            this.bot.logger.warn(
                                this.bot.isMobile,
                                'LOGIN',
                                'Could not send Microsoft Authenticator request'
                            )
                            return false
                        }
                        await this.waitForIdle(page, 'after Microsoft Authenticator request')
                    }

                    return true
                }

                const emailIconOldFound = await this.checkSelector(page, this.selectors.emailIconOld)
                if (emailOption || emailIconOldFound) {
                    if (!canPromptForInput()) {
                        this.bot.logger.error(
                            this.bot.isMobile,
                            'LOGIN',
                            'No supported non-interactive sign-in method is available; email-code fallback requires interactive stdin'
                        )
                        return false
                    }

                    this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Selecting email-code sign-in')
                    this.passwordlessMethodSelected = false

                    const clicked = emailOption
                        ? await this.clickSignInMethodOption(page, emailOption)
                        : await this.bot.browser.utils.click(page, this.selectors.emailIconOld)

                    if (!clicked) {
                        this.bot.logger.warn(this.bot.isMobile, 'LOGIN', 'Could not select email-code sign-in method')
                        return false
                    }

                    await this.waitForIdle(page, 'after email method selection')
                    await this.codeLogin.handle(page)
                    return true
                }

                const ignoredMethods = methods
                    .map(method => method.type)
                    .filter(type => type === 'PASSKEY' || type === 'TOTP' || type === 'UNKNOWN')

                this.bot.logger.error(
                    this.bot.isMobile,
                    'LOGIN',
                    `No supported sign-in method available${ignoredMethods.length ? `; ignored=${ignoredMethods.join(',')}` : ''}`
                )
                return false
            }

            // Recovery email confirmation
            case 'RECOVERY_EMAIL_INPUT': {
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN', 'Recovery email input detected')
                await this.waitForIdle(page, 'on recovery page')
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN', 'Initiating recovery email handler')
                await this.recoveryLogin.handle(page, account?.recoveryEmail)
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN', 'Recovery email handler completed successfully')
                return true
            }

            // Verify your email - identical footer actions are validated by their resulting state, not position
            case 'EMAIL_VERIFICATION_INPUT': {
                if (!account.password) {
                    if (!canPromptForInput()) {
                        this.bot.logger.error(
                            this.bot.isMobile,
                            'LOGIN',
                            'Email verification requires a configured password or interactive stdin'
                        )
                        return false
                    }

                    this.bot.logger.debug(this.bot.isMobile, 'LOGIN', 'Email verification input detected')
                    await this.codeLogin.handle(page)
                    return true
                }

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'LOGIN',
                    'Email verification input detected; checking alternatives'
                )
                await this.waitForIdle(page, 'on email verification page')

                const waitForState = async (accept: (state: LoginState) => boolean): Promise<LoginState | null> => {
                    const deadline = Date.now() + browserTimeout(this.bot)

                    while (Date.now() < deadline) {
                        this.bot.signal.throwIfAborted()

                        const detected = await this.detectCurrentState(page)
                        if (page.url() === detected.url && accept(detected.state)) return detected.state

                        await this.bot.utils.wait(100)
                    }

                    return null
                }

                const footerSelector = `${this.selectors.footerAction}:visible`
                const footerCount = await page
                    .locator(footerSelector)
                    .count()
                    .catch(() => 0)

                for (let index = 0; index < footerCount; index++) {
                    const selector = `${footerSelector} >> nth=${index}`
                    if (!(await this.bot.browser.utils.click(page, selector))) continue

                    const nextState = await waitForState(
                        state =>
                            state !== 'EMAIL_VERIFICATION_INPUT' && state !== 'UNKNOWN' && state !== 'PAGE_TRANSITION'
                    )
                    if (!nextState) continue

                    if (nextState === 'PASSWORD_INPUT') {
                        this.passwordlessMethodSelected = false
                        this.bot.logger.debug(this.bot.isMobile, 'LOGIN', 'Password sign-in option selected')
                        return true
                    }

                    if (nextState === 'SIGN_IN_METHOD_PICKER') {
                        this.passwordlessMethodSelected = false
                        this.bot.logger.debug(this.bot.isMobile, 'LOGIN', 'Sign-in method picker opened')
                        return true
                    }

                    // Let the main login loop handle other recognized sign-in states
                    if (nextState !== 'OTP_CODE_ENTRY') return true

                    if (!(await this.tryClick(page, this.selectors.backButton, 'Back button'))) break

                    // Fluent views can change after the document is already ready
                    const returned = await waitForState(state => state === 'EMAIL_VERIFICATION_INPUT')
                    if (!returned) break
                }

                if (canPromptForInput()) {
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Falling back to interactive email verification')
                    await this.codeLogin.handle(page)
                    return true
                }

                this.bot.logger.warn(this.bot.isMobile, 'LOGIN', 'No usable email verification alternative found')
                return false
            }

            case 'CHROMEWEBDATA_ERROR': {
                this.bot.logger.warn(this.bot.isMobile, 'LOGIN', 'chromewebdata error detected, attempting recovery')
                for (const url of [REWARDS_BASE_URL, URLs.auth.loginLive]) {
                    this.bot.signal.throwIfAborted()
                    try {
                        const response = await page.goto(url, {
                            waitUntil: 'domcontentloaded',
                            timeout: browserTimeout(this.bot, 'navigation')
                        })
                        if (page.url().startsWith('chrome-error:') || (response && !response.ok()))
                            throw new Error(
                                `Recovery navigation failed | status=${response?.status() ?? 'unavailable'}`
                            )
                        this.bot.logger.debug(
                            this.bot.isMobile,
                            'LOGIN',
                            'Recovery navigation completed; checking sign-in state'
                        )
                        return true
                    } catch (error) {
                        this.bot.signal.throwIfAborted()
                        if (url === URLs.auth.loginLive) throw error
                        this.bot.logger.warn(
                            this.bot.isMobile,
                            'LOGIN',
                            `Recovery navigation failed; trying login.live.com | ${error instanceof Error ? error.message : String(error)}`
                        )
                    }
                }
                return false
            }

            case '2FA_TOTP': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'TOTP 2FA authentication required')
                await this.totp2FALogin.handle(page, account.totpSecret)
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN', 'TOTP 2FA handler completed successfully')
                return true
            }

            // Stay signed in / KMSI confirmation
            case 'KMSI_PROMPT': {
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN', 'Accepting KMSI prompt')
                const clicked = await this.bot.browser.utils.click(page, this.selectors.primaryButton)
                if (!clicked) {
                    this.bot.logger.warn(this.bot.isMobile, 'LOGIN', 'Could not accept KMSI prompt')
                    return false
                }
                await this.waitForIdle(page, 'after KMSI acceptance')
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN', 'KMSI prompt accepted')
                return true
            }

            // Passkey prompt/error - skip back to a supported sign-in method
            case 'PASSKEY_VIDEO':
            case 'PASSKEY_ERROR': {
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN', 'Skipping Passkey prompt')
                const clicked = await this.bot.browser.utils.click(page, this.selectors.secondaryButton)
                if (!clicked) {
                    this.bot.logger.warn(this.bot.isMobile, 'LOGIN', 'Could not skip Passkey prompt')
                    return false
                }
                await this.waitForIdle(page, 'after Passkey skip')
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN', 'Passkey prompt skipped')
                return true
            }

            // Microsoft Authenticator approval/number challenge
            case 'LOGIN_PASSWORDLESS': {
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN', 'Handling passwordless authentication')
                await this.passwordlessLogin.handle(page)
                this.passwordlessMethodSelected = false
                await this.waitForIdle(page, 'after passwordless auth')
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN', 'Passwordless authentication completed successfully')
                return true
            }

            // Enter your code - prefer its alternate-method footer before Back to avoid an email-code loop
            case 'OTP_CODE_ENTRY': {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'LOGIN',
                    'OTP code entry page detected; trying an available alternative sign-in method'
                )

                if (await this.checkSelector(page, this.selectors.footerAction)) {
                    const clicked = await this.bot.browser.utils.click(page, this.selectors.footerAction)
                    if (clicked) {
                        await this.waitForIdle(page, 'after OTP alternative sign-in action')

                        const stillOnOtp = await this.checkSelector(page, this.selectors.otpCodeEntry)
                        if (!stillOnOtp) {
                            const methodPickerVisible =
                                (await this.checkSelector(page, this.selectors.signInTile)) ||
                                (await this.checkSelector(page, this.selectors.passwordlessOptionOld)) ||
                                (await this.checkSelector(page, this.selectors.emailIconOld))
                            const passwordlessLandingVisible =
                                (await this.checkSelector(page, this.selectors.passwordlessCheck)) ||
                                (await this.checkSelector(page, this.selectors.passwordlessNumber)) ||
                                ((await this.checkSelector(page, this.selectors.identityBanner)) &&
                                    (await this.checkSelector(page, this.selectors.primaryButton)))

                            this.passwordlessMethodSelected = passwordlessLandingVisible
                            this.bot.logger.debug(
                                this.bot.isMobile,
                                'LOGIN',
                                methodPickerVisible
                                    ? 'Returned to sign-in method selection'
                                    : passwordlessLandingVisible
                                      ? 'Switched to Microsoft Authenticator sign-in'
                                      : 'Switched away from email-code authentication'
                            )
                            return true
                        }

                        this.bot.logger.debug(
                            this.bot.isMobile,
                            'LOGIN',
                            'OTP footer action did not leave the code-entry page; falling back to Back'
                        )
                    }
                }

                this.passwordlessMethodSelected = false
                if (!(await this.tryClick(page, this.selectors.backButton, 'Back button'))) {
                    this.bot.logger.warn(this.bot.isMobile, 'LOGIN', 'No usable alternative action found on OTP page')
                    return false
                }

                return true
            }

            case 'PAGE_TRANSITION':
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN', 'Login redirect is still in progress, waiting')
                return true

            case 'UNKNOWN': {
                const rawUrl = detectedUrl
                const url = new URL(rawUrl)
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'LOGIN',
                    `Unknown state at ${url.hostname}${url.pathname}, waiting`
                )

                if (this.bot.config.errorDiagnostics && !this.capturedUnknownUrls.has(rawUrl)) {
                    this.capturedUnknownUrls.add(rawUrl)
                    await unknownPageDiagnostic(page, {
                        platform: this.bot.isMobile ? 'mobile' : 'desktop'
                    })
                }
                return true
            }

            default:
                this.bot.logger.debug(this.bot.isMobile, 'HANDLE-STATE', `Unhandled state: ${state}, continuing`)
                return true
        }
    }

    private finalizeLogin(page: Page, account: Account, sessionOnly: boolean): Promise<void> {
        return new LoginSession(this.bot, async (target, selected) => {
            const detected = await this.detectCurrentState(target)
            if (target.url() === detected.url && !(await this.handleState(detected, target, selected)))
                throw new Error(`Bing sign-in failed at ${detected.state}`)
        }).finalize(page, account, sessionOnly)
    }

    async getAppAccessToken(page: Page, email: string) {
        this.bot.logger.debug(this.bot.isMobile, 'GET-APP-TOKEN', 'Requesting app access token')
        return await new MobileAccessLogin(this.bot, page).getAccessToken(email)
    }
}
