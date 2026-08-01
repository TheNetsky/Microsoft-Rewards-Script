import { URLs, REWARDS_BASE_URL } from '../../constants/urls'
import type { Page } from 'patchright'
import type { MicrosoftRewardsBot } from '../../index'
import { saveStorageState } from '../../util/SessionStore'
import { unknownPageDiagnostic } from '../../util/ErrorDiagnostic'

import { MobileAccessLogin } from './methods/MobileAccessLogin'
import { EmailLogin } from './methods/EmailLogin'
import { PasswordlessLogin } from './methods/PasswordlessLogin'
import { TotpLogin } from './methods/Totp2FALogin'
import { CodeLogin } from './methods/GetACodeLogin'
import { RecoveryLogin } from './methods/RecoveryEmailLogin'

import type { Account } from '../../interface/Account'

type LoginState =
    | 'EMAIL_INPUT'
    | 'PASSWORD_INPUT'
    | 'SIGN_IN_ANOTHER_WAY'
    | 'SIGN_IN_ANOTHER_WAY_EMAIL'
    | 'PASSKEY_ERROR'
    | 'PASSKEY_VIDEO'
    | 'KMSI_PROMPT'
    | 'LOGGED_IN'
    | 'RECOVERY_EMAIL_INPUT'
    | 'ACCOUNT_LOCKED'
    | 'ERROR_ALERT'
    | '2FA_TOTP'
    | 'LOGIN_PASSWORDLESS'
    | 'GET_A_CODE'
    | 'GET_A_CODE_2'
    | 'OTP_CODE_ENTRY'
    | 'UNKNOWN'
    | 'CHROMEWEBDATA_ERROR'

export class Login {
    emailLogin: EmailLogin
    passwordlessLogin: PasswordlessLogin
    totp2FALogin: TotpLogin
    codeLogin: CodeLogin
    recoveryLogin: RecoveryLogin

    private readonly capturedUnknownUrls = new Set<string>()

    private readonly selectors = {
        primaryButton: 'button[data-testid="primaryButton"]',
        secondaryButton: 'button[data-testid="secondaryButton"]',
        emailIcon: '[data-testid="tile"]:has(svg path[d*="M5.25 4h13.5a3.25"])',
        emailIconOld: 'img[data-testid="accessibleImg"][src*="picker_verify_email"]',
        recoveryEmail: '[data-testid="proof-confirmation"]',
        passwordIcon: '[data-testid="tile"]:has(svg path[d*="M11.78 10.22a.75.75"])',
        accountLocked: '#serviceAbuseLandingTitle',
        errorAlert: 'div[role="alert"]',
        passwordEntry: '[data-testid="passwordEntry"]',
        emailEntry: 'input#usernameEntry',
        kmsiVideo: '[data-testid="kmsiVideo"]',
        passKeyVideo: '[data-testid="biometricVideo"]',
        passKeyError: '[data-testid="registrationImg"]',
        passwordlessCheck: '[data-testid="deviceShieldCheckmarkVideo"]',
        totpInput: 'input[name="otc"]',
        totpInputOld: 'form[name="OneTimeCodeViewForm"]',
        identityBanner: '[data-testid="identityBanner"]',
        viewFooter: '[data-testid="viewFooter"] >> [role="button"]',
        otherWaysToSignIn: '[data-testid="viewFooter"] span[role="button"]',
        otpCodeEntry: '[data-testid="codeEntry"]',
        backButton: '#back-button',
        bingProfile: '#id_n',
        otpInput: 'div[data-testid="codeEntry"]'
    } as const

    constructor(private bot: MicrosoftRewardsBot) {
        this.emailLogin = new EmailLogin(this.bot)
        this.passwordlessLogin = new PasswordlessLogin(this.bot)
        this.totp2FALogin = new TotpLogin(this.bot)
        this.codeLogin = new CodeLogin(this.bot)
        this.recoveryLogin = new RecoveryLogin(this.bot)
    }

    async login(page: Page, account: Account) {
        try {
            this.capturedUnknownUrls.clear()
            this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Starting login process')

            await page
                .goto(URLs.rewards.createUser, {
                    waitUntil: 'domcontentloaded'
                })
                .catch(() => {})
            await this.bot.utils.wait(2000)
            await this.bot.browser.utils.reloadBadPage(page)
            await this.bot.browser.utils.disableFido(page)

            const maxIterations = 25
            let iteration = 0
            let previousState: LoginState = 'UNKNOWN'
            let sameStateCount = 0

            while (iteration < maxIterations) {
                if (page.isClosed()) throw new Error('Page closed unexpectedly')

                iteration++
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN', `State check iteration ${iteration}/${maxIterations}`)

                const state = await this.detectCurrentState(page, account)
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN', `Current state: ${state}`)

                if (state !== previousState && previousState !== 'UNKNOWN') {
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN', `State transition: ${previousState} → ${state}`)
                }

                if (state === previousState && state !== 'LOGGED_IN' && state !== 'UNKNOWN') {
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
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Successfully logged in')
                    break
                }

                const shouldContinue = await this.handleState(state, page, account)
                if (!shouldContinue) {
                    throw new Error(`Login failed or aborted at state: ${state}`)
                }

                await this.bot.utils.wait(1000)
            }

            if (iteration >= maxIterations) {
                throw new Error('Login timeout: exceeded maximum iterations')
            }

            await this.finalizeLogin(page, account)
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'LOGIN',
                `Fatal error: ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }

    private async detectCurrentState(page: Page, account?: Account): Promise<LoginState> {
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})

        const url = new URL(page.url())
        this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', `Current URL: ${url.hostname}${url.pathname}`)

        if (url.hostname === 'chromewebdata') {
            this.bot.logger.warn(this.bot.isMobile, 'DETECT-STATE', 'Detected chromewebdata error page')
            return 'CHROMEWEBDATA_ERROR'
        }

        const isLocked = await this.checkSelector(page, this.selectors.accountLocked)
        if (isLocked) {
            this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', 'Account locked selector found')
            return 'ACCOUNT_LOCKED'
        }

        if (url.hostname === 'rewards.bing.com' || url.hostname === 'account.microsoft.com') {
            this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', 'On rewards/account page, assuming logged in')
            return 'LOGGED_IN'
        }

        const stateChecks: Array<[string, LoginState]> = [
            [this.selectors.errorAlert, 'ERROR_ALERT'],
            [this.selectors.passwordEntry, 'PASSWORD_INPUT'],
            [this.selectors.emailEntry, 'EMAIL_INPUT'],
            [this.selectors.recoveryEmail, 'RECOVERY_EMAIL_INPUT'],
            [this.selectors.kmsiVideo, 'KMSI_PROMPT'],
            [this.selectors.passKeyVideo, 'PASSKEY_VIDEO'],
            [this.selectors.passKeyError, 'PASSKEY_ERROR'],
            [this.selectors.passwordIcon, 'SIGN_IN_ANOTHER_WAY'],
            [this.selectors.emailIcon, 'SIGN_IN_ANOTHER_WAY_EMAIL'],
            [this.selectors.emailIconOld, 'SIGN_IN_ANOTHER_WAY_EMAIL'],
            [this.selectors.passwordlessCheck, 'LOGIN_PASSWORDLESS'],
            [this.selectors.totpInput, '2FA_TOTP'],
            [this.selectors.totpInputOld, '2FA_TOTP'],
            [this.selectors.otpCodeEntry, 'OTP_CODE_ENTRY'],
            [this.selectors.otpInput, 'OTP_CODE_ENTRY']
        ]

        const results = await Promise.all(
            stateChecks.map(async ([sel, state]) => {
                const visible = await this.checkSelector(page, sel)
                return visible ? state : null
            })
        )

        const visibleStates = results.filter((s): s is LoginState => s !== null)
        if (visibleStates.length > 0) {
            this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', `Visible states: [${visibleStates.join(', ')}]`)
        }

        const [identityBanner, primaryButton, passwordEntry] = await Promise.all([
            this.checkSelector(page, this.selectors.identityBanner),
            this.checkSelector(page, this.selectors.primaryButton),
            this.checkSelector(page, this.selectors.passwordEntry)
        ])

        if (identityBanner && primaryButton && !passwordEntry && !results.includes('2FA_TOTP')) {
            const codeState = account?.password ? 'GET_A_CODE' : 'GET_A_CODE_2'
            this.bot.logger.debug(
                this.bot.isMobile,
                'DETECT-STATE',
                `Get code state detected: ${codeState} (has password: ${!!account?.password})`
            )
            results.push(codeState)
        }

        let foundStates = results.filter((s): s is LoginState => s !== null)

        if (foundStates.length === 0) {
            this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', 'No matching states found')
            return 'UNKNOWN'
        }

        if (foundStates.includes('ERROR_ALERT')) {
            const errorIsReal = url.hostname === 'login.live.com' && !foundStates.includes('2FA_TOTP')
            this.bot.logger.debug(
                this.bot.isMobile,
                'DETECT-STATE',
                `ERROR_ALERT found - hostname: ${url.hostname}, has 2FA: ${foundStates.includes('2FA_TOTP')}, treating as real: ${errorIsReal}`
            )
            if (errorIsReal) return 'ERROR_ALERT'
            foundStates = foundStates.filter(s => s !== 'ERROR_ALERT')
        }

        const priorities: LoginState[] = [
            'ACCOUNT_LOCKED',
            'PASSKEY_VIDEO',
            'PASSKEY_ERROR',
            'KMSI_PROMPT',
            'PASSWORD_INPUT',
            'EMAIL_INPUT',
            'SIGN_IN_ANOTHER_WAY', // Prefer password option over email code
            'SIGN_IN_ANOTHER_WAY_EMAIL',
            'OTP_CODE_ENTRY',
            'GET_A_CODE',
            'GET_A_CODE_2',
            'LOGIN_PASSWORDLESS',
            '2FA_TOTP'
        ]

        for (const priority of priorities) {
            if (foundStates.includes(priority)) {
                this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', `Selected state by priority: ${priority}`)
                return priority
            }
        }

        this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', `Returning first found state: ${foundStates[0]}`)
        return foundStates[0] as LoginState
    }

    private async checkSelector(page: Page, selector: string): Promise<boolean> {
        return page
            .waitForSelector(selector, { state: 'visible', timeout: 200 })
            .then(() => true)
            .catch(() => false)
    }

    private async waitForIdle(page: Page, note: string, timeout = 5000): Promise<void> {
        await page.waitForLoadState('networkidle', { timeout }).catch(() => {
            this.bot.logger.debug(this.bot.isMobile, 'LOGIN', `Network idle timeout: ${note}`)
        })
    }

    private async tryClick(page: Page, selector: string, label: string, timeout = 2000): Promise<boolean> {
        const found = await page.waitForSelector(selector, { state: 'visible', timeout }).catch(() => null)
        if (!found) return false

        await this.bot.browser.utils.ghostClick(page, selector)
        await this.waitForIdle(page, `after ${label}`)
        this.bot.logger.info(this.bot.isMobile, 'LOGIN', `${label} clicked`)
        return true
    }

    private async handleState(state: LoginState, page: Page, account: Account): Promise<boolean> {
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
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Entering email')
                await this.emailLogin.enterEmail(page, account.email)
                await this.waitForIdle(page, 'after email entry')
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Email entered successfully')
                return true
            }

            case 'PASSWORD_INPUT': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Entering password')
                await this.emailLogin.enterPassword(page, account.password)
                await this.waitForIdle(page, 'after password entry')
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Password entered successfully')
                return true
            }

            case 'GET_A_CODE': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Attempting to bypass "Get code" page')

                // Try each bypass option in order
                if (await this.tryClick(page, this.selectors.otherWaysToSignIn, 'Other ways to sign in', 3000)) {
                    return true
                }
                if (await this.tryClick(page, this.selectors.viewFooter, 'Footer link')) {
                    return true
                }
                if (await this.tryClick(page, this.selectors.backButton, 'Back button')) {
                    return true
                }

                this.bot.logger.warn(this.bot.isMobile, 'LOGIN', 'Could not find way to bypass Get Code page')
                return true
            }

            case 'GET_A_CODE_2': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Handling "Get a code" flow')
                await this.bot.browser.utils.ghostClick(page, this.selectors.primaryButton)
                await this.waitForIdle(page, 'after primary button click')
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Initiating code login handler')
                await this.codeLogin.handle(page)
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Code login handler completed successfully')
                return true
            }

            case 'SIGN_IN_ANOTHER_WAY_EMAIL': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Selecting "Send a code to email"')

                const [emailIconFound, emailIconOldFound] = await Promise.all([
                    this.checkSelector(page, this.selectors.emailIcon),
                    this.checkSelector(page, this.selectors.emailIconOld)
                ])

                const emailSelector = emailIconFound
                    ? this.selectors.emailIcon
                    : emailIconOldFound
                      ? this.selectors.emailIconOld
                      : null

                if (!emailSelector) {
                    this.bot.logger.warn(this.bot.isMobile, 'LOGIN', 'Email icon not found')
                    return false
                }

                this.bot.logger.info(
                    this.bot.isMobile,
                    'LOGIN',
                    `Using ${emailSelector === this.selectors.emailIcon ? 'new' : 'old'} email icon selector`
                )
                await this.bot.browser.utils.ghostClick(page, emailSelector)
                await this.waitForIdle(page, 'after email icon click')
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Initiating code login handler')
                await this.codeLogin.handle(page)
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Code login handler completed successfully')
                return true
            }

            case 'RECOVERY_EMAIL_INPUT': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Recovery email input detected')
                await this.waitForIdle(page, 'on recovery page')
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Initiating recovery email handler')
                await this.recoveryLogin.handle(page, account?.recoveryEmail)
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Recovery email handler completed successfully')
                return true
            }

            case 'CHROMEWEBDATA_ERROR': {
                this.bot.logger.warn(this.bot.isMobile, 'LOGIN', 'chromewebdata error detected, attempting recovery')
                try {
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN', `Navigating to ${REWARDS_BASE_URL}`)
                    await page
                        .goto(REWARDS_BASE_URL, {
                            waitUntil: 'domcontentloaded',
                            timeout: 10000
                        })
                        .catch(() => {})
                    await this.bot.utils.wait(3000)
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Recovery navigation successful')
                    return true
                } catch {
                    this.bot.logger.warn(this.bot.isMobile, 'LOGIN', 'Fallback to login.live.com')
                    await page
                        .goto(URLs.auth.loginLive, {
                            waitUntil: 'domcontentloaded',
                            timeout: 10000
                        })
                        .catch(() => {})
                    await this.bot.utils.wait(3000)
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Fallback navigation successful')
                    return true
                }
            }

            case '2FA_TOTP': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'TOTP 2FA authentication required')
                await this.totp2FALogin.handle(page, account.totpSecret)
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'TOTP 2FA handler completed successfully')
                return true
            }

            case 'SIGN_IN_ANOTHER_WAY': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Selecting "Use my password"')
                await this.bot.browser.utils.ghostClick(page, this.selectors.passwordIcon)
                await this.waitForIdle(page, 'after password icon click')
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Password option selected')
                return true
            }

            case 'KMSI_PROMPT': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Accepting KMSI prompt')
                await this.bot.browser.utils.ghostClick(page, this.selectors.primaryButton)
                await this.waitForIdle(page, 'after KMSI acceptance')
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'KMSI prompt accepted')
                return true
            }

            case 'PASSKEY_VIDEO':
            case 'PASSKEY_ERROR': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Skipping Passkey prompt')
                await this.bot.browser.utils.ghostClick(page, this.selectors.secondaryButton)
                await this.waitForIdle(page, 'after Passkey skip')
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Passkey prompt skipped')
                return true
            }

            case 'LOGIN_PASSWORDLESS': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Handling passwordless authentication')
                await this.passwordlessLogin.handle(page)
                await this.waitForIdle(page, 'after passwordless auth')
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Passwordless authentication completed successfully')
                return true
            }

            case 'OTP_CODE_ENTRY': {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'LOGIN',
                    'OTP code entry page detected, attempting to find password option'
                )

                // Prefer the "Use your password"
                if (await this.tryClick(page, this.selectors.viewFooter, 'Footer link')) {
                    // clicked
                } else if (await this.tryClick(page, this.selectors.backButton, 'Back button')) {
                    // clicked
                } else {
                    this.bot.logger.warn(this.bot.isMobile, 'LOGIN', 'No navigation option found on OTP page')
                }

                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Navigated back from OTP entry page')
                return true
            }

            case 'UNKNOWN': {
                const rawUrl = page.url()
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

    private async finalizeLogin(page: Page, account: Account) {
        this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Finalizing login')

        await page.goto(REWARDS_BASE_URL, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {})

        const loginRewardsSuccess = new URL(page.url()).hostname === 'rewards.bing.com'
        if (loginRewardsSuccess) {
            this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Logged into Microsoft Rewards successfully')
        } else {
            this.bot.logger.warn(this.bot.isMobile, 'LOGIN', 'Could not verify Rewards Dashboard, assuming login valid')
        }

        // Dismiss at rewards dashboard
        await this.bot.browser.utils.tryDismissAllMessages(page).catch(() => {})

        this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Starting Bing session verification')
        await this.verifyBingSession(page, account)

        this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Acquiring rewards context')
        await this.getRewardsSession(page)

        const context = page.context()
        const storageState = await context.storageState()
        this.bot.logger.debug(
            this.bot.isMobile,
            'LOGIN',
            `Saving session | cookies=${storageState.cookies.length} | origins=${storageState.origins.length}`
        )
        saveStorageState(this.bot.config.sessionPath, account.email, this.bot.isMobile, storageState)

        this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Login completed, session saved')
    }

    async verifyBingSession(page: Page, account: Account) {
        const url = URLs.auth.bingSignIn
        const loopMax = 5

        this.bot.logger.info(this.bot.isMobile, 'LOGIN-BING', 'Verifying Bing session')

        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {})

            for (let i = 0; i < loopMax; i++) {
                if (page.isClosed()) break

                this.bot.logger.debug(this.bot.isMobile, 'LOGIN-BING', `Verification loop ${i + 1}/${loopMax}`)

                const u = new URL(page.url())
                const atBingHome = u.hostname === 'www.bing.com' && u.pathname === '/'
                if (!atBingHome) {
                    const state = await this.detectCurrentState(page)
                    if (state === 'PASSKEY_ERROR') {
                        this.bot.logger.info(this.bot.isMobile, 'LOGIN-BING', 'Dismissing Passkey error state')
                        await this.bot.browser.utils.ghostClick(page, this.selectors.secondaryButton)
                    }

                    // Handle stats in case of password etc
                    await this.handleState(state, page, account)
                }

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'LOGIN-BING',
                    `At Bing home: ${atBingHome} (${u.hostname}${u.pathname})`
                )

                if (atBingHome) {
                    await this.bot.browser.utils.tryDismissAllMessages(page).catch(() => {})

                    const signedIn = await page
                        .waitForSelector(this.selectors.bingProfile, { timeout: 3000 })
                        .then(() => true)
                        .catch(() => false)

                    this.bot.logger.debug(this.bot.isMobile, 'LOGIN-BING', `Profile element found: ${signedIn}`)

                    if (signedIn || this.bot.isMobile) {
                        this.bot.logger.info(this.bot.isMobile, 'LOGIN-BING', 'Bing session verified successfully')
                        return
                    }
                }

                await this.bot.utils.wait(1000)
            }

            this.bot.logger.warn(this.bot.isMobile, 'LOGIN-BING', 'Could not verify Bing session, continuing anyway')
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'LOGIN-BING',
                `Verification error: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async getRewardsSession(page: Page) {
        this.bot.logger.info(this.bot.isMobile, 'GET-REWARD-SESSION', 'Bootstrapping rewards context')

        try {
            await this.bot.browser.func.bootstrap(page)

            const actionsCount = Object.keys(this.bot.nextActions).length
            const snapshot = this.bot.reactSnapshot
            const reportableCount = snapshot?.reportable.length ?? 0
            const availablePoints = snapshot?.account.availablePoints ?? null

            if (!actionsCount) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'GET-REWARD-SESSION',
                    'No action ids resolved - server-action calls (report/streak protection) will be skipped this run'
                )
            }

            if (!snapshot || !snapshot.offers.length) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'GET-REWARD-SESSION',
                    'Page snapshot empty - neither /earn nor /dashboard rendered a usable RSC payload'
                )
            }

            this.bot.logger.info(
                this.bot.isMobile,
                'GET-REWARD-SESSION',
                `Context ready | actions=${actionsCount} | reportable=${reportableCount} | available=${availablePoints}`
            )
        } catch (error) {
            throw this.bot.logger.error(
                this.bot.isMobile,
                'GET-REWARD-SESSION',
                `Failed to acquire rewards context: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    async getAppAccessToken(page: Page, email: string) {
        this.bot.logger.info(this.bot.isMobile, 'GET-APP-TOKEN', 'Requesting mobile access token')
        return await new MobileAccessLogin(this.bot, page).get(email)
    }
}
