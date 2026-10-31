import type { Page } from 'patchright'
import type { BotContext } from '../../core/BotContext'

export type LoginState =
    | 'EMAIL_INPUT'
    | 'PASSWORD_INPUT'
    | 'FOOTER_ACTION'
    | 'SIGN_IN_METHOD_PICKER'
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
    | 'PAGE_TRANSITION'
    | 'UNKNOWN'
    | 'CHROMEWEBDATA_ERROR'

export type LoginStateSnapshot = {
    state: LoginState
    url: string
}

export const LOGIN_SELECTORS = {
    primaryButton: 'button[data-testid="primaryButton"]',
    secondaryButton: 'button[data-testid="secondaryButton"]',
    footerAction: '[data-testid="viewFooter"] [role="button"]',
    signInTile: '[data-testid="tile"]',
    emailIconOld: 'img[data-testid="accessibleImg"][src*="picker_verify_email"]',
    passwordlessOptionOld: 'img[data-testid="accessibleImg"][src*="picker_remote_ngc"]',
    recoveryEmail: '[data-testid="proof-confirmation"]',
    emailVerificationInput: 'input#proof-confirmation-email-input',
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

export class LoginStateDetector {
    constructor(
        private readonly bot: Pick<BotContext, 'signal' | 'utils'>,
        private readonly passwordlessMethodSelected: boolean
    ) {}

    async detect(page: Page): Promise<LoginStateSnapshot> {
        const deadline = Date.now() + 3000
        do {
            this.bot.signal.throwIfAborted()
            const url = page.url()
            let state: LoginState
            try {
                state = await this.detectPageState(page, new URL(url))
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                if (
                    page.isClosed() ||
                    !/Execution context was destroyed|Cannot find context with specified id/i.test(message)
                )
                    throw error
                state = 'PAGE_TRANSITION'
            }
            if (page.url() === url && state !== 'UNKNOWN' && state !== 'PAGE_TRANSITION') return { state, url }
            await this.bot.utils.wait(100)
        } while (Date.now() < deadline)
        return { state: 'UNKNOWN', url: page.url() }
    }

    private async detectPageState(page: Page, url: URL): Promise<LoginState> {
        const hostname = url.hostname.toLowerCase()

        if (hostname === 'chromewebdata') {
            return 'CHROMEWEBDATA_ERROR'
        }

        const controls = await page.evaluate(selectors => {
            const visible: Record<string, boolean> = {}
            let footerText = ''
            for (const [name, selector] of Object.entries(selectors)) {
                const element = document.querySelector<HTMLElement>(selector)
                const style = element ? getComputedStyle(element) : null
                visible[name] = Boolean(
                    element &&
                    style?.visibility !== 'hidden' &&
                    style?.display !== 'none' &&
                    element.getClientRects().length
                )
                if (name === 'footerAction') footerText = element?.innerText ?? ''
            }
            return { visible, footerText }
        }, LOGIN_SELECTORS)
        const isLocked = controls.visible.accountLocked
        if (page.url() !== url.href) return 'PAGE_TRANSITION'
        if (isLocked) {
            return 'ACCOUNT_LOCKED'
        }

        if (hostname === 'bing.com' || hostname.endsWith('.bing.com') || hostname === 'account.microsoft.com') {
            return 'LOGGED_IN'
        }

        // Page/state selectors are checked together; page-specific routing is resolved below by priority
        const stateChecks: Array<[string, LoginState]> = [
            [LOGIN_SELECTORS.errorAlert, 'ERROR_ALERT'],
            [LOGIN_SELECTORS.passwordEntry, 'PASSWORD_INPUT'],
            [LOGIN_SELECTORS.emailEntry, 'EMAIL_INPUT'],
            [LOGIN_SELECTORS.recoveryEmail, 'RECOVERY_EMAIL_INPUT'],
            [LOGIN_SELECTORS.emailVerificationInput, 'EMAIL_VERIFICATION_INPUT'],
            [LOGIN_SELECTORS.kmsiVideo, 'KMSI_PROMPT'],
            [LOGIN_SELECTORS.passKeyVideo, 'PASSKEY_VIDEO'],
            [LOGIN_SELECTORS.passKeyError, 'PASSKEY_ERROR'],
            [LOGIN_SELECTORS.signInTile, 'SIGN_IN_METHOD_PICKER'],
            [LOGIN_SELECTORS.passwordlessOptionOld, 'SIGN_IN_METHOD_PICKER'],
            [LOGIN_SELECTORS.emailIconOld, 'SIGN_IN_METHOD_PICKER'],
            [LOGIN_SELECTORS.passwordlessCheck, 'LOGIN_PASSWORDLESS'],
            [LOGIN_SELECTORS.passwordlessNumber, 'LOGIN_PASSWORDLESS'],
            [LOGIN_SELECTORS.totpInput, '2FA_TOTP'],
            [LOGIN_SELECTORS.totpInputOld, '2FA_TOTP'],
            [LOGIN_SELECTORS.otpCodeEntry, 'OTP_CODE_ENTRY'],
            [LOGIN_SELECTORS.otpInput, 'OTP_CODE_ENTRY']
        ]

        const visibleBySelector = new Map<string, boolean | undefined>(
            Object.entries(LOGIN_SELECTORS).map(([name, selector]) => [selector, controls.visible[name]])
        )
        const results = stateChecks.map(([selector, state]) => (visibleBySelector.get(selector) ? state : null))
        const { identityBanner, primaryButton, passwordEntry, footerAction } = controls.visible
        const footerActionText = controls.footerText

        if (page.url() !== url.href) return 'PAGE_TRANSITION'

        // Get a sign-in request - distinguish a generic methods footer from a direct email/phone fallback
        if (
            identityBanner &&
            primaryButton &&
            !passwordEntry &&
            !results.includes('2FA_TOTP') &&
            !results.includes('RECOVERY_EMAIL_INPUT') &&
            !results.includes('EMAIL_VERIFICATION_INPUT')
        ) {
            const normalizedFooterAction = footerActionText.replace(/\s+/g, ' ').trim()
            // Detect email or masked phone proof destinations without relying on localized footer text
            const footerTargetsSpecificProof =
                /[\w.+*-]+@[\w.*-]+\.[a-z]{2,}/i.test(normalizedFooterAction) ||
                /(?:\+?\d|[*xX])(?:[\d\s().*xX-]{4,})(?:\d|[*xX])/.test(normalizedFooterAction)

            if (footerAction && !footerTargetsSpecificProof && !this.passwordlessMethodSelected) {
                results.push('FOOTER_ACTION')
            } else {
                results.push('PASSWORDLESS_SEND_CODE')
            }
        }

        let foundStates = results.filter((s): s is LoginState => s !== null)

        if (foundStates.length === 0) {
            return 'UNKNOWN'
        }

        if (foundStates.includes('ERROR_ALERT')) {
            if (hostname === 'login.live.com') {
                const errorIsReal = !foundStates.includes('2FA_TOTP')
                if (errorIsReal) return 'ERROR_ALERT'
            }
            foundStates = foundStates.filter(s => s !== 'ERROR_ALERT')
        }

        if (foundStates.length === 0) {
            return 'UNKNOWN'
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
            'SIGN_IN_METHOD_PICKER',
            'OTP_CODE_ENTRY',
            'FOOTER_ACTION',
            'PASSWORDLESS_SEND_CODE',
            '2FA_TOTP'
        ]

        for (const priority of priorities) {
            if (foundStates.includes(priority)) {
                return priority
            }
        }
        return foundStates[0] ?? 'UNKNOWN'
    }
}
