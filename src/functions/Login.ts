import type { Page } from 'playwright'
import readline from 'readline'
import * as crypto from 'crypto'
import { AxiosRequestConfig } from 'axios'

import { MicrosoftRewardsBot } from '../index'
import { saveSessionData } from '../util/Load'
import { generateTOTP } from '../util/Totp'

import { OAuth } from '../interface/OAuth'


const rl = readline.createInterface({
    input: process.stdin as NodeJS.ReadStream,
    output: process.stdout as NodeJS.WriteStream
})

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
            if (!passwordField) {
                // Detect explicit sign-in failure page
                const titleEl = await page.waitForSelector('[data-testid="title"]', { timeout: 1500 }).catch(() => null)
                const titleText = (titleEl ? (await titleEl.textContent()) : '')?.trim() || ''
                if (/we can't sign you in|we can’t sign you in/i.test(titleText)) {
                    const email = this.bot.currentAccountEmail || 'account'
                    const docsUrl = this.getDocsUrl('we-cant-sign-you-in')
                        const incident = {
                            kind: 'We can\'t sign you in (blocked)',
                            account: email,
                            details: ['Microsoft presented a sign-in blocked page during login.'],
                            next: ['Automation paused and global standby engaged.', 'Complete required challenges, then review the docs.'],
                            docsUrl
                        }
                        await this.sendIncidentAlert(incident, 'warn')
                    // Mark compromised mode to stop farming but allow manual intervention
                    this.bot.compromisedModeActive = true
                    this.bot.compromisedReason = 'sign-in-blocked'
                    this.startCompromisedInterval()
                    // Engage global standby so we do not proceed to next accounts
                    await this.bot.engageGlobalStandby('sign-in-blocked', this.bot.currentAccountEmail)
                    // Open docs tab
                        try { await this.openDocsTab(page, incident.docsUrl!) } catch { /* ignore */ }
                }
                this.bot.log(this.bot.isMobile, 'LOGIN', 'Password field not found, possibly 2FA required', 'warn')
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
                // Detect incorrect password error, and if we already had a recovery mismatch, escalate as suspected hijack
                try {
                    let bad = false
                    const errNode = await page.locator('xpath=//span[contains(normalize-space(.), "That password is incorrect")]').first()
                    if (await errNode.isVisible().catch(() => false)) {
                        bad = true
                    } else {
                        const html = await page.content().catch(() => '')
                        bad = /That password is incorrect for your Microsoft account\./i.test(html)
                    }
                    if (bad && this.bot.compromisedModeActive && this.bot.compromisedReason === 'recovery-mismatch') {
                        const email = this.bot.currentAccountEmail || 'account'
                        const docsUrl = this.getDocsUrl('recovery-email-mismatch')
                        const block = this.buildIncidentBlock({
                            kind: 'Recovery mismatch + incorrect password',
                            account: email,
                            details: [
                                'Recovery email mismatch already detected.',
                                'Now Microsoft reports the password is incorrect.'
                            ],
                            next: [
                                'This strongly indicates a possible hijack. Do NOT proceed.',
                                'Secure the account immediately and rotate credentials. See docs.'
                            ],
                            docsUrl
                        })
                        await this.raiseCriticalAlert(block + '\nSecurity check by @Light')
                        try { await this.bot.engageGlobalStandby('suspected-hijack', email) } catch { /* ignore */ }
                        try { await this.openDocsTab(page, docsUrl) } catch { /* ignore */ }
                    }
                } catch { /* ignore */ }
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

        const code = await new Promise<string>((resolve) => {
            rl.question('Enter 2FA code:\n', (input: string) => {
                rl.close()
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
            // Detect explicit error title and exit early in compromised mode
            try {
                const titleEl = await page.waitForSelector('[data-testid="title"]', { timeout: 500 }).catch(() => null)
                const titleText = (titleEl ? (await titleEl.textContent()) : '')?.trim() || ''
                if (/we can't sign you in|we can’t sign you in/i.test(titleText)) {
                    if (!this.bot.compromisedModeActive) {
                        this.bot.compromisedModeActive = true
                        this.bot.compromisedReason = 'sign-in-blocked'
                        const email = this.bot.currentAccountEmail || 'account'
                        const docsUrl = this.getDocsUrl('we-cant-sign-you-in')
                        const block = this.buildIncidentBlock({
                            kind: 'We can\'t sign you in (blocked)',
                            account: email,
                            details: ['Microsoft presented a sign-in blocked page during login.'],
                            next: ['Automation paused and global standby engaged.', 'Complete required challenges, then review the docs.'],
                            docsUrl
                        })
                        await this.raiseSecurityAlert(`${block}\nSecurity check by @Light`)
                        this.startCompromisedInterval()
                        try { await this.bot.engageGlobalStandby('sign-in-blocked', this.bot.currentAccountEmail) } catch { /* ignore */ }
                        try { await this.openDocsTab(page, docsUrl) } catch { /* ignore */ }
                    }
                    return
                }
            } catch { /* ignore */ }
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

    // --- Security helpers ---
    private extractMaskedEmailFromDom(html: string): string | null {
        // Look for pattern like "We'll send a code to ko*****@sfr.fr"
        const m = html.match(/We'll send a code to\s+([^<\s]+)\.\s+To verify/i)
        if (m && m[1]) return m[1].trim()
        // Generic fallback: find first token like xx***@domain.tld
        const m2 = html.match(/\b([a-zA-Z]{1,3})\*+@([a-zA-Z0-9.-]+\.[A-Za-z]{2,})\b/)
        if (m2) return `${m2[1]}*****@${m2[2]}`
        return null
    }

    private parseMasked(masked: string): { firstTwo: string; domain: string } | null {
    const mm = masked.match(/^([a-zA-Z]{2})\*+@([a-zA-Z0-9.-]+)$/)
    if (!mm || !mm[1] || !mm[2]) return null
    return { firstTwo: mm[1]!.toLowerCase(), domain: mm[2]!.toLowerCase() }
    }

    private expectedFromEmail(email: string): { firstTwo: string; domain: string } | null {
        const parts = email.split('@')
        if (parts.length !== 2) return null
        const local = parts[0]!.toLowerCase()
        const domain = parts[1]!.toLowerCase()
        if (local.length < 2) return null
        return { firstTwo: local.slice(0, 2), domain }
    }

    private async detectAndHandleRecoveryMismatch(page: Page, accountEmail: string) {
        // Pull expected recovery from bot, set by index.ts at account start
        const expectedRecovery: string | undefined = this.bot.currentAccountRecoveryEmail

        if (!expectedRecovery || typeof expectedRecovery !== 'string' || !/@/.test(expectedRecovery)) return

        // Try to locate the masked email snippet in the DOM
        let masked: string | null = null
        try {
            // Prefer DOM lookup: the masked email is inside a nested span under the phrase container
            const container = page.locator('xpath=//span[contains(normalize-space(.), "We\'ll send a code to")]')
            if (await container.first().isVisible().catch(() => false)) {
                const inner = container.locator('span').first()
                const t = await inner.textContent().catch(() => null)
                if (t && /\*+@/.test(t)) masked = t.trim()
            }
        } catch { /* ignore */ }
        try {
            const html = await page.content()
            masked = this.extractMaskedEmailFromDom(html)
        } catch { /* ignore */ }
        if (!masked) return

        const parsedMasked = this.parseMasked(masked)
        const parsedExpected = this.expectedFromEmail(expectedRecovery)
        if (!parsedMasked || !parsedExpected) return

        const ok = parsedMasked.firstTwo === parsedExpected.firstTwo && parsedMasked.domain === parsedExpected.domain
        if (!ok) {
            const docsUrl = this.getDocsUrl('recovery-email-mismatch')
            const block = this.buildIncidentBlock({
                kind: 'Recovery email mismatch',
                account: accountEmail,
                details: [
                    `Masked: ${masked}`,
                    `Expected: ${parsedExpected.firstTwo}*****@${parsedExpected.domain}`
                ],
                next: [
                    'Automation paused for this account and global standby engaged.',
                    'Review the docs and secure your account; update accounts.json if you changed the recovery email.'
                ],
                docsUrl
            })
            this.raiseSecurityAlert(`${block}\nSecurity check by @Light`)
            // Mark compromised so tasks stop after login
            this.bot.compromisedModeActive = true
            this.bot.compromisedReason = 'recovery-mismatch'
            this.bot.compromisedEmail = accountEmail
            // Start periodic terminal reminders every 5 minutes
            this.startCompromisedInterval()
            // Engage global standby to avoid processing other accounts until resolved
            await this.bot.engageGlobalStandby('recovery-mismatch', accountEmail)
            // Open docs tab to the relevant section
            try { await this.openDocsTab(page, docsUrl) } catch { /* ignore */ }
        }
    }

    private startCompromisedInterval() {
        if (this.compromisedInterval) return
        this.compromisedInterval = setInterval(() => {
            this.bot.log(this.bot.isMobile, 'SECURITY', 'Account security issue persists. Please review immediately. Security check by @Light', 'warn', 'yellow')
        }, 5 * 60 * 1000)
    }

    public clearCompromisedInterval() {
        if (this.compromisedInterval) {
            clearInterval(this.compromisedInterval)
            this.compromisedInterval = undefined
        }
    }

    private async raiseSecurityAlert(message: string) {
        try {
            this.bot.log(this.bot.isMobile, 'SECURITY', message, 'error', 'red')
            const { ConclusionWebhook } = await import('../util/ConclusionWebhook')
            // Mention everyone for high visibility
            const content = `@everyone ${message}`
            await ConclusionWebhook(this.bot.config, content, {
                embeds: [
                    {
                        title: '🔐 Security alert',
                        description: message,
                        color: 0xFFAA00
                    }
                ]
            })
        } catch {/* ignore */}
    }

    // Build a single multi-line incident block for terminal/webhook readability
    private buildIncidentBlock(input: { kind: string; account: string; details?: string[]; next?: string[]; docsUrl?: string }): string {
        const lines: string[] = []
        lines.push('==================== SECURITY INCIDENT ====================')
        lines.push(`Type   : ${input.kind}`)
        lines.push(`Account: ${input.account}`)
        if (input.details && input.details.length) {
            lines.push('Details:')
            for (const d of input.details) lines.push(`  - ${d}`)
        }
        if (input.next && input.next.length) {
            lines.push('Next steps:')
            for (const n of input.next) lines.push(`  - ${n}`)
        }
        if (input.docsUrl) lines.push(`Docs   : ${input.docsUrl}`)
        lines.push('===========================================================')
        return lines.join('\n')
    }

    // Compute docs URL to GitHub with anchors; configurable via DOCS_BASE_URL env
    private getDocsUrl(anchor: 'recovery-email-mismatch' | 'we-cant-sign-you-in'): string {
        const rel = 'information/security.md'
        const map: Record<string, string> = {
            'recovery-email-mismatch': '#recovery-email-mismatch',
            'we-cant-sign-you-in': '#we-cant-sign-you-in-blocked'
        }
        const hash = map[anchor] || ''
        const defaultBase = 'https://github.com/TheNetsky/Microsoft-Rewards-Script'
        const rawBase = (process.env.DOCS_BASE_URL && process.env.DOCS_BASE_URL.trim()) || defaultBase
        const base = rawBase.replace(/\/$/, '')
        if (/github\.com\//i.test(base)) {
            // Ensure we have a blob path; default to main branch
            if (!/\/blob\//.test(base)) {
                return `${base}/blob/main/${rel}${hash}`
            }
            return `${base}/${rel}${hash}`
        }
        // Fallback combine
        return `${base}/${rel}${hash}`
    }

    // Critical alert with red embed for high-severity signals
    private async raiseCriticalAlert(message: string) {
        try {
            this.bot.log(this.bot.isMobile, 'SECURITY', message, 'error', 'red')
            const { ConclusionWebhook } = await import('../util/ConclusionWebhook')
            const content = `@everyone ${message}`
            await ConclusionWebhook(this.bot.config, content, {
                embeds: [
                    {
                        title: '🚨 Possible hijack detected',
                        description: message,
                        color: 0xFF0000
                    }
                ]
            })
        } catch { /* ignore */ }
    }

    // Open docs in a new tab in the same browser context
    private async openDocsTab(page: Page, url: string) {
        try {
            const ctx = page.context()
            const tab = await ctx.newPage()
            await tab.goto(url)
        } catch { /* ignore */ }
    }
}
