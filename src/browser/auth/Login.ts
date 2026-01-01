import type { Page } from 'patchright'
import type { MicrosoftRewardsBot } from '../../index'
import { saveSessionData } from '../../util/Load'

// Methods
import { MobileAccessLogin } from './methods/MobileAccessLogin'
import { EmailLogin } from './methods/EmailLogin'
import { PasswordlessLogin } from './methods/PasswordlessLogin'
import { TotpLogin } from './methods/Totp2FALogin'

type LoginState =
    | 'EMAIL_INPUT'
    | 'PASSWORD_INPUT'
	| 'USE_YOUR_PASSWORD'
    | 'SIGN_IN_ANOTHER_WAY'
    | 'PASSKEY_ERROR'
    | 'PASSKEY_VIDEO'
    | 'KMSI_PROMPT'
    | 'LOGGED_IN'
    | 'ACCOUNT_LOCKED'
    | 'ERROR_ALERT'
    | '2FA_TOTP'
    | 'LOGIN_PASSWORDLESS'
    | 'GET_A_CODE'
    | 'UNKNOWN'
    | 'CHROMEWEBDATA_ERROR'

export class Login {
    emailLogin: EmailLogin
    passwordlessLogin: PasswordlessLogin
    totp2FALogin: TotpLogin
    constructor(private bot: MicrosoftRewardsBot) {
        this.emailLogin = new EmailLogin(this.bot)
        this.passwordlessLogin = new PasswordlessLogin(this.bot)
        this.totp2FALogin = new TotpLogin(this.bot)
    }

    private readonly primaryButtonSelector = 'button[data-testid="primaryButton"]'
    private readonly secondaryButtonSelector = 'button[data-testid="secondaryButton"]'

    async login(page: Page, email: string, password: string, totpSecret?: string) {
        try {
            this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Starting login process')

            await page.goto('https://www.bing.com/rewards/dashboard', { waitUntil: 'domcontentloaded' }).catch(() => {})
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

                const state = await this.detectCurrentState(page)
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN', `Current state: ${state}`)

                if (state !== previousState && previousState !== 'UNKNOWN') {
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN', `State transition: ${previousState} → ${state}`)
                }

                if (state === previousState && state !== 'LOGGED_IN' && state !== 'UNKNOWN') {
                    sameStateCount++
                    if (sameStateCount >= 4) {
                        this.bot.logger.warn(
                            this.bot.isMobile,
                            'LOGIN',
                            `Stuck in state "${state}" for 4 loops. Refreshing page...`
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

                const shouldContinue = await this.handleState(state, page, email, password, totpSecret)

                if (!shouldContinue) {
                    throw new Error(`Login failed or aborted at state: ${state}`)
                }

                await this.bot.utils.wait(1000)
            }

            if (iteration >= maxIterations) {
                throw new Error('Login timeout: exceeded maximum iterations')
            }

            await this.finalizeLogin(page, email)
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'LOGIN',
                `An error occurred: ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }

    private async detectCurrentState(page: Page): Promise<LoginState> {
        // Make sure we settled before getting a URL
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})

        const url = new URL(page.url())

        this.bot.logger.debug(this.bot.isMobile, 'DETECT-CURRENT-STATE', `Current URL: ${url}`)

        if (url.hostname === 'chromewebdata') {
            this.bot.logger.warn(this.bot.isMobile, 'DETECT-CURRENT-STATE', 'Detected chromewebdata error page')
            return 'CHROMEWEBDATA_ERROR'
        }

        const isLocked = await page
            .waitForSelector('#serviceAbuseLandingTitle', { state: 'visible', timeout: 200 })
            .then(() => true)
            .catch(() => false)
        if (isLocked) {
            return 'ACCOUNT_LOCKED'
        }

        // If instantly loading rewards dash, logged in
        if (url.hostname === 'rewards.bing.com') {
            return 'LOGGED_IN'
        }

        // If account dash, logged in
        if (url.hostname === 'account.microsoft.com') {
            return 'LOGGED_IN'
        }

        const check = async (selector: string, state: LoginState): Promise<LoginState | null> => {
            return page
                .waitForSelector(selector, { state: 'visible', timeout: 200 })
                .then(visible => (visible ? state : null))
                .catch(() => null)
        }

        const results = await Promise.all([
            check('div[role="alert"]', 'ERROR_ALERT'),
            check('[data-testid="passwordEntry"]', 'PASSWORD_INPUT'),
			check('text="Use your password"', 'USE_YOUR_PASSWORD'),
            check('input#usernameEntry', 'EMAIL_INPUT'),
            check('[data-testid="kmsiVideo"]', 'KMSI_PROMPT'),
            check('[data-testid="biometricVideo"]', 'PASSKEY_VIDEO'),
            check('[data-testid="registrationImg"]', 'PASSKEY_ERROR'),
            check('[data-testid="tile"]:has(svg path[d*="M11.78 10.22a.75.75"])', 'SIGN_IN_ANOTHER_WAY'),
            check('[data-testid="deviceShieldCheckmarkVideo"]', 'LOGIN_PASSWORDLESS'),
            check('input[name="otc"]', '2FA_TOTP'),
            check('form[name="OneTimeCodeViewForm"]', '2FA_TOTP')
        ])

        // Get a code
        const identityBanner = await page
            .waitForSelector('[data-testid="identityBanner"]', { state: 'visible', timeout: 200 })
            .then(() => true)
            .catch(() => false)

        const primaryButton = await page
            .waitForSelector(this.primaryButtonSelector, { state: 'visible', timeout: 200 })
            .then(() => true)
            .catch(() => false)

        const passwordEntry = await page
            .waitForSelector('[data-testid="passwordEntry"]', { state: 'visible', timeout: 200 })
            .then(() => true)
            .catch(() => false)

        if (identityBanner && primaryButton && !passwordEntry && !results.includes('2FA_TOTP')) {
            results.push('GET_A_CODE') // Lower prio
        }

        // Final
        let foundStates = results.filter((s): s is LoginState => s !== null)

        if (foundStates.length === 0) return 'UNKNOWN'

        if (foundStates.includes('ERROR_ALERT')) {
            if (url.hostname !== 'login.live.com') {
                // Remove ERROR_ALERT if not on login.live.com
                foundStates = foundStates.filter(s => s !== 'ERROR_ALERT')
            }
            if (foundStates.includes('2FA_TOTP')) {
                // Don't throw on TOTP if expired code is entered
                foundStates = foundStates.filter(s => s !== 'ERROR_ALERT')
            }

            // On login.live.com, keep it
            return 'ERROR_ALERT'
        }

        if (foundStates.includes('ERROR_ALERT')) return 'ERROR_ALERT'
        if (foundStates.includes('ACCOUNT_LOCKED')) return 'ACCOUNT_LOCKED'
        if (foundStates.includes('PASSKEY_VIDEO')) return 'PASSKEY_VIDEO'
        if (foundStates.includes('PASSKEY_ERROR')) return 'PASSKEY_ERROR'
        if (foundStates.includes('KMSI_PROMPT')) return 'KMSI_PROMPT'
        if (foundStates.includes('PASSWORD_INPUT')) return 'PASSWORD_INPUT'
        if (foundStates.includes('EMAIL_INPUT')) return 'EMAIL_INPUT'
        if (foundStates.includes('SIGN_IN_ANOTHER_WAY')) return 'SIGN_IN_ANOTHER_WAY'
        if (foundStates.includes('LOGIN_PASSWORDLESS')) return 'LOGIN_PASSWORDLESS'
        if (foundStates.includes('2FA_TOTP')) return '2FA_TOTP'

        const mainState = foundStates[0] as LoginState

        return mainState
    }

    private async handleState(
        state: LoginState,
        page: Page,
        email: string,
        password: string,
        totpSecret?: string
    ): Promise<boolean> {
        switch (state) {
            case 'ACCOUNT_LOCKED': {
                const msg = 'This account has been locked! Remove from config and restart!'
                this.bot.logger.error(this.bot.isMobile, 'CHECK-LOCKED', msg)
                throw new Error(msg)
            }

            case 'ERROR_ALERT': {
                const alertEl = page.locator('div[role="alert"]')
                const errorMsg = await alertEl.innerText().catch(() => 'Unknown Error')
                this.bot.logger.error(this.bot.isMobile, 'LOGIN', `Account error: ${errorMsg}`)
                throw new Error(`Microsoft login error message: ${errorMsg}`)
            }

            case 'LOGGED_IN':
                return true

            case 'EMAIL_INPUT': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Entering email')
                await this.emailLogin.enterEmail(page, email)
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
                return true
            }

            case 'PASSWORD_INPUT': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Entering password')
                await this.emailLogin.enterPassword(page, password)
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
                return true
            }

			case 'USE_YOUR_PASSWORD': {
				this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Switching to using a password')
				await this.bot.browser.utils.ghostClick(page, 'text="Use your password"')
				await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
				return true
			}

            case 'GET_A_CODE': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Attempting to bypass "Get code"')
                // Select sign in other way
                await this.bot.browser.utils.ghostClick(page, '[data-testid="viewFooter"] span[role="button"]')
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
                return true
            }

            case 'CHROMEWEBDATA_ERROR': {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'LOGIN',
                    'chromewebdata error page detected, attempting to recover to Rewards home'
                )
                // Try go to Rewards dashboard
                try {
                    await page
                        .goto(this.bot.config.baseURL, {
                            waitUntil: 'domcontentloaded',
                            timeout: 10000
                        })
                        .catch(() => {})

                    await this.bot.utils.wait(3000)
                    return true
                } catch {
                    // If even that fails, fall back to login.live.com
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'LOGIN',
                        'Failed to navigate to baseURL from chromewebdata, retrying login.live.com'
                    )

                    await page
                        .goto('https://login.live.com/', {
                            waitUntil: 'domcontentloaded',
                            timeout: 10000
                        })
                        .catch(() => {})

                    await this.bot.utils.wait(3000)
                    return true
                }
            }

            case '2FA_TOTP': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'TOTP 2FA required')
                await this.totp2FALogin.handle(page, totpSecret)
                return true
            }

            case 'SIGN_IN_ANOTHER_WAY': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Selecting "Use my password"')
                const passwordOption = '[data-testid="tile"]:has(svg path[d*="M11.78 10.22a.75.75"])'
                await this.bot.browser.utils.ghostClick(page, passwordOption)
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
                return true
            }

            case 'KMSI_PROMPT': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Accepting KMSI prompt')
                await this.bot.browser.utils.ghostClick(page, this.primaryButtonSelector)
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
                return true
            }

            case 'PASSKEY_VIDEO':
            case 'PASSKEY_ERROR': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Skipping Passkey prompt')
                await this.bot.browser.utils.ghostClick(page, this.secondaryButtonSelector)
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
                return true
            }

            case 'LOGIN_PASSWORDLESS': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Handling passwordless authentication')
                await this.passwordlessLogin.handle(page)
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
                return true
            }

            case 'UNKNOWN': {
                const url = new URL(page.url())
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'LOGIN',
                    `Unknown state at host:${url.hostname} path:${url.pathname}. Waiting...`
                )
                return true
            }

            default:
                return true
        }
    }

    private async finalizeLogin(page: Page, email: string) {
        this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Finalizing login')

        await page.goto(this.bot.config.baseURL, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {})

        const loginRewardsSuccess = new URL(page.url()).hostname === 'rewards.bing.com'
        if (loginRewardsSuccess) {
            this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Logged into Microsoft Rewards successfully')
        } else {
            this.bot.logger.warn(
                this.bot.isMobile,
                'LOGIN',
                'Could not verify Rewards Dashboard. Assuming login valid anyway.'
            )
        }

        await this.verifyBingSession(page)
        await this.getRewardsSession(page)

        const browser = page.context()
        const cookies = await browser.cookies()
        await saveSessionData(this.bot.config.sessionPath, cookies, email, this.bot.isMobile)

        this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Login completed! Session saved!')
    }

    async verifyBingSession(page: Page) {
        const url =
            'https://www.bing.com/fd/auth/signin?action=interactive&provider=windows_live_id&return_url=https%3A%2F%2Fwww.bing.com%2F'
        const loopMax = 5

        this.bot.logger.info(this.bot.isMobile, 'LOGIN-BING', 'Verifying Bing session')

        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {})

            for (let i = 0; i < loopMax; i++) {
                if (page.isClosed()) break

                // Rare error state
                const state = await this.detectCurrentState(page)
                if (state === 'PASSKEY_ERROR') {
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'LOGIN-BING',
                        'Verification landed on Passkey error state! Trying to dismiss.'
                    )
                    await this.bot.browser.utils.ghostClick(page, this.secondaryButtonSelector)
                }

                const u = new URL(page.url())
                const atBingHome = u.hostname === 'www.bing.com' && u.pathname === '/'

                if (atBingHome) {
                    await this.bot.browser.utils.tryDismissAllMessages(page).catch(() => {})

                    const signedIn = await page
                        .waitForSelector('#id_n', { timeout: 3000 })
                        .then(() => true)
                        .catch(() => false)

                    if (signedIn || this.bot.isMobile) {
                        this.bot.logger.info(this.bot.isMobile, 'LOGIN-BING', 'Bing session established')
                        return
                    }
                }

                await this.bot.utils.wait(1000)
            }

            this.bot.logger.warn(
                this.bot.isMobile,
                'LOGIN-BING',
                'Could not confirm Bing session after retries; continuing'
            )
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'LOGIN-BING',
                `Bing verification error: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async getRewardsSession(page: Page) {
        const loopMax = 5

        this.bot.logger.info(this.bot.isMobile, 'GET-REQUEST-TOKEN', 'Fetching request token')

        try {
            await page
                .goto(`${this.bot.config.baseURL}?_=${Date.now()}`, { waitUntil: 'networkidle', timeout: 10000 })
                .catch(() => {})

            for (let i = 0; i < loopMax; i++) {
                if (page.isClosed()) break

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'GET-REWARD-SESSION',
                    `Loop ${i + 1}/${loopMax} | URL=${page.url()}`
                )

                const u = new URL(page.url())
                const atRewardHome = u.hostname === 'rewards.bing.com' && u.pathname === '/'

                if (atRewardHome) {
                    await this.bot.browser.utils.tryDismissAllMessages(page)

                    const html = await page.content()
                    const $ = await this.bot.browser.utils.loadInCheerio(html)

                    const token =
                        $('input[name="__RequestVerificationToken"]').attr('value') ??
                        $('meta[name="__RequestVerificationToken"]').attr('content') ??
                        null

                    if (token) {
                        this.bot.requestToken = token
                        this.bot.logger.info(this.bot.isMobile, 'GET-REQUEST-TOKEN', 'Request token has been set!')

                        this.bot.logger.debug(
                            this.bot.isMobile,
                            'GET-REWARD-SESSION',
                            `Token extracted: ${token.substring(0, 10)}...`
                        )
                        return
                    }

                    this.bot.logger.debug(this.bot.isMobile, 'GET-REWARD-SESSION', 'Token NOT found on page')
                }

                await this.bot.utils.wait(1000)
            }

            this.bot.logger.warn(
                this.bot.isMobile,
                'GET-REQUEST-TOKEN',
                'No RequestVerificationToken found — some activities may not work'
            )
        } catch (error) {
            throw this.bot.logger.error(
                this.bot.isMobile,
                'GET-REQUEST-TOKEN',
                `Reward session error: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    async getAppAccessToken(page: Page, email: string) {
        return await new MobileAccessLogin(this.bot, page).get(email)
    }
}
