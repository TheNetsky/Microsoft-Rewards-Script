// Clean refactored Login implementation
// Public API preserved: login(), getMobileAccessToken()

import type { Page, Locator } from 'playwright'
import * as crypto from 'crypto'
import readline from 'readline'
import { AxiosRequestConfig } from 'axios'
import { generateTOTP } from '../util/Totp'
import { saveSessionData } from '../util/Load'
import { MicrosoftRewardsBot } from '../index'
import { captureDiagnostics } from '../util/Diagnostics'
import { OAuth } from '../interface/OAuth'
import { Retry } from '../util/Retry'

// -------------------------------
// Constants / Tunables
// -------------------------------
const SELECTORS = {
  emailInput: 'input[type="email"]',
  passwordInput: 'input[type="password"]',
  submitBtn: 'button[type="submit"]',
  passkeySecondary: 'button[data-testid="secondaryButton"]',
  passkeyPrimary: 'button[data-testid="primaryButton"]',
  passkeyTitle: '[data-testid="title"]',
  kmsiVideo: '[data-testid="kmsiVideo"]',
  biometricVideo: '[data-testid="biometricVideo"]'
} as const

const LOGIN_TARGET = { host: 'rewards.bing.com', path: '/' }

const DEFAULT_TIMEOUTS = {
  loginMaxMs: (() => {
    const val = Number(process.env.LOGIN_MAX_WAIT_MS || 300000)
    if (isNaN(val) || val < 10000 || val > 600000) {
      console.warn(`[Login] Invalid LOGIN_MAX_WAIT_MS: ${process.env.LOGIN_MAX_WAIT_MS}. Using default 300000ms`)
      return 300000
    }
    return val
  })(),
  short: 200,        // Reduced from 500ms
  medium: 800,       // Reduced from 1500ms
  long: 1500,        // Reduced from 3000ms
  oauthMaxMs: 360000,
  portalWaitMs: 15000,
  elementCheck: 100, // Fast element detection
  fastPoll: 500      // Fast polling interval
}

// Security pattern bundle
const SIGN_IN_BLOCK_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /we can['’`]?t sign you in/i, label: 'cant-sign-in' },
  { re: /incorrect account or password too many times/i, label: 'too-many-incorrect' },
  { re: /used an incorrect account or password too many times/i, label: 'too-many-incorrect-variant' },
  { re: /sign-in has been blocked/i, label: 'sign-in-blocked-phrase' },
  { re: /your account has been locked/i, label: 'account-locked' },
  { re: /your account or password is incorrect too many times/i, label: 'incorrect-too-many-times' }
]

interface SecurityIncident {
  kind: string
  account: string
  details?: string[]
  next?: string[]
  docsUrl?: string
}

export class Login {
  private bot: MicrosoftRewardsBot
  private clientId = '0000000040170455'
  private authBaseUrl = 'https://login.live.com/oauth20_authorize.srf'
  private redirectUrl = 'https://login.live.com/oauth20_desktop.srf'
  private tokenUrl = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
  private scope = 'service::prod.rewardsplatform.microsoft.com::MBI_SSL'

  private currentTotpSecret?: string
  private compromisedInterval?: NodeJS.Timeout
  private passkeyHandled = false
  private noPromptIterations = 0
  private lastNoPromptLog = 0
  private lastTotpSubmit = 0
  private totpAttempts = 0

  constructor(bot: MicrosoftRewardsBot) { this.bot = bot }

  // --------------- Public API ---------------
  async login(page: Page, email: string, password: string, totpSecret?: string) {
    try {
      // Clear any existing intervals from previous runs to prevent memory leaks
      this.cleanupCompromisedInterval()
      
      this.bot.log(this.bot.isMobile, 'LOGIN', 'Starting login process')
      this.currentTotpSecret = (totpSecret && totpSecret.trim()) || undefined
      this.lastTotpSubmit = 0
      this.totpAttempts = 0

      const resumed = await this.tryReuseExistingSession(page)
      if (resumed) {
        // OPTIMIZATION: Skip Bing verification if already on rewards page
        const needsVerification = !page.url().includes('rewards.bing.com')
        if (needsVerification) {
          await this.verifyBingContext(page)
        }
        await saveSessionData(this.bot.config.sessionPath, page.context(), email, this.bot.isMobile)
        this.bot.log(this.bot.isMobile, 'LOGIN', 'Session restored (fast path)')
        this.currentTotpSecret = undefined
        return
      }

      // Full login flow needed
      await page.goto('https://rewards.bing.com/signin', { waitUntil: 'domcontentloaded' })
      await this.disableFido(page)
      
      // OPTIMIZATION: Parallel checks instead of sequential
      const [, , portalCheck] = await Promise.allSettled([
        this.bot.browser.utils.reloadBadPage(page),
        this.tryAutoTotp(page, 'initial landing'),
        page.waitForSelector('html[data-role-name="RewardsPortal"]', { timeout: 3000 })
      ])
      
      await this.checkAccountLocked(page)

      const alreadyAuthenticated = portalCheck.status === 'fulfilled'
      if (!alreadyAuthenticated) {
        await this.performLoginFlow(page, email, password)
      } else {
        this.bot.log(this.bot.isMobile, 'LOGIN', 'Already authenticated')
      }

      // OPTIMIZATION: Only verify Bing if needed
      const needsBingVerification = !page.url().includes('rewards.bing.com')
      if (needsBingVerification) {
        await this.verifyBingContext(page)
      }
      
      await saveSessionData(this.bot.config.sessionPath, page.context(), email, this.bot.isMobile)
      this.bot.log(this.bot.isMobile, 'LOGIN', 'Login complete')
      this.currentTotpSecret = undefined
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e)
      const stackTrace = e instanceof Error ? e.stack : undefined
      this.bot.log(this.bot.isMobile, 'LOGIN', `Failed login: ${errorMessage}${stackTrace ? '\nStack: ' + stackTrace.split('\n').slice(0, 3).join(' | ') : ''}`, 'error')
      throw new Error(`Login failed for ${email}: ${errorMessage}`)
    }
  }

  async getMobileAccessToken(page: Page, email: string, totpSecret?: string) {
    // Store TOTP secret for this mobile auth session
    this.currentTotpSecret = (totpSecret && totpSecret.trim()) || undefined
    this.lastTotpSubmit = 0
    this.totpAttempts = 0
    
    // Reuse same FIDO disabling
    await this.disableFido(page)
    const url = new URL(this.authBaseUrl)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', this.clientId)
    url.searchParams.set('redirect_uri', this.redirectUrl)
    url.searchParams.set('scope', this.scope)
    url.searchParams.set('state', crypto.randomBytes(16).toString('hex'))
    url.searchParams.set('access_type', 'offline_access')
    url.searchParams.set('login_hint', email)

    await page.goto(url.href, { waitUntil: 'domcontentloaded' })
    const start = Date.now()
    this.bot.log(this.bot.isMobile, 'LOGIN-APP', 'Authorizing mobile scope...')
    let code = ''
    let lastLogTime = start
    let checkCount = 0
    
    while (Date.now() - start < DEFAULT_TIMEOUTS.oauthMaxMs) {
      checkCount++
      
      // OPTIMIZATION: Check URL first (fastest check)
      const u = new URL(page.url())
      if (u.hostname === 'login.live.com' && u.pathname === '/oauth20_desktop.srf') {
        code = u.searchParams.get('code') || ''
        if (code) break
      }
      
      // OPTIMIZATION: Handle prompts and TOTP in parallel when possible
      if (checkCount % 3 === 0) { // Every 3rd iteration
        await Promise.allSettled([
          this.handlePasskeyPrompts(page, 'oauth'),
          this.tryAutoTotp(page, 'mobile-oauth')
        ])
      }
      
      // Progress log every 30 seconds
      const now = Date.now()
      if (now - lastLogTime > 30000) {
        const elapsed = Math.round((now - start) / 1000)
        this.bot.log(this.bot.isMobile, 'LOGIN-APP', `Still waiting for OAuth code... (${elapsed}s elapsed, URL: ${u.hostname}${u.pathname})`, 'warn')
        lastLogTime = now
      }
      
      // OPTIMIZATION: Adaptive polling - faster initially, slower after
      const pollDelay = Date.now() - start < 30000 ? 800 : 1500
      await this.bot.utils.wait(pollDelay)
    }
    if (!code) {
      const elapsed = Math.round((Date.now() - start) / 1000)
      const currentUrl = page.url()
      this.bot.log(this.bot.isMobile, 'LOGIN-APP', `OAuth code not received after ${elapsed}s (timeout: ${DEFAULT_TIMEOUTS.oauthMaxMs / 1000}s). Current URL: ${currentUrl}`, 'error')
      
      // Save diagnostics for debugging
      await this.saveIncidentArtifacts(page, 'oauth-timeout').catch(() => {})
      
      throw new Error(`OAuth code not received within ${DEFAULT_TIMEOUTS.oauthMaxMs / 1000}s - mobile token acquisition failed. Check diagnostics in reports/`)
    }
    
    this.bot.log(this.bot.isMobile, 'LOGIN-APP', `OAuth code received in ${Math.round((Date.now() - start) / 1000)}s`)

    const form = new URLSearchParams()
    form.append('grant_type', 'authorization_code')
    form.append('client_id', this.clientId)
    form.append('code', code)
    form.append('redirect_uri', this.redirectUrl)

    // Token exchange with retry logic for transient errors (502, 503, network issues)
    const req: AxiosRequestConfig = { 
      url: this.tokenUrl, 
      method: 'POST', 
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, 
      data: form.toString() 
    }
    
    const isRetryable = (e: unknown): boolean => {
      if (!e || typeof e !== 'object') return false
      const err = e as { response?: { status?: number }; code?: string }
      const status = err.response?.status
      // Retry on 502, 503, 504 (gateway errors) and network errors
      return status === 502 || status === 503 || status === 504 || 
             err.code === 'ECONNRESET' || 
             err.code === 'ETIMEDOUT'
    }

    const retry = new Retry(this.bot.config.retryPolicy)
    try {
      const resp = await retry.run(
        () => this.bot.axios.request(req),
        isRetryable
      )
      const data: OAuth = resp.data
      this.bot.log(this.bot.isMobile, 'LOGIN-APP', `Authorized in ${Math.round((Date.now()-start)/1000)}s`)
      // Clear TOTP secret after successful mobile auth
      this.currentTotpSecret = undefined
      return data.access_token
    } catch (error) {
      // Clear TOTP secret on error too
      this.currentTotpSecret = undefined
      const err = error as { response?: { status?: number }; message?: string }
      const statusCode = err.response?.status
      const errMsg = err.message || String(error)
      if (statusCode) {
        this.bot.log(this.bot.isMobile, 'LOGIN-APP', `Token exchange failed with status ${statusCode}: ${errMsg}`, 'error')
      } else {
        this.bot.log(this.bot.isMobile, 'LOGIN-APP', `Token exchange failed (network error): ${errMsg}`, 'error')
      }
      throw error
    }
  }

  // --------------- Main Flow ---------------
  private async tryReuseExistingSession(page: Page): Promise<boolean> {
    const homeUrl = 'https://rewards.bing.com/'
    try {
      await page.goto(homeUrl)
      await page.waitForLoadState('domcontentloaded').catch(()=>{})
      await this.bot.browser.utils.reloadBadPage(page)
      await this.bot.utils.wait(250)

      const portalSelector = await this.waitForRewardsRoot(page, 3500)
      if (portalSelector) {
        // Additional validation: make sure we're not just on the page but actually logged in
        // Check if we're redirected to login
        const currentUrl = page.url()
        if (currentUrl.includes('login.live.com') || currentUrl.includes('login.microsoftonline.com')) {
          this.bot.log(this.bot.isMobile, 'LOGIN', 'Detected redirect to login page - session not valid', 'warn')
          return false
        }
        
        this.bot.log(this.bot.isMobile, 'LOGIN', `Existing session still valid (${portalSelector})`)
        await this.checkAccountLocked(page)
        return true
      }

      if (await this.tryAutoTotp(page, 'session reuse probe')) {
        await this.bot.utils.wait(900)
        const postTotp = await this.waitForRewardsRoot(page, 5000)
        if (postTotp) {
          this.bot.log(this.bot.isMobile, 'LOGIN', `Existing session unlocked via TOTP (${postTotp})`)
          await this.checkAccountLocked(page)
          return true
        }
      }

      const currentUrl = page.url()
      if (currentUrl.includes('login.live.com') || currentUrl.includes('login.microsoftonline.com')) {
        await this.handlePasskeyPrompts(page, 'main')
      }
    } catch {/* ignore reuse errors and continue with full login */}
    return false
  }

  private async performLoginFlow(page: Page, email: string, password: string) {
    await this.inputEmail(page, email)
    await this.bot.utils.wait(1000)
    await this.bot.browser.utils.reloadBadPage(page)
    await this.bot.utils.wait(500)
    await this.tryRecoveryMismatchCheck(page, email)
    if (this.bot.compromisedModeActive && this.bot.compromisedReason === 'recovery-mismatch') {
      this.bot.log(this.bot.isMobile,'LOGIN','Recovery mismatch detected – stopping before password entry','warn')
      return
    }
    // Try switching to password if a locale link is present (FR/EN)
    await this.switchToPasswordLink(page)
    await this.inputPasswordOr2FA(page, password)
    if (this.bot.compromisedModeActive && this.bot.compromisedReason === 'sign-in-blocked') {
      this.bot.log(this.bot.isMobile, 'LOGIN', 'Blocked sign-in detected — halting.', 'warn')
      return
    }
    await this.checkAccountLocked(page)
    await this.awaitRewardsPortal(page)
  }

  // --------------- Input Steps ---------------
  private async inputEmail(page: Page, email: string) {
    // Check for passkey prompts first
    await this.handlePasskeyPrompts(page, 'main')
    await this.bot.utils.wait(250)

    if (await this.tryAutoTotp(page, 'pre-email check')) {
      await this.bot.utils.wait(800)
    }
    
    let field = await page.waitForSelector(SELECTORS.emailInput, { timeout: 5000 }).catch(()=>null)
    if (!field) {
      const totpHandled = await this.tryAutoTotp(page, 'pre-email challenge')
      if (totpHandled) {
        await this.bot.utils.wait(800)
        field = await page.waitForSelector(SELECTORS.emailInput, { timeout: 5000 }).catch(()=>null)
      }
    }

    if (!field) {
      // Try one more time after handling possible passkey prompts
      await this.handlePasskeyPrompts(page, 'main')
      await this.bot.utils.wait(500)
      const totpRetry = await this.tryAutoTotp(page, 'pre-email retry')
      if (totpRetry) {
        await this.bot.utils.wait(800)
      }
      field = await page.waitForSelector(SELECTORS.emailInput, { timeout: 3000 }).catch(()=>null)
      if (!field && this.totpAttempts > 0) {
        await this.bot.utils.wait(2000)
        field = await page.waitForSelector(SELECTORS.emailInput, { timeout: 3000 }).catch(()=>null)
      }
      if (!field) {
        this.bot.log(this.bot.isMobile, 'LOGIN', 'Email field not present', 'warn')
        return
      }
    }
    
    const prefilled = await page.waitForSelector('#userDisplayName', { timeout: 1500 }).catch(()=>null)
    if (!prefilled) {
      await page.fill(SELECTORS.emailInput, '')
      await page.fill(SELECTORS.emailInput, email)
    } else {
      this.bot.log(this.bot.isMobile, 'LOGIN', 'Email prefilled')
    }
    const next = await page.waitForSelector(SELECTORS.submitBtn, { timeout: 2000 }).catch(()=>null)
    if (next) { await next.click().catch(()=>{}); this.bot.log(this.bot.isMobile, 'LOGIN', 'Submitted email') }
  }

  private async inputPasswordOr2FA(page: Page, password: string) {
    // Check for passkey prompts that might be blocking the password field
    await this.handlePasskeyPrompts(page, 'main')
    await this.bot.utils.wait(500)
    
    // Some flows require switching to password first
    const switchBtn = await page.waitForSelector('#idA_PWD_SwitchToPassword', { timeout: 1500 }).catch(()=>null)
    if (switchBtn) { await switchBtn.click().catch(()=>{}); await this.bot.utils.wait(1000) }

    // Early TOTP check - if totpSecret is configured, check for TOTP challenge before password
    if (this.currentTotpSecret) {
      const totpDetected = await this.tryAutoTotp(page, 'pre-password TOTP check')
      if (totpDetected) {
        this.bot.log(this.bot.isMobile, 'LOGIN', 'TOTP challenge appeared before password entry')
        return
      }
    }

    // Rare flow: list of methods -> choose password
    let passwordField = await page.waitForSelector(SELECTORS.passwordInput, { timeout: 4000 }).catch(()=>null)
    if (!passwordField) {
      // Maybe passkey prompt appeared - try handling it again
      await this.handlePasskeyPrompts(page, 'main')
      await this.bot.utils.wait(800)
      passwordField = await page.waitForSelector(SELECTORS.passwordInput, { timeout: 3000 }).catch(()=>null)
    }
    
    if (!passwordField) {
      const blocked = await this.detectSignInBlocked(page)
      if (blocked) return
      // If still no password field -> likely 2FA (approvals) first
      this.bot.log(this.bot.isMobile, 'LOGIN', 'Password field absent — invoking 2FA handler', 'warn')
      await this.handle2FA(page)
      return
    }

    const blocked = await this.detectSignInBlocked(page)
    if (blocked) return

    await page.fill(SELECTORS.passwordInput, '')
    await page.fill(SELECTORS.passwordInput, password)
    const submit = await page.waitForSelector(SELECTORS.submitBtn, { timeout: 2000 }).catch(()=>null)
    if (submit) { await submit.click().catch(()=>{}); this.bot.log(this.bot.isMobile, 'LOGIN', 'Password submitted') }
  }

  // --------------- 2FA Handling ---------------
  private async handle2FA(page: Page) {
    try {
      // Dismiss any popups/dialogs before checking 2FA (Terms Update, etc.)
      await this.bot.browser.utils.tryDismissAllMessages(page)
      await this.bot.utils.wait(500)

  const usedTotp = await this.tryAutoTotp(page, '2FA initial step')
      if (usedTotp) return

  const number = await this.fetchAuthenticatorNumber(page)
      if (number) { await this.approveAuthenticator(page, number); return }
      await this.handleSMSOrTotp(page)
    } catch (e) {
      this.bot.log(this.bot.isMobile, 'LOGIN', '2FA error: ' + e, 'warn')
    }
  }

  private async fetchAuthenticatorNumber(page: Page): Promise<string | null> {
    try {
      const el = await page.waitForSelector('#displaySign, div[data-testid="displaySign"]>span', { timeout: 2500 })
      return (await el.textContent())?.trim() || null
    } catch {
      // Attempt resend loop in parallel mode
      if (this.bot.config.parallel) {
        this.bot.log(this.bot.isMobile, 'LOGIN', 'Parallel mode: throttling authenticator push requests', 'log', 'yellow')
        for (let attempts = 0; attempts < 6; attempts++) { // max 6 minutes retry window
          const resend = await page.waitForSelector('button[aria-describedby="pushNotificationsTitle errorDescription"]', { timeout: 1500 }).catch(()=>null)
          if (!resend) break
          await this.bot.utils.wait(60000)
          await resend.click().catch(()=>{})
        }
      }
      await page.click('button[aria-describedby="confirmSendTitle"]').catch(()=>{})
      await this.bot.utils.wait(1500)
      try {
        const el = await page.waitForSelector('#displaySign, div[data-testid="displaySign"]>span', { timeout: 2000 })
        return (await el.textContent())?.trim() || null
      } catch { return null }
    }
  }

  private async approveAuthenticator(page: Page, numberToPress: string) {
    for (let cycle = 0; cycle < 6; cycle++) { // max ~6 refresh cycles
      try {
        this.bot.log(this.bot.isMobile, 'LOGIN', `Approve login in Authenticator (press ${numberToPress})`)
        await page.waitForSelector('form[name="f1"]', { state: 'detached', timeout: 60000 })
        this.bot.log(this.bot.isMobile, 'LOGIN', 'Authenticator approval successful')
        return
      } catch {
        this.bot.log(this.bot.isMobile, 'LOGIN', 'Authenticator code expired – refreshing')
        const retryBtn = await page.waitForSelector(SELECTORS.passkeyPrimary, { timeout: 3000 }).catch(()=>null)
        if (retryBtn) await retryBtn.click().catch(()=>{})
        const refreshed = await this.fetchAuthenticatorNumber(page)
        if (!refreshed) { this.bot.log(this.bot.isMobile, 'LOGIN', 'Could not refresh authenticator code', 'warn'); return }
        numberToPress = refreshed
      }
    }
    this.bot.log(this.bot.isMobile,'LOGIN','Authenticator approval loop exited (max cycles reached)','warn')
  }

  private async handleSMSOrTotp(page: Page) {
    // TOTP auto entry (second chance if ensureTotpInput needed longer)
    const usedTotp = await this.tryAutoTotp(page, 'manual 2FA entry')
    if (usedTotp) return

    // Manual prompt - simplified without interval checking
    this.bot.log(this.bot.isMobile, 'LOGIN', 'Waiting for user 2FA code (SMS / Email / App fallback)')
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    
    try {
      const code = await new Promise<string>(res => {
        rl.question('Enter 2FA code:\n', ans => {
          rl.close()
          res(ans.trim())
        })
      })

      // Check if input field still exists before trying to fill
      const inputExists = await page.locator('input[name="otc"]').first().isVisible({ timeout: 1000 }).catch(() => false)
      if (!inputExists) {
        this.bot.log(this.bot.isMobile, 'LOGIN', 'Page changed while waiting for code (user progressed manually)', 'warn')
        return
      }

      // Fill code and submit
      await page.fill('input[name="otc"]', code)
      await page.keyboard.press('Enter')
      this.bot.log(this.bot.isMobile, 'LOGIN', '2FA code submitted')
    } finally {
      try { rl.close() } catch {/* ignore */}
    }
  }

  private async ensureTotpInput(page: Page): Promise<string | null> {
  const selector = await this.findFirstTotpInput(page)
    if (selector) return selector

    const attempts = 4
    for (let i = 0; i < attempts; i++) {
      let acted = false

      // Step 1: expose alternative verification options if hidden
      if (!acted) {
        acted = await this.clickFirstVisibleSelector(page, this.totpAltOptionSelectors())
        if (acted) await this.bot.utils.wait(900)
      }

      // Step 2: choose authenticator code option if available
      if (!acted) {
        acted = await this.clickFirstVisibleSelector(page, this.totpChallengeSelectors())
        if (acted) await this.bot.utils.wait(900)
      }

      const ready = await this.findFirstTotpInput(page)
      if (ready) return ready

      if (!acted) break
    }

    return null
  }

  private async submitTotpCode(page: Page, selector: string) {
    try {
      const code = generateTOTP(this.currentTotpSecret!.trim())
      const input = page.locator(selector).first()
      if (!await input.isVisible().catch(()=>false)) {
        this.bot.log(this.bot.isMobile, 'LOGIN', 'TOTP input unexpectedly hidden', 'warn')
        return
      }
      await input.fill('')
      await input.fill(code)
      // Use unified selector system
      const submit = await this.findFirstVisibleLocator(page, Login.TOTP_SELECTORS.submit)
      if (submit) {
        await submit.click().catch(()=>{})
      } else {
        await page.keyboard.press('Enter').catch(()=>{})
      }
      this.bot.log(this.bot.isMobile, 'LOGIN', 'Submitted TOTP automatically')
    } catch (error) {
      this.bot.log(this.bot.isMobile, 'LOGIN', 'Failed to submit TOTP automatically: ' + error, 'warn')
    }
  }

  // Unified selector system - DRY principle
  private static readonly TOTP_SELECTORS = {
    input: [
      'input[name="otc"]',
      '#idTxtBx_SAOTCC_OTC',
      '#idTxtBx_SAOTCS_OTC',
      'input[data-testid="otcInput"]',
      'input[autocomplete="one-time-code"]',
      'input[type="tel"][name="otc"]',
      'input[id^="floatingLabelInput"]'
    ],
    altOptions: [
      '#idA_SAOTCS_ProofPickerChange',
      '#idA_SAOTCC_AlternateLogin',
      'a:has-text("Use a different verification option")',
      'a:has-text("Sign in another way")',
      'a:has-text("I can\'t use my Microsoft Authenticator app right now")',
      'button:has-text("Use a different verification option")',
      'button:has-text("Sign in another way")'
    ],
    challenge: [
      '[data-value="PhoneAppOTP"]',
      '[data-value="OneTimeCode"]',
      'button:has-text("Use a verification code")',
      'button:has-text("Enter code manually")',
      'button:has-text("Enter a code from your authenticator app")',
      'button:has-text("Use code from your authentication app")',
      'button:has-text("Utiliser un code de vérification")',
      'button:has-text("Utiliser un code de verification")',
      'button:has-text("Entrer un code depuis votre application")',
      'button:has-text("Entrez un code depuis votre application")',
      'button:has-text("Entrez un code")',
      'div[role="button"]:has-text("Use a verification code")',
      'div[role="button"]:has-text("Enter a code")'
    ],
    submit: [
      '#idSubmit_SAOTCC_Continue',
      '#idSubmit_SAOTCC_OTC',
      'button[type="submit"]:has-text("Verify")',
      'button[type="submit"]:has-text("Continuer")',
      'button:has-text("Verify")',
      'button:has-text("Continuer")',
      'button:has-text("Submit")',
      'button[type="submit"]:has-text("Next")',
      'button:has-text("Next")',
      'button[data-testid="primaryButton"]:has-text("Next")'
    ]
  } as const

  private totpInputSelectors(): readonly string[] { return Login.TOTP_SELECTORS.input }
  private totpAltOptionSelectors(): readonly string[] { return Login.TOTP_SELECTORS.altOptions }
  private totpChallengeSelectors(): readonly string[] { return Login.TOTP_SELECTORS.challenge }

  // Locate the most likely authenticator input on the page using heuristics
  private async findFirstTotpInput(page: Page): Promise<string | null> {
    const headingHint = await this.detectTotpHeading(page)
    for (const sel of this.totpInputSelectors()) {
      const loc = page.locator(sel).first()
      if (await loc.isVisible().catch(() => false)) {
        if (await this.isLikelyTotpInput(page, loc, sel, headingHint)) {
          if (sel.includes('floatingLabelInput')) {
            const idAttr = await loc.getAttribute('id')
            if (idAttr) return `#${idAttr}`
          }
          return sel
        }
      }
    }
    return null
  }

  private async isLikelyTotpInput(page: Page, locator: Locator, selector: string, headingHint: string | null): Promise<boolean> {
    try {
      if (!await locator.isVisible().catch(() => false)) return false

      const attr = async (name: string) => (await locator.getAttribute(name) || '').toLowerCase()
      const type = await attr('type')
      
      // Explicit exclusions: never treat email or password fields as TOTP
      if (type === 'email' || type === 'password') return false

      const nameAttr = await attr('name')
      // Explicit exclusions: login/email/password field names
      if (nameAttr.includes('loginfmt') || nameAttr.includes('passwd') || nameAttr.includes('email') || nameAttr.includes('login')) return false
      
      // Strong positive signals for TOTP
      if (nameAttr.includes('otc') || nameAttr.includes('otp') || nameAttr.includes('code')) return true

      const autocomplete = await attr('autocomplete')
      if (autocomplete.includes('one-time')) return true

      const inputmode = await attr('inputmode')
      if (inputmode === 'numeric') return true

      const pattern = await locator.getAttribute('pattern') || ''
      if (pattern && /\d/.test(pattern)) return true

      const aria = await attr('aria-label')
      if (aria.includes('code') || aria.includes('otp') || aria.includes('authenticator')) return true

      const placeholder = await attr('placeholder')
      if (placeholder.includes('code') || placeholder.includes('security') || placeholder.includes('authenticator')) return true

      if (/otc|otp/.test(selector)) return true

      const idAttr = await attr('id')
      if (idAttr.startsWith('floatinglabelinput')) {
        if (headingHint || await this.detectTotpHeading(page)) return true
      }
      if (selector.toLowerCase().includes('floatinglabelinput')) {
        if (headingHint || await this.detectTotpHeading(page)) return true
      }

      const maxLength = await locator.getAttribute('maxlength')
      if (maxLength && Number(maxLength) > 0 && Number(maxLength) <= 8) return true

      const dataTestId = await attr('data-testid')
      if (dataTestId.includes('otc') || dataTestId.includes('otp')) return true

      const labelText = await locator.evaluate(node => {
        const label = node.closest('label')
        if (label && label.textContent) return label.textContent
        const describedBy = node.getAttribute('aria-describedby')
        if (!describedBy) return ''
        const parts = describedBy.split(/\s+/).filter(Boolean)
        const texts: string[] = []
        parts.forEach(id => {
          const el = document.getElementById(id)
          if (el && el.textContent) texts.push(el.textContent)
        })
        return texts.join(' ')
      }).catch(()=>'')

      if (labelText && /code|otp|authenticator|sécurité|securité|security/i.test(labelText)) return true
      if (headingHint && /code|otp|authenticator/i.test(headingHint.toLowerCase())) return true
    } catch {/* fall through to false */}

    return false
  }

  private async detectTotpHeading(page: Page): Promise<string | null> {
    const headings = page.locator('[data-testid="title"], h1, h2, div[role="heading"]')
    const count = await headings.count().catch(()=>0)
    const max = Math.min(count, 6)
    for (let i = 0; i < max; i++) {
      const text = (await headings.nth(i).textContent().catch(()=>null))?.trim()
      if (!text) continue
      const lowered = text.toLowerCase()
      if (/authenticator/.test(lowered) && /code/.test(lowered)) return text
      if (/code de vérification|code de verification|code de sécurité|code de securité/.test(lowered)) return text
      if (/enter your security code|enter your code/.test(lowered)) return text
    }
    return null
  }

  private async clickFirstVisibleSelector(page: Page, selectors: readonly string[]): Promise<boolean> {
    for (const sel of selectors) {
      const loc = page.locator(sel).first()
      if (await loc.isVisible().catch(() => false)) {
        await loc.click().catch(()=>{})
        return true
      }
    }
    return false
  }

  private async findFirstVisibleLocator(page: Page, selectors: readonly string[]): Promise<Locator | null> {
    for (const sel of selectors) {
      const loc = page.locator(sel).first()
      if (await loc.isVisible().catch(() => false)) return loc
    }
    return null
  }

  private async waitForRewardsRoot(page: Page, timeoutMs: number): Promise<string | null> {
    const selectors = [
      'html[data-role-name="RewardsPortal"]',
      'html[data-role-name*="RewardsPortal"]',
      'body[data-role-name*="RewardsPortal"]',
      '[data-role-name*="RewardsPortal"]',
      '[data-bi-name="rewards-dashboard"]',
      'main[data-bi-name="dashboard"]',
      '#more-activities',
      '#dashboard',
      '[class*="rewards"]',
      '[id*="rewards-dashboard"]',
      'main.dashboard-container',
      '.dashboard-content',
      '[data-bi-area="rewards"]',
      '.rewards-container',
      '#rewards-app',
      '[role="main"]'
    ]

    const start = Date.now()
    let lastLogTime = start
    let checkCount = 0
    
    while (Date.now() - start < timeoutMs) {
      checkCount++
      
      // OPTIMIZATION: Fast URL check first (no DOM query needed)
      const url = page.url()
      const isRewardsDomain = url.includes('rewards.bing.com') || url.includes('rewards.microsoft.com')
      
      if (isRewardsDomain) {
        // OPTIMIZATION: Parallel checks for authenticated state
        const [hasContent, notLoggedIn, hasAuthIndicators] = await Promise.all([
          page.evaluate(() => document.body && document.body.innerText.length > 100).catch(() => false),
          page.evaluate(() => {
            const signInSelectors = ['a[href*="signin"]', 'button:has-text("Sign in")', '[data-bi-id*="signin"]']
            for (const sel of signInSelectors) {
              try {
                const elements = document.querySelectorAll(sel)
                for (const el of elements) {
                  const text = el.textContent?.toLowerCase() || ''
                  if (text.includes('sign in') && (el as HTMLElement).offsetParent !== null) {
                    return true
                  }
                }
              } catch {/* ignore */}
            }
            return false
          }).catch(() => false),
          page.evaluate(() => {
            const authSelectors = ['#id_n', '[id*="point"]', '[class*="userProfile"]', '#more-activities']
            for (const sel of authSelectors) {
              try {
                const el = document.querySelector(sel)
                if (el && (el as HTMLElement).offsetParent !== null) return true
              } catch {/* ignore */}
            }
            return false
          }).catch(() => false)
        ])
        
        if (hasContent && !notLoggedIn && hasAuthIndicators) {
          this.bot.log(this.bot.isMobile, 'LOGIN', 'Rewards page detected (authenticated)')
          return 'rewards-url-authenticated'
        }
        
        if (hasContent && notLoggedIn) {
          this.bot.log(this.bot.isMobile, 'LOGIN', 'On rewards page but not authenticated yet', 'warn')
        }
      }
      
      // OPTIMIZATION: Check selectors in batches for speed
      if (checkCount % 2 === 0) { // Every other iteration
        for (const sel of selectors) {
          const loc = page.locator(sel).first()
          if (await loc.isVisible().catch(()=>false)) {
            return sel
          }
        }
      }
      
      // Progress logging
      const now = Date.now()
      if (now - lastLogTime > 5000) {
        const elapsed = Math.round((now - start) / 1000)
        this.bot.log(this.bot.isMobile, 'LOGIN', `Still waiting for portal... (${elapsed}s, URL: ${url})`, 'warn')
        lastLogTime = now
      }
      
      // OPTIMIZATION: Adaptive polling
      const pollDelay = Date.now() - start < 5000 ? DEFAULT_TIMEOUTS.elementCheck : DEFAULT_TIMEOUTS.short
      await this.bot.utils.wait(pollDelay)
    }
    return null
  }

  // --------------- Verification / State ---------------
  private async awaitRewardsPortal(page: Page) {
    const start = Date.now()
    let lastUrl = ''
    let checkCount = 0
    
    while (Date.now() - start < DEFAULT_TIMEOUTS.loginMaxMs) {
      checkCount++
      
      const currentUrl = page.url()
      if (currentUrl !== lastUrl) {
        this.bot.log(this.bot.isMobile, 'LOGIN', `Navigation: ${currentUrl}`)
        lastUrl = currentUrl
      }
      
      // OPTIMIZATION: Quick URL check first
      const u = new URL(currentUrl)
      const isRewardsHost = u.hostname === LOGIN_TARGET.host
      const isKnownPath = u.pathname === LOGIN_TARGET.path
        || u.pathname === '/dashboard'
        || u.pathname === '/rewardsapp/dashboard'
        || u.pathname.startsWith('/?')
      if (isRewardsHost && isKnownPath) break
      
      // OPTIMIZATION: Handle prompts only every 3rd check
      if (checkCount % 3 === 0) {
        await Promise.allSettled([
          this.handlePasskeyPrompts(page, 'main'),
          this.tryAutoTotp(page, 'post-password wait')
        ])
      } else {
        await this.handlePasskeyPrompts(page, 'main')
      }
      
      // OPTIMIZATION: Adaptive wait
      const waitTime = Date.now() - start < 10000 ? DEFAULT_TIMEOUTS.fastPoll : 1000
      await this.bot.utils.wait(waitTime)
    }

    this.bot.log(this.bot.isMobile, 'LOGIN', 'Checking for portal elements...')
    const portalSelector = await this.waitForRewardsRoot(page, DEFAULT_TIMEOUTS.portalWaitMs)
    
    if (!portalSelector) {
      this.bot.log(this.bot.isMobile, 'LOGIN', 'Portal not found, trying goHome() fallback...', 'warn')
      
      try {
        await this.bot.browser.func.goHome(page)
        await this.bot.utils.wait(1500) // Reduced from 2000ms
      } catch (e) {
        this.bot.log(this.bot.isMobile, 'LOGIN', `goHome() failed: ${e instanceof Error ? e.message : String(e)}`, 'warn')
      }

      this.bot.log(this.bot.isMobile, 'LOGIN', 'Retry: checking for portal elements...')
      const fallbackSelector = await this.waitForRewardsRoot(page, DEFAULT_TIMEOUTS.portalWaitMs)
      
      if (!fallbackSelector) {
        const currentUrl = page.url()
        this.bot.log(this.bot.isMobile, 'LOGIN', `Current URL: ${currentUrl}`, 'error')
        
        // OPTIMIZATION: Get page info in one evaluation
        const pageContent = await page.evaluate(() => {
          return {
            title: document.title,
            bodyLength: document.body?.innerText?.length || 0,
            hasRewardsText: document.body?.innerText?.toLowerCase().includes('rewards') || false,
            visibleElements: document.querySelectorAll('*[data-role-name], *[data-bi-name], main, #dashboard').length
          }
        }).catch(() => ({ title: 'unknown', bodyLength: 0, hasRewardsText: false, visibleElements: 0 }))
        
        this.bot.log(this.bot.isMobile, 'LOGIN', `Page info: ${JSON.stringify(pageContent)}`, 'error')
        
        await this.bot.browser.utils.captureDiagnostics(page, 'login-portal-missing').catch(()=>{})
        this.bot.log(this.bot.isMobile, 'LOGIN', 'Portal element missing (diagnostics saved)', 'error')
        throw new Error(`Rewards portal not detected. URL: ${currentUrl}. Check reports/ folder`)
      }
      this.bot.log(this.bot.isMobile, 'LOGIN', `Portal found via fallback (${fallbackSelector})`)
      return
    }

    this.bot.log(this.bot.isMobile, 'LOGIN', `Portal found (${portalSelector})`)
  }

  private async tryAutoTotp(page: Page, context: string): Promise<boolean> {
    if (!this.currentTotpSecret) return false
    const throttleMs = 5000
    if (Date.now() - this.lastTotpSubmit < throttleMs) return false

    const selector = await this.ensureTotpInput(page)
    if (!selector) return false

    if (this.totpAttempts >= 3) {
      const errMsg = 'TOTP challenge still present after multiple attempts; verify authenticator secret or approvals.'
      this.bot.log(this.bot.isMobile, 'LOGIN', errMsg, 'error')
      throw new Error(errMsg)
    }

    this.bot.log(this.bot.isMobile, 'LOGIN', `Detected TOTP challenge during ${context}; submitting code automatically`)
    await this.submitTotpCode(page, selector)
    this.totpAttempts += 1
    this.lastTotpSubmit = Date.now()
    await this.bot.utils.wait(1200)
    return true
  }

  private async verifyBingContext(page: Page) {
    try {
      this.bot.log(this.bot.isMobile, 'LOGIN-BING', 'Verifying Bing auth context')
      await page.goto('https://www.bing.com/fd/auth/signin?action=interactive&provider=windows_live_id&return_url=https%3A%2F%2Fwww.bing.com%2F')
      for (let i=0;i<5;i++) {
        const u = new URL(page.url())
        if (u.hostname === 'www.bing.com' && u.pathname === '/') {
          await this.bot.browser.utils.tryDismissAllMessages(page)
          const ok = await page.waitForSelector('#id_n', { timeout: 3000 }).then(()=>true).catch(()=>false)
          if (ok || this.bot.isMobile) { this.bot.log(this.bot.isMobile,'LOGIN-BING','Bing verification passed'); break }
        }
        await this.bot.utils.wait(1000)
      }
    } catch (e) {
      this.bot.log(this.bot.isMobile, 'LOGIN-BING', 'Bing verification error: '+e, 'warn')
    }
  }

  private async checkAccountLocked(page: Page) {
    const locked = await page.waitForSelector('#serviceAbuseLandingTitle', { timeout: 1200 }).then(()=>true).catch(()=>false)
    if (locked) {
      this.bot.log(this.bot.isMobile,'CHECK-LOCKED','Account locked by Microsoft (serviceAbuseLandingTitle)','error')
      throw new Error('Account locked by Microsoft - please review account status')
    }
  }

  // --------------- Passkey / Dialog Handling ---------------
  private async handlePasskeyPrompts(page: Page, context: 'main' | 'oauth') {
    let did = false
    
    // Priority 1: Direct detection of "Skip for now" button by data-testid
    const skipBtn = await page.waitForSelector('button[data-testid="secondaryButton"]', { timeout: 500 }).catch(()=>null)
    if (skipBtn) {
      const text = (await skipBtn.textContent() || '').trim()
      // Check if it's actually a skip button (could be other secondary buttons)
      if (/skip|later|not now|non merci|pas maintenant/i.test(text)) {
        await skipBtn.click().catch(()=>{})
        did = true
        this.logPasskeyOnce('data-testid secondaryButton')
      }
    }
    
    // Priority 2: Video heuristic (biometric prompt)
    if (!did) {
      const biometric = await page.waitForSelector(SELECTORS.biometricVideo, { timeout: 500 }).catch(()=>null)
      if (biometric) {
        const btn = await page.$(SELECTORS.passkeySecondary)
        if (btn) { await btn.click().catch(()=>{}); did = true; this.logPasskeyOnce('video heuristic') }
      }
    }
    
    // Priority 3: Title + secondary button detection
    if (!did) {
      const titleEl = await page.waitForSelector(SELECTORS.passkeyTitle, { timeout: 500 }).catch(()=>null)
      const secBtn = await page.waitForSelector(SELECTORS.passkeySecondary, { timeout: 500 }).catch(()=>null)
      const primBtn = await page.waitForSelector(SELECTORS.passkeyPrimary, { timeout: 500 }).catch(()=>null)
      const title = (titleEl ? (await titleEl.textContent()) : '')?.trim() || ''
      const looksLike = /sign in faster|passkey|fingerprint|face|pin|empreinte|visage|windows hello|hello/i.test(title)
      if (looksLike && secBtn) { await secBtn.click().catch(()=>{}); did = true; this.logPasskeyOnce('title heuristic '+title) }
      else if (!did && secBtn && primBtn) {
        const text = (await secBtn.textContent()||'').trim()
        if (/skip for now|not now|later|passer|plus tard/i.test(text)) { 
          await secBtn.click().catch(()=>{}); did = true; this.logPasskeyOnce('secondary button text') 
        }
      }
    }
    
    // Priority 4: XPath fallback (includes Windows Hello specific patterns)
    if (!did) {
      const textBtn = await page.locator('xpath=//button[contains(normalize-space(.),"Skip for now") or contains(normalize-space(.),"Not now") or contains(normalize-space(.),"Passer") or contains(normalize-space(.),"No thanks")]').first()
      if (await textBtn.isVisible().catch(()=>false)) { await textBtn.click().catch(()=>{}); did = true; this.logPasskeyOnce('xpath fallback') }
    }
    
    // Priority 4.5: Windows Hello specific detection
    if (!did) {
      const windowsHelloTitle = await page.locator('text=/windows hello/i').first().isVisible().catch(() => false)
      if (windowsHelloTitle) {
        // Try common Windows Hello skip patterns
        const skipPatterns = [
          'button:has-text("Skip")',
          'button:has-text("No thanks")',
          'button:has-text("Maybe later")',
          'button:has-text("Cancel")',
          '[data-testid="secondaryButton"]',
          'button[class*="secondary"]'
        ]
        for (const pattern of skipPatterns) {
          const btn = await page.locator(pattern).first()
          if (await btn.isVisible().catch(() => false)) {
            await btn.click().catch(() => {})
            did = true
            this.logPasskeyOnce('Windows Hello skip')
            break
          }
        }
      }
    }
    
    // Priority 5: Close button fallback
    if (!did) {
      const close = await page.$('#close-button')
      if (close) { await close.click().catch(()=>{}); did = true; this.logPasskeyOnce('close button') }
    }

    // KMSI prompt
    const kmsi = await page.waitForSelector(SELECTORS.kmsiVideo, { timeout: 400 }).catch(()=>null)
    if (kmsi) {
      const yes = await page.$(SELECTORS.passkeyPrimary)
      if (yes) { await yes.click().catch(()=>{}); did = true; this.bot.log(this.bot.isMobile,'LOGIN-KMSI','Accepted KMSI prompt') }
    }

    if (!did && context === 'main') {
      this.noPromptIterations++
      const now = Date.now()
      if (this.noPromptIterations === 1 || now - this.lastNoPromptLog > 10000) {
        this.lastNoPromptLog = now
        this.bot.log(this.bot.isMobile,'LOGIN-NO-PROMPT',`No dialogs (x${this.noPromptIterations})`)
        if (this.noPromptIterations > 50) this.noPromptIterations = 0
      }
    } else if (did) {
      this.noPromptIterations = 0
    }
  }

  private logPasskeyOnce(reason: string) {
    if (this.passkeyHandled) return
    this.passkeyHandled = true
    this.bot.log(this.bot.isMobile,'LOGIN-PASSKEY',`Dismissed passkey prompt (${reason})`)
  }

  // --------------- Security Detection ---------------
  private async detectSignInBlocked(page: Page): Promise<boolean> {
    if (this.bot.compromisedModeActive && this.bot.compromisedReason === 'sign-in-blocked') return true
    try {
      let text = ''
      for (const sel of ['[data-testid="title"]','h1','div[role="heading"]','div.text-title']) {
        const el = await page.waitForSelector(sel, { timeout: 600 }).catch(()=>null)
        if (el) {
          const t = (await el.textContent()||'').trim()
          if (t && t.length < 300) text += ' '+t
        }
      }
      const lower = text.toLowerCase()
      let matched: string | null = null
      for (const p of SIGN_IN_BLOCK_PATTERNS) { if (p.re.test(lower)) { matched = p.label; break } }
      if (!matched) return false
      const email = this.bot.currentAccountEmail || 'unknown'
      const docsUrl = this.getDocsUrl('we-cant-sign-you-in')
      const incident: SecurityIncident = {
        kind: 'We can\'t sign you in (blocked)',
        account: email,
        details: [matched ? `Pattern: ${matched}` : 'Pattern: unknown'],
        next: ['Manual recovery required before continuing'],
        docsUrl
      }
      await this.sendIncidentAlert(incident,'warn')
      this.bot.compromisedModeActive = true
      this.bot.compromisedReason = 'sign-in-blocked'
      this.startCompromisedInterval()
      await this.bot.engageGlobalStandby('sign-in-blocked', email).catch(()=>{})
      await this.saveIncidentArtifacts(page,'sign-in-blocked').catch(()=>{})
      // Open security docs for immediate guidance (best-effort)
      await this.openDocsTab(page, docsUrl).catch(()=>{})
      return true
    } catch { return false }
  }

  private async tryRecoveryMismatchCheck(page: Page, email: string) { try { await this.detectAndHandleRecoveryMismatch(page, email) } catch {/* ignore */} }
  private async detectAndHandleRecoveryMismatch(page: Page, email: string) {
    try {
      const recoveryEmail: string | undefined = this.bot.currentAccountRecoveryEmail
      if (!recoveryEmail || !/@/.test(recoveryEmail)) return
      const accountEmail = email
      const parseRef = (val: string) => { const [l,d] = val.split('@'); return { local: l||'', domain:(d||'').toLowerCase(), prefix2:(l||'').slice(0,2).toLowerCase() } }
      const refs = [parseRef(recoveryEmail), parseRef(accountEmail)].filter(r=>r.domain && r.prefix2)
      if (refs.length === 0) return

      const candidates: string[] = []
      // Direct selectors (Microsoft variants + French spans)
      const sel = '[data-testid="recoveryEmailHint"], #recoveryEmail, [id*="ProofEmail"], [id*="EmailProof"], [data-testid*="Email"], span:has(span.fui-Text)'
      const el = await page.waitForSelector(sel, { timeout: 1500 }).catch(()=>null)
      if (el) { const t = (await el.textContent()||'').trim(); if (t) candidates.push(t) }

      // List items
      const li = page.locator('[role="listitem"], li')
      const liCount = await li.count().catch(()=>0)
      for (let i=0;i<liCount && i<12;i++) { const t = (await li.nth(i).textContent().catch(()=>''))?.trim()||''; if (t && /@/.test(t)) candidates.push(t) }

      // XPath generic masked patterns
      const xp = page.locator('xpath=//*[contains(normalize-space(.), "@") and (contains(normalize-space(.), "*") or contains(normalize-space(.), "•"))]')
      const xpCount = await xp.count().catch(()=>0)
      for (let i=0;i<xpCount && i<12;i++) { const t = (await xp.nth(i).textContent().catch(()=>''))?.trim()||''; if (t && t.length<300) candidates.push(t) }

      // Normalize
      const seen = new Set<string>()
      const norm = (s:string)=>s.replace(/\s+/g,' ').trim()
  const uniq = candidates.map(norm).filter(t=>t && !seen.has(t) && seen.add(t))
      // Masked filter
      let masked = uniq.filter(t=>/@/.test(t) && /[*•]/.test(t))

      if (masked.length === 0) {
        // Fallback full HTML scan
        try {
          const html = await page.content()
          const generic = /[A-Za-z0-9]{1,4}[*•]{2,}[A-Za-z0-9*•._-]*@[A-Za-z0-9.-]+/g
          const frPhrase = /Nous\s+enverrons\s+un\s+code\s+à\s+([^<@]*[A-Za-z0-9]{1,4}[*•]{2,}[A-Za-z0-9*•._-]*@[A-Za-z0-9.-]+)[^.]{0,120}?Pour\s+vérifier/gi
          const found = new Set<string>()
          let m: RegExpExecArray | null
          while ((m = generic.exec(html)) !== null) found.add(m[0])
          while ((m = frPhrase.exec(html)) !== null) { const raw = m[1]?.replace(/<[^>]+>/g,'').trim(); if (raw) found.add(raw) }
          if (found.size > 0) masked = Array.from(found)
        } catch {/* ignore */}
      }
      if (masked.length === 0) return

      // Prefer one mentioning email/adresse
      const preferred = masked.find(t=>/email|courriel|adresse|mail/i.test(t)) || masked[0]!
      // Extract the masked email: Microsoft sometimes shows only first 1 char (k*****@domain) or 2 chars (ko*****@domain).
      // We ONLY compare (1 or 2) leading visible alphanumeric chars + full domain (case-insensitive).
      // This avoids false positives when the displayed mask hides the 2nd char.
      const maskRegex = /([a-zA-Z0-9]{1,2})[a-zA-Z0-9*•._-]*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
      const m = maskRegex.exec(preferred)
      // Fallback: try to salvage with looser pattern if first regex fails
      const loose = !m ? /([a-zA-Z0-9])[*•][a-zA-Z0-9*•._-]*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/.exec(preferred) : null
      const use = m || loose
      const extracted = use ? use[0] : preferred
      const extractedLower = extracted.toLowerCase()
  let observedPrefix = ((use && use[1]) ? use[1] : '').toLowerCase()
  let observedDomain = ((use && use[2]) ? use[2] : '').toLowerCase()
      if (!observedDomain && extractedLower.includes('@')) {
        const parts = extractedLower.split('@')
        observedDomain = parts[1] || ''
      }
      if (!observedPrefix && extractedLower.includes('@')) {
        const parts = extractedLower.split('@')
        observedPrefix = (parts[0] || '').replace(/[^a-z0-9]/gi,'').slice(0,2)
      }

      // Determine if any reference (recoveryEmail or accountEmail) matches observed mask logic
      const matchRef = refs.find(r => {
        if (r.domain !== observedDomain) return false
        // If only one char visible, only enforce first char; if two, enforce both.
        if (observedPrefix.length === 1) {
          return r.prefix2.startsWith(observedPrefix)
        }
        return r.prefix2 === observedPrefix
      })

      if (!matchRef) {
        const docsUrl = this.getDocsUrl('recovery-email-mismatch')
        const incident: SecurityIncident = {
          kind:'Recovery email mismatch',
          account: email,
          details:[
            `MaskedShown: ${preferred}`,
            `Extracted: ${extracted}`,
            `Observed => ${observedPrefix || '??'}**@${observedDomain || '??'}`,
            `Expected => ${refs.map(r=>`${r.prefix2}**@${r.domain}`).join(' OR ')}`
          ],
          next:[
            'Automation halted globally (standby engaged).',
            'Verify account security & recovery email in Microsoft settings.',
            'Update accounts.json if the change was legitimate before restart.'
          ],
          docsUrl
        }
        await this.sendIncidentAlert(incident,'critical')
        this.bot.compromisedModeActive = true
        this.bot.compromisedReason = 'recovery-mismatch'
        this.startCompromisedInterval()
        await this.bot.engageGlobalStandby('recovery-mismatch', email).catch(()=>{})
        await this.saveIncidentArtifacts(page,'recovery-mismatch').catch(()=>{})
        await this.openDocsTab(page, docsUrl).catch(()=>{})
      } else {
        const mode = observedPrefix.length === 1 ? 'lenient' : 'strict'
        this.bot.log(this.bot.isMobile,'LOGIN-RECOVERY',`Recovery OK (${mode}): ${extracted} matches ${matchRef.prefix2}**@${matchRef.domain}`)
      }
    } catch {/* non-fatal */}
  }

  private async switchToPasswordLink(page: Page) {
    try {
      const link = await page.locator('xpath=//span[@role="button" and (contains(translate(normalize-space(.),"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz"),"use your password") or contains(translate(normalize-space(.),"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz"),"utilisez votre mot de passe"))]').first()
      if (await link.isVisible().catch(()=>false)) {
        await link.click().catch(()=>{})
        await this.bot.utils.wait(800)
        this.bot.log(this.bot.isMobile,'LOGIN','Clicked "Use your password" link')
      }
    } catch {/* ignore */}
  }

  // --------------- Incident Helpers ---------------
  private async sendIncidentAlert(incident: SecurityIncident, severity: 'warn'|'critical'='warn') {
    const lines = [ `[Incident] ${incident.kind}`, `Account: ${incident.account}` ]
    if (incident.details?.length) lines.push(`Details: ${incident.details.join(' | ')}`)
    if (incident.next?.length) lines.push(`Next: ${incident.next.join(' -> ')}`)
    if (incident.docsUrl) lines.push(`Docs: ${incident.docsUrl}`)
    const level: 'warn'|'error' = severity === 'critical' ? 'error' : 'warn'
    this.bot.log(this.bot.isMobile,'SECURITY',lines.join(' | '), level)
    try {
      const { ConclusionWebhook } = await import('../util/ConclusionWebhook')
      const fields = [
        { name: 'Account', value: incident.account },
        ...(incident.details?.length ? [{ name: 'Details', value: incident.details.join('\n') }] : []),
        ...(incident.next?.length ? [{ name: 'Next steps', value: incident.next.join('\n') }] : []),
        ...(incident.docsUrl ? [{ name: 'Docs', value: incident.docsUrl }] : [])
      ]
      await ConclusionWebhook(
        this.bot.config,
        `🔐 ${incident.kind}`,
        '_Security check by @Light_',
        fields,
        severity === 'critical' ? 0xFF0000 : 0xFFAA00
      )
    } catch {/* ignore */}
  }

  private getDocsUrl(anchor?: string) {
    const base = process.env.DOCS_BASE?.trim() || 'https://github.com/LightZirconite/Microsoft-Rewards-Script-Private/blob/v2/docs/security.md'
    const map: Record<string,string> = {
      'recovery-email-mismatch':'#recovery-email-mismatch',
      'we-cant-sign-you-in':'#we-cant-sign-you-in-blocked'
    }
    return anchor && map[anchor] ? `${base}${map[anchor]}` : base
  }

  private startCompromisedInterval() {
    if (this.compromisedInterval) clearInterval(this.compromisedInterval)
    this.compromisedInterval = setInterval(()=>{
      try { this.bot.log(this.bot.isMobile,'SECURITY','Account in security standby. Review before proceeding. Security check by @Light','warn') } catch {/* ignore */}
    }, 5*60*1000)
  }

  private cleanupCompromisedInterval() {
    if (this.compromisedInterval) {
      clearInterval(this.compromisedInterval)
      this.compromisedInterval = undefined
    }
  }

  private async saveIncidentArtifacts(page: Page, slug: string) {
    await captureDiagnostics(this.bot, page, slug, { scope: 'security', skipSlot: true, force: true })
  }

  private async openDocsTab(page: Page, url: string) {
    try {
      const ctx = page.context()
      const tab = await ctx.newPage()
      await tab.goto(url, { waitUntil: 'domcontentloaded' })
    } catch {/* ignore */}
  }

  // --------------- Infrastructure ---------------
  private async disableFido(page: Page) {
    await page.route('**/GetCredentialType.srf*', route => {
      try {
        const body = JSON.parse(route.request().postData() || '{}')
        body.isFidoSupported = false
        route.continue({ postData: JSON.stringify(body) })
      } catch { route.continue() }
    }).catch(()=>{})
  }
}
