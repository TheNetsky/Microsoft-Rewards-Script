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
import { canPromptForInput } from './methods/LoginUtils'

import type { Account } from '../../interface/Account'

type LoginState =
    | 'EMAIL_INPUT'
    | 'PASSWORD_INPUT'
    | 'USE_PASSWORD'
    | 'SIGN_IN_ANOTHER_WAY'
    | 'SIGN_IN_ANOTHER_WAY_EMAIL'
    | 'SIGN_IN_ANOTHER_WAY_PASSWORDLESS'
    | 'PASSKEY_ERROR'
    | 'PASSKEY_VIDEO'
    | 'KMSI_PROMPT'
    | 'LOGGED_IN'
    | 'EMAIL_VERIFICATION_INPUT'
    | 'RECOVERY_EMAIL_INPUT'
    | 'ACCOUNT_LOCKED'
    | 'ERROR_ALERT'
    | '2FA_TOTP'
    | 'LOGIN_PASSWORDLESS'
    | 'PASSWORDLESS_SEND_CODE'
    | 'OTP_CODE_ENTRY'
    | 'UNKNOWN'
    | 'CHROMEWEBDATA_ERROR'

type SignInMethodOption = {
    index: number
    selector: string
    label: string
    signature: string
}

export class Login {
    emailLogin: EmailLogin
    passwordlessLogin: PasswordlessLogin
    totp2FALogin: TotpLogin
    codeLogin: CodeLogin
    recoveryLogin: RecoveryLogin

    private readonly capturedUnknownUrls = new Set<string>()
    private signInMethodsLogged = false

    private readonly selectors = {
        primaryButton: 'button[data-testid="primaryButton"]',
        secondaryButton: 'button[data-testid="secondaryButton"]',
        usePasswordOption: '[data-testid="viewFooter"] [role="button"]',
        signInTile: '[data-testid="tile"]',
        emailIcon: '[data-testid="tile"]:has(svg path[d*="M5.25 4h13.5a3.25"])',
        emailIconOld: 'img[data-testid="accessibleImg"][src*="picker_verify_email"]',
        passwordlessOptionOld: 'img[data-testid="accessibleImg"][src*="picker_remote_ngc"]',
        recoveryEmail: '[data-testid="proof-confirmation"]',
        emailVerificationInput: 'input#proof-confirmation-email-input',
        passwordIcon: '[data-testid="tile"]:has(svg path[d*="M11.78 10.22a.75.75"])',
        accountLocked: '#serviceAbuseLandingTitle',
        errorAlert: 'div[role="alert"]',
        passwordEntry: '[data-testid="passwordEntry"]',
        emailEntry: 'input#usernameEntry',
        kmsiVideo: '[data-testid="kmsiVideo"]',
        passKeyVideo: '[data-testid="biometricVideo"]',
        passKeyError: '[data-testid="registrationImg"]',
        passwordlessCheck: '[data-testid="deviceShieldCheckmarkVideo"]',
        passwordlessNumber: '[data-testid="displaySign"]',
        totpInput: 'input[name="otc"]',
        totpInputOld: 'form[name="OneTimeCodeViewForm"]',
        identityBanner: '[data-testid="identityBanner"]',
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
            this.signInMethodsLogged = false
            this.bot.logger.info(this.bot.isMobile, 'LOGIN', '开始登录流程')

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
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN', `状态检查迭代 ${iteration}/${maxIterations}`)

                const state = await this.detectCurrentState(page)
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN', `当前状态: ${state}`)

                if (state !== previousState && previousState !== 'UNKNOWN') {
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN', `状态转换: ${previousState} → ${state}`)
                }

                if (state === previousState && state !== 'LOGGED_IN' && state !== 'UNKNOWN') {
                    sameStateCount++
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'LOGIN',
                        `相同状态计数: ${sameStateCount}/4 状态为 "${state}"`
                    )
                    if (sameStateCount >= 4) {
                        this.bot.logger.warn(
                            this.bot.isMobile,
                            'LOGIN',
                            `在状态 "${state}" 停滞4次循环，刷新页面`
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
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN', '登录成功')
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
                `致命错误: ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }

    private async detectCurrentState(page: Page): Promise<LoginState> {
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})

        const url = new URL(page.url())
        const hostname = url.hostname.toLowerCase()
        this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', `当前URL: ${hostname}${url.pathname}`)

        if (hostname === 'chromewebdata') {
            this.bot.logger.warn(this.bot.isMobile, 'DETECT-STATE', '检测到chromewebdata错误页面')
            return 'CHROMEWEBDATA_ERROR'
        }

        const isLocked = await this.checkSelector(page, this.selectors.accountLocked)
        if (isLocked) {
            this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', '账户锁定选择器被发现')
            return 'ACCOUNT_LOCKED'
        }

        if (hostname === 'bing.com' || hostname.endsWith('.bing.com') || hostname === 'account.microsoft.com') {
            this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', '在Bing/奖励/账户页面，假设已登录')
            return 'LOGGED_IN'
        }

        const stateChecks: Array<[string, LoginState]> = [
            [this.selectors.errorAlert, 'ERROR_ALERT'],
            [this.selectors.passwordEntry, 'PASSWORD_INPUT'],
            [this.selectors.emailEntry, 'EMAIL_INPUT'],
            [this.selectors.recoveryEmail, 'RECOVERY_EMAIL_INPUT'],
            [this.selectors.emailVerificationInput, 'EMAIL_VERIFICATION_INPUT'],
            [this.selectors.kmsiVideo, 'KMSI_PROMPT'],
            [this.selectors.passKeyVideo, 'PASSKEY_VIDEO'],
            [this.selectors.passKeyError, 'PASSKEY_ERROR'],
            [this.selectors.passwordlessOptionOld, 'SIGN_IN_ANOTHER_WAY_PASSWORDLESS'],
            [this.selectors.passwordIcon, 'SIGN_IN_ANOTHER_WAY'],
            [this.selectors.emailIcon, 'SIGN_IN_ANOTHER_WAY_EMAIL'],
            [this.selectors.emailIconOld, 'SIGN_IN_ANOTHER_WAY_EMAIL'],
            [this.selectors.passwordlessCheck, 'LOGIN_PASSWORDLESS'],
            [this.selectors.passwordlessNumber, 'LOGIN_PASSWORDLESS'],
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
            this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', `可见状态: [${visibleStates.join(', ')}]`)
        }

        const passwordlessOption = await this.findPasswordlessOption(page)
        if (passwordlessOption && !results.includes('SIGN_IN_ANOTHER_WAY_PASSWORDLESS')) {
            results.push('SIGN_IN_ANOTHER_WAY_PASSWORDLESS')
        }

        const [identityBanner, primaryButton, passwordEntry, usePasswordOption] = await Promise.all([
            this.checkSelector(page, this.selectors.identityBanner),
            this.checkSelector(page, this.selectors.primaryButton),
            this.checkSelector(page, this.selectors.passwordEntry),
            this.checkSelector(page, this.selectors.usePasswordOption)
        ])

        if (
            identityBanner &&
            primaryButton &&
            usePasswordOption &&
            !passwordEntry &&
            !results.includes('2FA_TOTP') &&
            !results.includes('RECOVERY_EMAIL_INPUT') &&
            !results.includes('EMAIL_VERIFICATION_INPUT')
        ) {
            this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', '检测到密码登录回退操作')
            results.push('USE_PASSWORD')
        }

        if (
            identityBanner &&
            primaryButton &&
            !usePasswordOption &&
            !passwordEntry &&
            !results.includes('2FA_TOTP') &&
            !results.includes('RECOVERY_EMAIL_INPUT') &&
            !results.includes('EMAIL_VERIFICATION_INPUT')
        ) {
            this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', '检测到无密码"发送代码"操作')
            results.push('PASSWORDLESS_SEND_CODE')
        }

        let foundStates = results.filter((s): s is LoginState => s !== null)

        if (foundStates.length === 0) {
            this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', '未找到匹配的状态')
            return 'UNKNOWN'
        }

        if (foundStates.includes('ERROR_ALERT')) {
            const errorIsReal = hostname === 'login.live.com' && !foundStates.includes('2FA_TOTP')
            this.bot.logger.debug(
                this.bot.isMobile,
                'DETECT-STATE',
                `发现ERROR_ALERT - 主机名: ${hostname}, 有2FA: ${foundStates.includes('2FA_TOTP')}, 视为真实错误: ${errorIsReal}`
            )
            if (errorIsReal) return 'ERROR_ALERT'
            foundStates = foundStates.filter(s => s !== 'ERROR_ALERT')
        }

        const priorities: LoginState[] = [
            'ACCOUNT_LOCKED',
            'PASSKEY_VIDEO',
            'PASSKEY_ERROR',
            'KMSI_PROMPT',
            'LOGIN_PASSWORDLESS',
            'PASSWORD_INPUT',
            'EMAIL_INPUT',
            'EMAIL_VERIFICATION_INPUT',
            'RECOVERY_EMAIL_INPUT',
            'SIGN_IN_ANOTHER_WAY_PASSWORDLESS',
            'SIGN_IN_ANOTHER_WAY', // Prefer password option over email code
            'SIGN_IN_ANOTHER_WAY_EMAIL',
            'OTP_CODE_ENTRY',
            'USE_PASSWORD',
            'PASSWORDLESS_SEND_CODE',
            '2FA_TOTP'
        ]

        for (const priority of priorities) {
            if (foundStates.includes(priority)) {
                this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', `按优先级选择状态: ${priority}`)
                return priority
            }
        }

        this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', `返回第一个找到的状态: ${foundStates[0]}`)
        return foundStates[0] as LoginState
    }

    private async checkSelector(page: Page, selector: string): Promise<boolean> {
        return page
            .waitForSelector(selector, { state: 'visible', timeout: 200 })
            .then(() => true)
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
        const options: SignInMethodOption[] = []

        for (let index = 0; index < count; index++) {
            const tile = tiles.nth(index)
            if (!(await tile.isVisible().catch(() => false))) continue

            const metadata = await tile
                .evaluate(element => {
                    const elements = [element, ...Array.from(element.querySelectorAll('*'))]
                    const structuralAttributeNames = new Set([
                        'id',
                        'name',
                        'src',
                        'data-testid',
                        'data-value',
                        'data-bind'
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

            if (!metadata) continue

            const label = this.normalizeSignInText(`${metadata.text} ${metadata.accessibleText}`)
            const signature = this.normalizeSignInText(metadata.structuralAttributes).toLowerCase()

            options.push({
                index,
                selector: `${this.selectors.signInTile} >> nth=${index}`,
                label: label || `Sign-in option ${index + 1}`,
                signature
            })
        }

        return options
    }

    private isPasswordlessOption(option: SignInMethodOption): boolean {
        const signature = option.signature

        if (/phone[\s_-]*app[\s_-]*otp|\btotp\b/.test(signature)) return false

        return /remote[\s_-]*ngc|picker_remote_ngc|phone[\s_-]*app[\s_-]*notification|push[\s_-]*notification/.test(
            signature
        )
    }

    private async findPasswordlessOption(page: Page): Promise<SignInMethodOption | null> {
        const options = await this.getSignInMethodOptions(page)
        return options.find(option => this.isPasswordlessOption(option)) ?? null
    }

    private async logAvailableSignInMethods(page: Page): Promise<void> {
        if (this.signInMethodsLogged) return
        this.signInMethodsLogged = true

        const options = await this.getSignInMethodOptions(page)
        if (options.length === 0) return

        const labels = options.map(option => this.sanitizeSignInLabel(option.label))
        this.bot.logger.info(this.bot.isMobile, 'LOGIN', `可用的登录方式: ${labels.join(' | ')}`)
    }

    private async waitForIdle(page: Page, note: string, timeout = 5000): Promise<void> {
        await page.waitForLoadState('networkidle', { timeout }).catch(() => {
            this.bot.logger.debug(this.bot.isMobile, 'LOGIN', `网络空闲超时: ${note}`)
        })
    }

    private async tryClick(page: Page, selector: string, label: string, timeout = 2000): Promise<boolean> {
        const found = await page.waitForSelector(selector, { state: 'visible', timeout }).catch(() => null)
        if (!found) return false

        const clicked = await this.bot.browser.utils.ghostClick(page, selector)
        if (!clicked) return false

        await this.waitForIdle(page, `after ${label}`)
        this.bot.logger.info(this.bot.isMobile, 'LOGIN', `${label} 已点击`)
        return true
    }

    private async handleState(state: LoginState, page: Page, account: Account): Promise<boolean> {
        this.bot.logger.debug(this.bot.isMobile, 'HANDLE-STATE', `处理状态: ${state}`)

        switch (state) {
            case 'ACCOUNT_LOCKED': {
                const msg = 'This account has been locked! Remove from config and restart!'
                this.bot.logger.error(this.bot.isMobile, 'LOGIN', msg)
                throw new Error(msg)
            }

            case 'ERROR_ALERT': {
                const alertEl = page.locator(this.selectors.errorAlert)
                const errorMsg = await alertEl.innerText().catch(() => 'Unknown Error')
                this.bot.logger.error(this.bot.isMobile, 'LOGIN', `账户错误: ${errorMsg}`)
                throw new Error(`Microsoft login error: ${errorMsg}`)
            }

            case 'LOGGED_IN':
                return true

            case 'EMAIL_INPUT': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '输入邮箱')
                const result = await this.emailLogin.enterEmail(page, account.email)
                if (result !== 'ok') return false
                await this.waitForIdle(page, 'after email entry')
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '邮箱输入成功')
                return true
            }

            case 'PASSWORD_INPUT': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '输入密码')
                const result = await this.emailLogin.enterPassword(page, account.password)
                if (result === 'error') return false
                await this.waitForIdle(page, 'after password entry')
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '密码输入成功')
                return true
            }

            case 'USE_PASSWORD': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '密码登录选项可用，正在选择')
                const clicked = await this.bot.browser.utils.ghostClick(page, this.selectors.usePasswordOption)
                if (!clicked) {
                    this.bot.logger.warn(this.bot.isMobile, 'LOGIN', '无法选择密码登录选项')
                    return false
                }
                await this.waitForIdle(page, 'after selecting password sign-in')
                return true
            }

            case 'PASSWORDLESS_SEND_CODE': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '继续使用主要登录方式')
                const clicked = await this.bot.browser.utils.ghostClick(page, this.selectors.primaryButton)
                if (!clicked) {
                    this.bot.logger.warn(this.bot.isMobile, 'LOGIN', '无法继续使用主要登录方式')
                    return false
                }
                await this.waitForIdle(page, 'after primary sign-in action')
                return true
            }

            case 'SIGN_IN_ANOTHER_WAY_PASSWORDLESS': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '选择Microsoft Authenticator无密码登录')

                const passwordlessOption = await this.findPasswordlessOption(page)
                const passwordlessOptionOldFound = await this.checkSelector(page, this.selectors.passwordlessOptionOld)
                const passwordlessSelector =
                    passwordlessOption?.selector ??
                    (passwordlessOptionOldFound ? this.selectors.passwordlessOptionOld : null)

                if (!passwordlessSelector) {
                    this.bot.logger.warn(this.bot.isMobile, 'LOGIN', '未找到Microsoft Authenticator选项')
                    return false
                }

                if (passwordlessOption) {
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'LOGIN',
                        `使用Authenticator登录方式: ${this.sanitizeSignInLabel(passwordlessOption.label)}`
                    )
                }

                let clicked = await this.bot.browser.utils.ghostClick(page, passwordlessSelector)
                if (!clicked && passwordlessOption) {
                    clicked = await page
                        .locator(this.selectors.signInTile)
                        .nth(passwordlessOption.index)
                        .click()
                        .then(() => true)
                        .catch(() => false)
                }
                if (!clicked) {
                    this.bot.logger.warn(this.bot.isMobile, 'LOGIN', '无法选择Microsoft Authenticator')
                    return false
                }

                await this.waitForIdle(page, 'after Microsoft Authenticator selection')

                const passwordlessChallengeVisible =
                    (await this.checkSelector(page, this.selectors.passwordlessCheck)) ||
                    (await this.checkSelector(page, this.selectors.passwordlessNumber))

                if (!passwordlessChallengeVisible && (await this.checkSelector(page, this.selectors.primaryButton))) {
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN', '确认Microsoft Authenticator通知')
                    const confirmed = await this.bot.browser.utils.ghostClick(page, this.selectors.primaryButton)
                    if (!confirmed) {
                        this.bot.logger.warn(
                            this.bot.isMobile,
                            'LOGIN',
                            '无法确认Microsoft Authenticator通知'
                        )
                        return false
                    }
                    await this.waitForIdle(page, 'after Microsoft Authenticator notification confirmation')
                }

                return true
            }

            case 'SIGN_IN_ANOTHER_WAY_EMAIL': {
                // The picker can finish rendering after state detection. Re-check before falling back to email.
                const passwordlessOption = await this.findPasswordlessOption(page)
                if (passwordlessOption) {
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'LOGIN',
                        'Microsoft Authenticator已可用；优先使用无密码登录而非邮箱代码'
                    )
                    let clicked = await this.bot.browser.utils.ghostClick(page, passwordlessOption.selector)
                    if (!clicked) {
                        clicked = await page
                            .locator(this.selectors.signInTile)
                            .nth(passwordlessOption.index)
                            .click()
                            .then(() => true)
                            .catch(() => false)
                    }
                    return clicked
                }

                await this.logAvailableSignInMethods(page)

                if (!canPromptForInput()) {
                    this.bot.logger.error(
                        this.bot.isMobile,
                        'LOGIN',
                        '未提供Microsoft Authenticator无密码登录；邮箱代码回退需要交互式stdin'
                    )
                    return false
                }

                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '选择"发送代码到邮箱"')

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
                    this.bot.logger.warn(this.bot.isMobile, 'LOGIN', '未找到邮箱图标')
                    return false
                }

                this.bot.logger.info(
                    this.bot.isMobile,
                    'LOGIN',
                    `使用${emailSelector === this.selectors.emailIcon ? 'new' : 'old'}版邮箱图标选择器`
                )
                const clicked = await this.bot.browser.utils.ghostClick(page, emailSelector)
                if (!clicked) {
                    this.bot.logger.warn(this.bot.isMobile, 'LOGIN', '无法选择邮箱代码登录方式')
                    return false
                }
                await this.waitForIdle(page, 'after email icon click')
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '启动代码登录处理器')
                await this.codeLogin.handle(page)
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '代码登录处理器完成')
                return true
            }

            case 'RECOVERY_EMAIL_INPUT': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '检测到恢复邮箱输入')
                await this.waitForIdle(page, 'on recovery page')
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '启动恢复邮箱处理器')
                await this.recoveryLogin.handle(page, account?.recoveryEmail)
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '恢复邮箱处理器完成')
                return true
            }

            case 'EMAIL_VERIFICATION_INPUT': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '检测到邮箱验证输入')
                await this.waitForIdle(page, 'on email verification page')
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '启动邮箱代码验证处理器')
                await this.codeLogin.handle(page)
                this.bot.logger.info(
                    this.bot.isMobile,
                    'LOGIN',
                    '邮箱代码验证处理器完成'
                )
                return true
            }

            case 'CHROMEWEBDATA_ERROR': {
                this.bot.logger.warn(this.bot.isMobile, 'LOGIN', '检测到chromewebdata错误，尝试恢复')
                try {
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN', `导航到 ${REWARDS_BASE_URL}`)
                    await page
                        .goto(REWARDS_BASE_URL, {
                            waitUntil: 'domcontentloaded',
                            timeout: 10000
                        })
                        .catch(() => {})
                    await this.bot.utils.wait(3000)
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN', '恢复导航成功')
                    return true
                } catch {
                    this.bot.logger.warn(this.bot.isMobile, 'LOGIN', '回退到login.live.com')
                    await page
                        .goto(URLs.auth.loginLive, {
                            waitUntil: 'domcontentloaded',
                            timeout: 10000
                        })
                        .catch(() => {})
                    await this.bot.utils.wait(3000)
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN', '回退导航成功')
                    return true
                }
            }

            case '2FA_TOTP': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '需要TOTP双因素认证')
                await this.totp2FALogin.handle(page, account.totpSecret)
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'TOTP双因素认证处理器完成')
                return true
            }

            case 'SIGN_IN_ANOTHER_WAY': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '选择"使用我的密码"')
                const clicked = await this.bot.browser.utils.ghostClick(page, this.selectors.passwordIcon)
                if (!clicked) {
                    this.bot.logger.warn(this.bot.isMobile, 'LOGIN', '无法选择密码登录方式')
                    return false
                }
                await this.waitForIdle(page, 'after password icon click')
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '密码选项已选择')
                return true
            }

            case 'KMSI_PROMPT': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '接受KMSI提示')
                const clicked = await this.bot.browser.utils.ghostClick(page, this.selectors.primaryButton)
                if (!clicked) {
                    this.bot.logger.warn(this.bot.isMobile, 'LOGIN', '无法接受KMSI提示')
                    return false
                }
                await this.waitForIdle(page, 'after KMSI acceptance')
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'KMSI提示已接受')
                return true
            }

            case 'PASSKEY_VIDEO':
            case 'PASSKEY_ERROR': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '跳过Passkey提示')
                const clicked = await this.bot.browser.utils.ghostClick(page, this.selectors.secondaryButton)
                if (!clicked) {
                    this.bot.logger.warn(this.bot.isMobile, 'LOGIN', '无法跳过Passkey提示')
                    return false
                }
                await this.waitForIdle(page, 'after Passkey skip')
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Passkey提示已跳过')
                return true
            }

            case 'LOGIN_PASSWORDLESS': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '处理无密码认证')
                await this.passwordlessLogin.handle(page)
                await this.waitForIdle(page, 'after passwordless auth')
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '无密码认证完成')
                return true
            }

            case 'OTP_CODE_ENTRY': {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'LOGIN',
                    '检测到OTP代码输入页面；返回登录方式选择'
                )

                if (!(await this.tryClick(page, this.selectors.backButton, 'Back button'))) {
                    this.bot.logger.warn(this.bot.isMobile, 'LOGIN', 'OTP页面上未找到返回按钮')
                    return false
                }

                return true
            }

            case 'UNKNOWN': {
                const rawUrl = page.url()
                const url = new URL(rawUrl)
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'LOGIN',
                    `在 ${url.hostname}${url.pathname} 的未知状态，等待中`
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
                this.bot.logger.debug(this.bot.isMobile, 'HANDLE-STATE', `未处理的状态: ${state}，继续执行`)
                return true
        }
    }

    private async finalizeLogin(page: Page, account: Account) {
        this.bot.logger.info(this.bot.isMobile, 'LOGIN', '完成登录')

        await page.goto(REWARDS_BASE_URL, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {})

        const rewardsLanding = new URL(page.url())
        const rewardsHostname = rewardsLanding.hostname.toLowerCase()
        const loginRewardsSuccess = rewardsHostname === 'bing.com' || rewardsHostname.endsWith('.bing.com')
        if (loginRewardsSuccess) {
            if (rewardsHostname === 'rewards.bing.com') {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '成功登录Microsoft Rewards')
            } else {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'LOGIN',
                    `Rewards登录重定向到Bing主页 (${rewardsHostname})；继续验证`
                )
            }
        } else {
            this.bot.logger.warn(this.bot.isMobile, 'LOGIN', '无法验证奖励仪表板，假定登录有效')
        }

        // Dismiss at rewards dashboard
        await this.bot.browser.utils.tryDismissAllMessages(page).catch(() => {})

        this.bot.logger.info(this.bot.isMobile, 'LOGIN', '开始Bing会话验证')
        await this.verifyBingSession(page, account)

        this.bot.logger.info(this.bot.isMobile, 'LOGIN', '获取奖励上下文')
        await this.getRewardsSession(page)

        const context = page.context()
        const storageState = await context.storageState()
        this.bot.logger.debug(
            this.bot.isMobile,
            'LOGIN',
            `保存会话 | cookies=${storageState.cookies.length} | origins=${storageState.origins.length}`
        )
        saveStorageState(this.bot.config.sessionPath, account.email, this.bot.isMobile, storageState)

        this.bot.logger.info(this.bot.isMobile, 'LOGIN', '登录完成，会话已保存')
    }

    async verifyBingSession(page: Page, account: Account) {
        const url = URLs.auth.bingSignIn
        const loopMax = 5

        this.bot.logger.info(this.bot.isMobile, 'LOGIN-BING', '验证Bing会话')

        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {})

            for (let i = 0; i < loopMax; i++) {
                if (page.isClosed()) break

                this.bot.logger.debug(this.bot.isMobile, 'LOGIN-BING', `验证循环 ${i + 1}/${loopMax}`)

                const u = new URL(page.url())
                const hostname = u.hostname.toLowerCase()
                const atBingPage =
                    (hostname === 'bing.com' || hostname.endsWith('.bing.com')) && hostname !== 'rewards.bing.com'
                if (!atBingPage) {
                    const state = await this.detectCurrentState(page)
                    if (state === 'PASSKEY_ERROR') {
                        this.bot.logger.info(this.bot.isMobile, 'LOGIN-BING', '关闭Passkey错误状态')
                        await this.bot.browser.utils.ghostClick(page, this.selectors.secondaryButton)
                    }

                    // Handle stats in case of password etc
                    await this.handleState(state, page, account)
                }

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'LOGIN-BING',
                    `在Bing页面: ${atBingPage} (${hostname}${u.pathname})`
                )

                if (atBingPage) {
                    await this.bot.browser.utils.tryDismissAllMessages(page).catch(() => {})

                    const signedIn = await page
                        .waitForSelector(this.selectors.bingProfile, { timeout: 3000 })
                        .then(() => true)
                        .catch(() => false)

                    this.bot.logger.debug(this.bot.isMobile, 'LOGIN-BING', `找到个人资料元素: ${signedIn}`)

                    if (signedIn || this.bot.isMobile) {
                        this.bot.logger.info(this.bot.isMobile, 'LOGIN-BING', 'Bing会话验证成功')
                        return
                    }
                }

                await this.bot.utils.wait(1000)
            }

            this.bot.logger.warn(this.bot.isMobile, 'LOGIN-BING', '无法验证Bing会话，继续执行')
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'LOGIN-BING',
                `验证错误: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async getRewardsSession(page: Page) {
        this.bot.logger.info(this.bot.isMobile, 'GET-REWARD-SESSION', '引导奖励上下文')

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
                    '未解析到操作ID - 本次运行将跳过服务器操作调用（报告/连击保护）'
                )
            }

            if (!snapshot || !snapshot.offers.length) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'GET-REWARD-SESSION',
                    '页面快照为空 - /earn 和 /dashboard 均未渲染出可用的RSC数据'
                )
            }

            this.bot.logger.info(
                this.bot.isMobile,
                'GET-REWARD-SESSION',
                `上下文就绪 | actions=${actionsCount} | reportable=${reportableCount} | available=${availablePoints}`
            )
        } catch (error) {
            throw this.bot.logger.error(
                this.bot.isMobile,
                'GET-REWARD-SESSION',
                `获取奖励上下文失败: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    async getAppAccessToken(page: Page, email: string) {
        this.bot.logger.info(this.bot.isMobile, 'GET-APP-TOKEN', '请求移动访问令牌')
        return await new MobileAccessLogin(this.bot, page).get(email)
    }
}
