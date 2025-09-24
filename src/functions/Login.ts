import type { Page } from 'playwright'
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import * as crypto from 'crypto'
import { AxiosRequestConfig } from 'axios'

import { MicrosoftRewardsBot } from '../index'
import { saveSessionData } from '../util/Load'
import { generateTOTP } from '../util/Totp'

import { OAuth } from '../interface/OAuth'

// NOTE: Readline is created on-demand inside authSMSVerification to avoid stale/closed interface reuse.

export class Login {
    private bot: MicrosoftRewardsBot
    private clientId: string = '0000000040170455'
    private authBaseUrl: string = 'https://login.live.com/oauth20_authorize.srf'
    private redirectUrl: string = 'https://login.live.com/oauth20_desktop.srf'
    private tokenUrl: string = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
    private scope: string = 'service::prod.rewardsplatform.microsoft.com::MBI_SSL'
    // Flag to prevent spamming passkey logs after first handling
    private passkeyHandled: boolean = false
    // Optional TOTP secret for current login attempt (Base32)
    private currentTotpSecret?: string
    // Compromised monitoring interval
    private compromisedInterval?: NodeJS.Timeout

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    async login(page: Page, email: string, password: string, totpSecret?: string) {

        try {
            this.bot.log(this.bot.isMobile, 'LOGIN', 'Starting login process!')
            this.currentTotpSecret = typeof totpSecret === 'string' && totpSecret.trim() ? totpSecret.trim() : undefined

            // Navigate to the Bing login page
            await page.goto('https://rewards.bing.com/signin')

            // Disable FIDO support in login request
            await page.route('**/GetCredentialType.srf*', (route) => {
                const body = JSON.parse(route.request().postData() || '{}')
                body.isFidoSupported = false
                route.continue({ postData: JSON.stringify(body) })
            })

            await page.waitForLoadState('domcontentloaded').catch(() => { })

            await this.bot.browser.utils.reloadBadPage(page)

            // Check if account is locked
            await this.checkAccountLocked(page)

            const isLoggedIn = await page.waitForSelector('html[data-role-name="RewardsPortal"]', { timeout: 10000 }).then(() => true).catch(() => false)

            if (!isLoggedIn) {
                await this.execLogin(page, email, password)
                this.bot.log(this.bot.isMobile, 'LOGIN', 'Logged into Microsoft successfully')
            } else {
                this.bot.log(this.bot.isMobile, 'LOGIN', 'Already logged in')

                // Check if account is locked
                await this.checkAccountLocked(page)
            }

            // Check if logged in to bing
            await this.checkBingLogin(page)

            // Save session
            await saveSessionData(this.bot.config.sessionPath, page.context(), email, this.bot.isMobile)

            // We're done logging in
            this.bot.log(this.bot.isMobile, 'LOGIN', 'Logged in successfully, saved login session!')
            this.currentTotpSecret = undefined

        } catch (error) {
            // Throw and don't continue
            throw this.bot.log(this.bot.isMobile, 'LOGIN', 'An error occurred:' + error, 'error')
        }
    }

    private async execLogin(page: Page, email: string, password: string) {
        try {
            await this.enterEmail(page, email)
            await this.bot.utils.wait(2000)
            await this.bot.browser.utils.reloadBadPage(page)
            await this.bot.utils.wait(2000)
            // Try to detect masked recovery email prompt and compare with configured recoveryEmail
            try {
                await this.detectAndHandleRecoveryMismatch(page, email)
            } catch {/* non-fatal */}
            await this.enterPassword(page, password)
            await this.bot.utils.wait(2000)

            // If sign-in is blocked we stop here (leave page as-is for manual recovery)
            if (this.bot.compromisedModeActive && this.bot.compromisedReason === 'sign-in-blocked') {
                this.bot.log(this.bot.isMobile, 'LOGIN', 'Sign-in blocked detected; skipping remaining login steps.', 'warn')
                return
            }

            // Check if account is locked
            await this.checkAccountLocked(page)

            await this.bot.browser.utils.reloadBadPage(page)
            await this.checkLoggedIn(page)
        } catch (error) {
            this.bot.log(this.bot.isMobile, 'LOGIN', 'An error occurred: ' + error, 'error')
        }
    }

    private async enterEmail(page: Page, email: string) {
        const emailInputSelector = 'input[type="email"]'

        try {
            // Wait for email field
            const emailField = await page.waitForSelector(emailInputSelector, { state: 'visible', timeout: 2000 }).catch(() => null)
            if (!emailField) {
                this.bot.log(this.bot.isMobile, 'LOGIN', 'Email field not found', 'warn')
                return
            }

            await this.bot.utils.wait(1000)

            // Check if email is prefilled
            const emailPrefilled = await page.waitForSelector('#userDisplayName', { timeout: 5000 }).catch(() => null)
            if (emailPrefilled) {
                this.bot.log(this.bot.isMobile, 'LOGIN', 'Email already prefilled by Microsoft')
            } else {
                // Else clear and fill email
                await page.fill(emailInputSelector, '')
                await this.bot.utils.wait(500)
                await page.fill(emailInputSelector, email)
                await this.bot.utils.wait(1000)
            }

            const nextButton = await page.waitForSelector('button[type="submit"]', { timeout: 2000 }).catch(() => null)
            if (nextButton) {
                await nextButton.click()
                await this.bot.utils.wait(2000)
                this.bot.log(this.bot.isMobile, 'LOGIN', 'Email entered successfully')
            } else {
                this.bot.log(this.bot.isMobile, 'LOGIN', 'Next button not found after email entry', 'warn')
            }

        } catch (error) {
            this.bot.log(this.bot.isMobile, 'LOGIN', `Email entry failed: ${error}`, 'error')
        }
    }

    private async enterPassword(page: Page, password: string) {
    const passwordInputSelector = 'input[type="password"]'
    const skip2FASelector = '#idA_PWD_SwitchToPassword'
        try {
            const skip2FAButton = await page.waitForSelector(skip2FASelector, { timeout: 2000 }).catch(() => null)
            if (skip2FAButton) {
                await skip2FAButton.click()
                await this.bot.utils.wait(2000)
                this.bot.log(this.bot.isMobile, 'LOGIN', 'Skipped 2FA')
            } else {
                this.bot.log(this.bot.isMobile, 'LOGIN', 'No 2FA skip button found, proceeding with password entry')
            }
            const viewFooter = await page.waitForSelector('#view > div > span:nth-child(6)', { timeout: 2000 }).catch(() => null)
            const passwordField1 = await page.waitForSelector(passwordInputSelector, { timeout: 5000 }).catch(() => null)
            if (viewFooter && !passwordField1) {
                this.bot.log(this.bot.isMobile, 'LOGIN', 'Page "Get a code to sign in" found by "viewFooter"')

                const otherWaysButton = await viewFooter.$('span[role="button"]')
                if (otherWaysButton) {
                    await otherWaysButton.click()
                    await this.bot.utils.wait(5000)

                    const secondListItem = page.locator('[role="listitem"]').nth(1)
                    if (await secondListItem.isVisible()) {
                        await secondListItem.click()
                    }
                }
            }

            // Wait for password field
            const passwordField = await page.waitForSelector(passwordInputSelector, { state: 'visible', timeout: 5000 }).catch(() => null)
            // Always attempt to detect sign-in blocked (even if password field is present on some variants)
            const blocked = await this.detectSignInBlocked(page)
            if (blocked) {
                return
            }
            if (!passwordField) {
                this.bot.log(this.bot.isMobile, 'LOGIN', 'Password field not found, possibly 2FA required (or blocked)', 'warn')
                await this.handle2FA(page)
                return
            }

            await this.bot.utils.wait(1000)

            // Clear and fill password
            await page.fill(passwordInputSelector, '')
            await this.bot.utils.wait(500)
            await page.fill(passwordInputSelector, password)
            await this.bot.utils.wait(1000)

            const nextButton = await page.waitForSelector('button[type="submit"]', { timeout: 2000 }).catch(() => null)
            if (nextButton) {
                await nextButton.click()
                await this.bot.utils.wait(2000)
                this.bot.log(this.bot.isMobile, 'LOGIN', 'Password entered successfully')
            } else {
                this.bot.log(this.bot.isMobile, 'LOGIN', 'Next button not found after password entry', 'warn')
            }

        } catch (error) {
            this.bot.log(this.bot.isMobile, 'LOGIN', `Password entry failed: ${error}`, 'error')
            await this.handle2FA(page)
        }
    }

    private async handle2FA(page: Page) {
        try {
            const numberToPress = await this.get2FACode(page)
            if (numberToPress) {
                // Authenticator App verification
                await this.authAppVerification(page, numberToPress)
            } else {
                // SMS verification
                await this.authSMSVerification(page)
            }
        } catch (error) {
            this.bot.log(this.bot.isMobile, 'LOGIN', `2FA handling failed: ${error}`)
        }
    }

    private async get2FACode(page: Page): Promise<string | null> {
        try {
            const element = await page.waitForSelector('#displaySign, div[data-testid="displaySign"]>span', { state: 'visible', timeout: 2000 })
            return await element.textContent()
        } catch {
            if (this.bot.config.parallel) {
                this.bot.log(this.bot.isMobile, 'LOGIN', 'Script running in parallel, can only send 1 2FA request per account at a time!', 'log', 'yellow')
                this.bot.log(this.bot.isMobile, 'LOGIN', 'Trying again in 60 seconds! Please wait...', 'log', 'yellow')

                // eslint-disable-next-line no-constant-condition
                while (true) {
                    const button = await page.waitForSelector('button[aria-describedby="pushNotificationsTitle errorDescription"]', { state: 'visible', timeout: 2000 }).catch(() => null)
                    if (button) {
                        await this.bot.utils.wait(60000)
                        await button.click()

                        continue
                    } else {
                        break
                    }
                }
            }

            await page.click('button[aria-describedby="confirmSendTitle"]').catch(() => { })
            await this.bot.utils.wait(2000)
            const element = await page.waitForSelector('#displaySign, div[data-testid="displaySign"]>span', { state: 'visible', timeout: 2000 })
            return await element.textContent()
        }
    }

    private async authAppVerification(page: Page, numberToPress: string | null) {
        // eslint-disable-next-line no-constant-condition
        while (true) {
            try {
                this.bot.log(this.bot.isMobile, 'LOGIN', `Press the number ${numberToPress} on your Authenticator app to approve the login`)
                this.bot.log(this.bot.isMobile, 'LOGIN', 'If you press the wrong number or the "DENY" button, try again in 60 seconds')

                await page.waitForSelector('form[name="f1"]', { state: 'detached', timeout: 60000 })

                this.bot.log(this.bot.isMobile, 'LOGIN', 'Login successfully approved!')
                break
            } catch {
                this.bot.log(this.bot.isMobile, 'LOGIN', 'The code is expired. Trying to get a new code...')
                // await page.click('button[aria-describedby="pushNotificationsTitle errorDescription"]')
                const primaryButton = await page.waitForSelector('button[data-testid="primaryButton"]', { state: 'visible', timeout: 5000 }).catch(() => null)
                if (primaryButton) {
                    await primaryButton.click()
                }
                numberToPress = await this.get2FACode(page)
            }
        }
    }

    private async authSMSVerification(page: Page) {
        // If a TOTP secret is configured for this account, auto-generate and submit the code.
        try {
            const secret = this.currentTotpSecret
            if (secret && typeof secret === 'string' && secret.trim().length > 0) {
                const code = generateTOTP(secret.trim())
                await page.fill('input[name="otc"]', code)
                await page.keyboard.press('Enter')
                this.bot.log(this.bot.isMobile, 'LOGIN', 'Submitted TOTP code automatically')
                return
            }
        } catch { /* ignore and fallback to manual prompt */ }

        this.bot.log(this.bot.isMobile, 'LOGIN', '2FA code required. Waiting for user input...')

        // Local readline instance (avoids global singleton side-effects)
        const rlLocal = readline.createInterface({
            input: process.stdin as NodeJS.ReadStream,
            output: process.stdout as NodeJS.WriteStream
        })
        const code = await new Promise<string>((resolve) => {
            rlLocal.question('Enter 2FA code:\n', (input: string) => {
                rlLocal.close()
                resolve(input)
            })
        })

        await page.fill('input[name="otc"]', code)
        await page.keyboard.press('Enter')
        this.bot.log(this.bot.isMobile, 'LOGIN', '2FA code entered successfully')
    }

    async getMobileAccessToken(page: Page, email: string) {
        const authorizeUrl = new URL(this.authBaseUrl)

        authorizeUrl.searchParams.append('response_type', 'code')
        authorizeUrl.searchParams.append('client_id', this.clientId)
        authorizeUrl.searchParams.append('redirect_uri', this.redirectUrl)
        authorizeUrl.searchParams.append('scope', this.scope)
        authorizeUrl.searchParams.append('state', crypto.randomBytes(16).toString('hex'))
        authorizeUrl.searchParams.append('access_type', 'offline_access')
        authorizeUrl.searchParams.append('login_hint', email)

        // Disable FIDO for OAuth flow as well (reduces passkey prompts resurfacing)
        await page.route('**/GetCredentialType.srf*', (route) => {
            const body = JSON.parse(route.request().postData() || '{}')
            body.isFidoSupported = false
            route.continue({ postData: JSON.stringify(body) })
        }).catch(()=>{})

        await page.goto(authorizeUrl.href)

        let currentUrl = new URL(page.url())
        let code: string

        const authStart = Date.now()
        this.bot.log(this.bot.isMobile, 'LOGIN-APP', 'Waiting for authorization...')
        // eslint-disable-next-line no-constant-condition
        while (true) {
            // Attempt to dismiss passkey/passkey-like screens quickly (non-blocking)
            await this.tryDismissPasskeyPrompt(page)
            if (currentUrl.hostname === 'login.live.com' && currentUrl.pathname === '/oauth20_desktop.srf') {
                code = currentUrl.searchParams.get('code')!
                break
            }

            currentUrl = new URL(page.url())
            // Shorter wait to react faster to passkey prompt
            await this.bot.utils.wait(1000)
        }

        const body = new URLSearchParams()
        body.append('grant_type', 'authorization_code')
        body.append('client_id', this.clientId)
        body.append('code', code)
        body.append('redirect_uri', this.redirectUrl)

        const tokenRequest: AxiosRequestConfig = {
            url: this.tokenUrl,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: body.toString()
        }

        const tokenResponse = await this.bot.axios.request(tokenRequest)
        const tokenData: OAuth = await tokenResponse.data

        const authDuration = Date.now() - authStart
        this.bot.log(this.bot.isMobile, 'LOGIN-APP', `Successfully authorized in ${Math.round(authDuration/1000)}s`)
        return tokenData.access_token
    }

    // Utils

    private async checkLoggedIn(page: Page) {
        const targetHostname = 'rewards.bing.com'
        const targetPathname = '/'

        const start = Date.now()
        const maxWaitMs = Number(process.env.LOGIN_MAX_WAIT_MS || 180000) // default 3 minutes
        let guidanceLogged = false
        // eslint-disable-next-line no-constant-condition
        while (true) {
            await this.dismissLoginMessages(page)
            const currentURL = new URL(page.url())
            if (currentURL.hostname === targetHostname && currentURL.pathname === targetPathname) {
                break
            }

            // If we keep looping without prompts for too long, advise and fail fast
            const elapsed = Date.now() - start
            if (elapsed > maxWaitMs) {
                if (!guidanceLogged) {
                    this.bot.log(this.bot.isMobile, 'LOGIN-GUIDE', 'Login taking too long without prompts.')
                    this.bot.log(this.bot.isMobile, 'LOGIN-GUIDE', 'Tip: Enable passwordless sign-in (Microsoft Authenticator “number match”) or add a TOTP secret in accounts.json to auto-fill OTP.')
                    this.bot.log(this.bot.isMobile, 'LOGIN-GUIDE', 'You can also set LOGIN_MAX_WAIT_MS to increase this timeout if needed.')
                    guidanceLogged = true
                }
                throw this.bot.log(this.bot.isMobile, 'LOGIN-TIMEOUT', `Login timed out after ${Math.round(elapsed/1000)}s without completing`, 'error')
            }
        }

        // Wait for login to complete
        await page.waitForSelector('html[data-role-name="RewardsPortal"]', { timeout: 10000 })
        this.bot.log(this.bot.isMobile, 'LOGIN', 'Successfully logged into the rewards portal')
    }

    private lastNoPromptLog: number = 0
    private noPromptIterations: number = 0
    private async dismissLoginMessages(page: Page) {
        let didSomething = false

        // PASSKEY / Windows Hello / Sign in faster
        const passkeyVideo = await page.waitForSelector('[data-testid="biometricVideo"]', { timeout: 1000 }).catch(() => null)
        if (passkeyVideo) {
            const skipButton = await page.$('button[data-testid="secondaryButton"]')
            if (skipButton) {
                await skipButton.click().catch(()=>{})
                if (!this.passkeyHandled) {
                    this.bot.log(this.bot.isMobile, 'LOGIN-PASSKEY', 'Passkey dialog detected (video heuristic) -> clicked "Skip for now"')
                }
                this.passkeyHandled = true
                await page.waitForTimeout(300)
                didSomething = true
            }
        }
        if (!didSomething) {
            const titleEl = await page.waitForSelector('[data-testid="title"]', { timeout: 800 }).catch(() => null)
            const titleText = (titleEl ? (await titleEl.textContent()) : '')?.trim() || ''
            const looksLikePasskey = /sign in faster|passkey|fingerprint|face|pin/i.test(titleText)
            const secondaryBtn = await page.waitForSelector('button[data-testid="secondaryButton"]', { timeout: 500 }).catch(() => null)
            const primaryBtn = await page.waitForSelector('button[data-testid="primaryButton"]', { timeout: 500 }).catch(() => null)
            if (looksLikePasskey && secondaryBtn) {
                await secondaryBtn.click().catch(()=>{})
                if (!this.passkeyHandled) {
                    this.bot.log(this.bot.isMobile, 'LOGIN-PASSKEY', `Passkey dialog detected (title: "${titleText}") -> clicked secondary`)
                }
                this.passkeyHandled = true
                await page.waitForTimeout(300)
                didSomething = true
            } else if (!didSomething && secondaryBtn && primaryBtn) {
                const secText = (await secondaryBtn.textContent() || '').trim()
                if (/skip for now/i.test(secText)) {
                    await secondaryBtn.click().catch(()=>{})
                    if (!this.passkeyHandled) {
                        this.bot.log(this.bot.isMobile, 'LOGIN-PASSKEY', 'Passkey dialog (pair heuristic) -> clicked secondary (Skip for now)')
                    }
                    this.passkeyHandled = true
                    await page.waitForTimeout(300)
                    didSomething = true
                }
            }
            if (!didSomething) {
                const skipByText = await page.locator('xpath=//button[contains(normalize-space(.), "Skip for now")]').first()
                if (await skipByText.isVisible().catch(()=>false)) {
                    await skipByText.click().catch(()=>{})
                    if (!this.passkeyHandled) {
                        this.bot.log(this.bot.isMobile, 'LOGIN-PASSKEY', 'Passkey dialog (text fallback) -> clicked "Skip for now"')
                    }
                    this.passkeyHandled = true
                    await page.waitForTimeout(300)
                    didSomething = true
                }
            }
            if (!didSomething) {
                const closeBtn = await page.$('#close-button')
                if (closeBtn) {
                    await closeBtn.click().catch(()=>{})
                    if (!this.passkeyHandled) {
                        this.bot.log(this.bot.isMobile, 'LOGIN-PASSKEY', 'Attempted close button on potential passkey modal')
                    }
                    this.passkeyHandled = true
                    await page.waitForTimeout(300)
                }
            }
        }

        // KMSI (Keep me signed in) prompt
        const kmsi = await page.waitForSelector('[data-testid="kmsiVideo"]', { timeout: 800 }).catch(()=>null)
        if (kmsi) {
            const yesButton = await page.$('button[data-testid="primaryButton"]')
            if (yesButton) {
                await yesButton.click().catch(()=>{})
                this.bot.log(this.bot.isMobile, 'LOGIN-KMSI', 'KMSI dialog detected -> accepted (Yes)')
                await page.waitForTimeout(300)
                didSomething = true
            }
        }

        if (!didSomething) {
            this.noPromptIterations++
            const now = Date.now()
            if (this.noPromptIterations === 1 || (now - this.lastNoPromptLog) > 10000) {
                this.lastNoPromptLog = now
                this.bot.log(this.bot.isMobile, 'LOGIN-NO-PROMPT', `No dialogs (x${this.noPromptIterations})`)
                // Reset counter if it grows large to keep number meaningful
                if (this.noPromptIterations > 50) this.noPromptIterations = 0
            }
        } else {
            // Reset counters after an interaction
            this.noPromptIterations = 0
        }
    }

    /** Lightweight passkey prompt dismissal used in mobile OAuth loop */
    private async tryDismissPasskeyPrompt(page: Page) {
        try {
            // Fast existence checks with very small timeouts to avoid slowing the loop
            const titleEl = await page.waitForSelector('[data-testid="title"]', { timeout: 500 }).catch(() => null)
            const secondaryBtn = await page.waitForSelector('button[data-testid="secondaryButton"]', { timeout: 500 }).catch(() => null)
            // Direct text locator fallback (sometimes data-testid changes)
            const textSkip = secondaryBtn ? null : await page.locator('xpath=//button[contains(normalize-space(.), "Skip for now")]').first().isVisible().catch(()=>false)
            if (secondaryBtn) {
                // Heuristic: if title indicates passkey or both primary/secondary exist with typical text
                let shouldClick = false
                let titleText = ''
                if (titleEl) {
                    titleText = (await titleEl.textContent() || '').trim()
                    if (/sign in faster|passkey|fingerprint|face|pin/i.test(titleText)) {
                        shouldClick = true
                    }
                }
                if (!shouldClick && textSkip) {
                    shouldClick = true
                }
                if (!shouldClick) {
                    // Fallback text probe on the secondary button itself
                    const btnText = (await secondaryBtn.textContent() || '').trim()
                    if (/skip for now/i.test(btnText)) {
                        shouldClick = true
                    }
                }
                if (shouldClick) {
                    await secondaryBtn.click().catch(() => { })
                    if (!this.passkeyHandled) {
                        this.bot.log(this.bot.isMobile, 'LOGIN-PASSKEY', `Passkey prompt (loop) -> clicked skip${titleText ? ` (title: ${titleText})` : ''}`)
                    }
                    this.passkeyHandled = true
                    await this.bot.utils.wait(500)
                }
            }
        } catch { /* ignore minor errors */ }
    }

    private async checkBingLogin(page: Page): Promise<void> {
        try {
            this.bot.log(this.bot.isMobile, 'LOGIN-BING', 'Verifying Bing login')
            await page.goto('https://www.bing.com/fd/auth/signin?action=interactive&provider=windows_live_id&return_url=https%3A%2F%2Fwww.bing.com%2F')

            const maxIterations = 5

            for (let iteration = 1; iteration <= maxIterations; iteration++) {
                const currentUrl = new URL(page.url())

                if (currentUrl.hostname === 'www.bing.com' && currentUrl.pathname === '/') {
                    await this.bot.browser.utils.tryDismissAllMessages(page)

                    const loggedIn = await this.checkBingLoginStatus(page)
                    // If mobile browser, skip this step
                    if (loggedIn || this.bot.isMobile) {
                        this.bot.log(this.bot.isMobile, 'LOGIN-BING', 'Bing login verification passed!')
                        break
                    }
                }

                await this.bot.utils.wait(1000)
            }

        } catch (error) {
            this.bot.log(this.bot.isMobile, 'LOGIN-BING', 'An error occurred:' + error, 'error')
        }
    }

    private async checkBingLoginStatus(page: Page): Promise<boolean> {
        try {
            await page.waitForSelector('#id_n', { timeout: 5000 })
            return true
        } catch (error) {
            return false
        }
    }

    private async checkAccountLocked(page: Page) {
        await this.bot.utils.wait(2000)
        const isLocked = await page.waitForSelector('#serviceAbuseLandingTitle', { state: 'visible', timeout: 1000 }).then(() => true).catch(() => false)
        if (isLocked) {
            throw this.bot.log(this.bot.isMobile, 'CHECK-LOCKED', 'This account has been locked! Remove the account from "accounts.json" and restart!', 'error')
        }
    }

    /** Detects Microsoft "We can't sign you in" / too many attempts blocks (with or without password field). */
    private async detectSignInBlocked(page: Page): Promise<boolean> {
        try {
            if (this.bot.compromisedModeActive && this.bot.compromisedReason === 'sign-in-blocked') return true
            // Gather potential heading/title nodes
            const selectors = [
                '[data-testid="title"]',
                'h1',
                'div[role="heading"]',
                'div.text-title'
            ]
            let text = ''
            for (const sel of selectors) {
                const el = await page.waitForSelector(sel, { timeout: 800 }).catch(()=>null)
                if (el) {
                    const t = (await el.textContent() || '').trim()
                    if (t.length > 0 && t.length < 400) {
                        text += ' \n ' + t
                    }
                }
            }
            const lower = text.toLowerCase()
            const patterns: { re: RegExp; label: string }[] = [
                { re: /we can['’`]?t sign you in/, label: 'cant-sign-in' },
                { re: /incorrect account or password too many times/, label: 'too-many-incorrect' },
                { re: /used an incorrect account or password too many times/, label: 'too-many-incorrect-variant' },
                { re: /sign-in has been blocked/, label: 'sign-in-blocked-phrase' },
                { re: /your account has been locked/, label: 'account-locked' },
                { re: /your account or password is incorrect too many times/, label: 'incorrect-too-many-times' }
            ]
            let matched: string | null = null
            for (const p of patterns) { if (p.re.test(lower)) { matched = p.label; break } }
            const hit = !!matched
            const SECURITY_DEBUG = process.env.SECURITY_DEBUG === '1'
            if (SECURITY_DEBUG) {
                this.bot.log(this.bot.isMobile, 'SECURITY-DEBUG', `Sign-in blocked probe matched=${matched||'none'} raw="${text.replace(/\s+/g,' ').slice(0,300)}"`)
            }
            if (!hit) return false
            const email = this.bot.currentAccountEmail || 'account'
            const docsUrl = this.getDocsUrl('we-cant-sign-you-in')
            const incident = {
                kind: 'We can\'t sign you in (blocked)',
                account: email,
                details: [
                    'Microsoft presented a sign-in blocked page (too many incorrect attempts).',
                    matched ? `Pattern: ${matched}` : 'Pattern: unknown'
                ],
                next: ['Automation paused (standby). Solve challenges manually, then resume.', 'See docs for recovery steps.'],
                docsUrl
            }
            await this.sendIncidentAlert(incident, 'warn')
            this.bot.compromisedModeActive = true
            this.bot.compromisedReason = 'sign-in-blocked'
            this.startCompromisedInterval()
            await this.bot.engageGlobalStandby('sign-in-blocked', this.bot.currentAccountEmail).catch(()=>{})
            try { await this.openDocsTab(page, docsUrl) } catch { /* ignore */ }
            await this.saveIncidentArtifacts(page, 'sign-in-blocked').catch(()=>{})
            return true
        } catch {
            return false
        }
    }

    // --- Helpers added to satisfy references and provide incident handling ---

    /**
     * Detects a masked recovery email prompt and optionally compares it to an expected recovery email.
     * If a mismatch is suspected, logs a warning and marks the session as compromised in a soft way.
     * This is intentionally lightweight to avoid false-positives.
     */
    private async detectAndHandleRecoveryMismatch(page: Page, email: string): Promise<void> {
        try {
            // If no expected recovery email configured, skip.
            const expected: string | undefined = this.bot.currentAccountRecoveryEmail
            if (!expected || typeof expected !== 'string' || !expected.includes('@')) return

            const [expLocal, expDomain] = expected.split('@')
            const expPrefix = (expLocal || '').slice(0, 2).toLowerCase()
            const expDomainLc = (expDomain || '').toLowerCase()
            if (!expPrefix || !expDomainLc) return

            // Try multiple heuristics to capture masked recovery hints across locales and UI variants.
            const candidates: string[] = []

            // 1) Common testids/ids + generic spans containing French prompt fragments (locale support)
            const sel1 = '[data-testid="recoveryEmailHint"], #recoveryEmail, [id*="ProofEmail"], [id*="EmailProof"], [data-testid*="Email"], span:has(span.fui-Text)'
            const el1 = await page.waitForSelector(sel1, { timeout: 2000 }).catch(() => null)
            if (el1) {
                const txt = (await el1.textContent() || '').trim()
                if (txt) candidates.push(txt)
            }

            // 2) Radio/list items often list proof methods with masked emails
            const listItems = page.locator('[role="listitem"], li')
            const count = await listItems.count().catch(()=>0)
            for (let i=0; i<count && i<10; i++) {
                const t = (await listItems.nth(i).textContent().catch(()=>''))?.trim() || ''
                if (t && /@/.test(t)) candidates.push(t)
            }

            // 3) Generic XPath: any visible text containing @ and either * or •
            const x = page.locator('xpath=//*[contains(normalize-space(.), "@") and (contains(normalize-space(.), "*") or contains(normalize-space(.), "•"))]')
            const xCount = await x.count().catch(()=>0)
            for (let i=0; i<xCount && i<10; i++) {
                const t = (await x.nth(i).textContent().catch(()=>''))?.trim() || ''
                if (t && t.length < 300) candidates.push(t)
            }

            // Normalize and filter distinct
            const seen = new Set<string>()
            const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
            const uniq = candidates.map(norm).filter(t => {
                if (!t) return false
                if (seen.has(t)) return false
                seen.add(t)
                return true
            })

            // Keep only texts that look like masked emails
            let masked = uniq.filter(t => /@/.test(t) && (/[•*]/.test(t) || /\*\*+/.test(t)))

            // Fallback: regex scan of full HTML if none found (covers deeply nested spans like French UI sample)
            if (masked.length === 0) {
                try {
                    const html = await page.content()
                    const regex = /[A-Za-z0-9]{1,4}\*{2,}[A-Za-z0-9._-]*@[A-Za-z0-9.-]+/g
                    const found = new Set<string>()
                    let m: RegExpExecArray | null
                    while ((m = regex.exec(html)) !== null) {
                        found.add(m[0])
                    }
                    if (found.size > 0) {
                        masked = Array.from(found)
                    }
                } catch { /* ignore */ }
            }

            const RECOVERY_DEBUG = process.env.RECOVERY_DEBUG === '1'
            if (RECOVERY_DEBUG) {
                this.bot.log(this.bot.isMobile, 'RECOVERY-DEBUG', `candidates=${candidates.length} uniq=${uniq.length} masked=${masked.length}`)
            }
            if (masked.length === 0) return

            // Try to find a candidate mentioning email specifically
            const emailish = masked.find(t => /email|courriel|mail|adresse/i.test(t)) || masked[0]
            const maskedText = emailish || ''

            // Compare domain + prefix heuristically
            const lc = maskedText.toLowerCase()
            const hasDomain = lc.includes(expDomainLc)
            // Prefix should appear before the '@'
            const atIdx = lc.indexOf('@')
            const prefixIdx = lc.indexOf(expPrefix)
            const hasPrefix = (prefixIdx >= 0) && (atIdx < 0 || prefixIdx < atIdx + 1)

            if (!hasDomain || !hasPrefix) {
                const docsUrl = this.getDocsUrl('recovery-email-mismatch')
                const incident = {
                    kind: 'Recovery email mismatch',
                    account: email,
                    details: [
                        `Masked hint: ${maskedText.substring(0,200)}`,
                        `Expected: ${expected}`
                    ],
                    next: [
                        'Proceed with caution. Automation will pause after login to let you review the account.',
                        'Verify the recovery email and update your configuration if needed.'
                    ],
                    docsUrl
                }
                await this.sendIncidentAlert(incident, 'warn')
                await this.saveIncidentArtifacts(page, 'recovery-mismatch').catch(()=>{})

                // Enter a compromised/standby mode to avoid continuing with other accounts.
                this.bot.compromisedModeActive = true
                this.bot.compromisedReason = 'recovery-mismatch'
                this.startCompromisedInterval()
                try { await this.bot.engageGlobalStandby('recovery-mismatch', this.bot.currentAccountEmail) } catch { /* ignore */ }
                try { await this.openDocsTab(page, docsUrl) } catch { /* ignore */ }
            } else {
                // Optional: always log the masked email when debug enabled or first time
                this.bot.log(this.bot.isMobile, 'LOGIN-RECOVERY', `Masked recovery email accepted: ${maskedText} (expected prefix+domain match)`)
            }
        } catch {
            // Non-fatal: ignore any parsing issues.
        }
    }

    /**
     * Sends a unified incident alert. Minimal implementation falling back to console logs.
     * Severity may be 'warn' or 'critical'.
     */
    private async sendIncidentAlert(
        incident: { kind: string; account: string; details?: string[]; next?: string[]; docsUrl?: string },
        severity: 'warn' | 'critical' = 'warn'
    ): Promise<void> {
        const lines: string[] = []
        lines.push(`[Incident] ${incident.kind}`)
        lines.push(`Account: ${incident.account}`)
        if (incident.details && incident.details.length) lines.push(`Details: ${incident.details.join(' | ')}`)
        if (incident.next && incident.next.length) lines.push(`Next: ${incident.next.join(' -> ')}`)
        if (incident.docsUrl) lines.push(`Docs: ${incident.docsUrl}`)
        const level: 'warn' | 'error' = severity === 'critical' ? 'error' : 'warn'
        this.bot.log(this.bot.isMobile, 'SECURITY', lines.join(' | '), level)

        // Send a structured embed to webhooks for visibility (aligns with docs)
        try {
            const { ConclusionWebhook } = await import('../util/ConclusionWebhook')
            const color = severity === 'critical' ? 0xFF0000 : 0xFFAA00
            const fields = [] as { name: string; value: string; inline?: boolean }[]
            fields.push({ name: 'Account', value: incident.account })
            if (incident.details && incident.details.length) {
                fields.push({ name: 'Details', value: incident.details.join('\n') })
            }
            if (incident.next && incident.next.length) {
                fields.push({ name: 'Next steps', value: incident.next.join('\n') })
            }
            if (incident.docsUrl) {
                fields.push({ name: 'Docs', value: incident.docsUrl })
            }
            await ConclusionWebhook(this.bot.config, '', {
                embeds: [
                    {
                        title: `🔐 ${incident.kind}`,
                        description: 'Security check by @Light',
                        color,
                        fields
                    }
                ]
            })
        } catch { /* ignore webhook failures */ }
    }

    /** Builds a docs URL for security incidents. */
    private getDocsUrl(anchor?: string): string {
    const base = process.env.DOCS_BASE?.trim() || 'https://github.com/LightZirconite/Microsoft-Rewards-Script-Private/blob/V2/docs/security.md'
        if (!anchor) return base
        const map: Record<string, string> = {
            'recovery-email-mismatch': '#recovery-email-mismatch',
            'we-cant-sign-you-in': '#we-cant-sign-you-in-blocked'
        }
        const suffix = map[anchor] || ''
        return suffix ? `${base}${suffix}` : base
    }

    /** Opens the given docs URL in a new tab (best-effort). */
    private async openDocsTab(page: Page, url: string): Promise<void> {
        try {
            const ctx = page.context()
            const tab = await ctx.newPage()
            await tab.goto(url)
        } catch {
            // ignore
        }
    }

    /** Periodically reminds the operator that the session is in compromised/standby mode. */
    private startCompromisedInterval() {
    if (this.compromisedInterval) clearInterval(this.compromisedInterval)
        // Repeat reminder every 5 minutes (as documented)
        this.compromisedInterval = setInterval(() => {
            try {
                this.bot.log(this.bot.isMobile, 'SECURITY', 'Account in security standby. Review incident and docs before proceeding. Security check by @Light', 'warn')
            } catch { /* ignore */ }
        }, 5 * 60 * 1000)
    }

    /** Save screenshot + minimal HTML snapshot for a security incident (best-effort). */
    private async saveIncidentArtifacts(page: Page, slug: string): Promise<void> {
        try {
            const baseDir = path.join(process.cwd(), 'diagnostics', 'security-incidents')
            await fs.promises.mkdir(baseDir, { recursive: true })
            const ts = new Date().toISOString().replace(/[:.]/g, '-')
            const dir = path.join(baseDir, `${ts}-${slug}`)
            await fs.promises.mkdir(dir, { recursive: true })
            // Screenshot
            try { await page.screenshot({ path: path.join(dir, 'page.png'), fullPage: false }) } catch { /* ignore */ }
            // HTML snippet
            try {
                const html = await page.content()
                await fs.promises.writeFile(path.join(dir, 'page.html'), html)
            } catch { /* ignore */ }
            this.bot.log(this.bot.isMobile, 'SECURITY', `Saved incident artifacts: ${dir}`)
        } catch { /* ignore */ }
    }
}
