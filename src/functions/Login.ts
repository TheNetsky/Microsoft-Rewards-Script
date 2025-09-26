// Clean refactored Login implementation
// Public API preserved: login(), getMobileAccessToken()

import type { Page } from 'playwright'
import * as crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { AxiosRequestConfig } from 'axios'
import { generateTOTP } from '../util/Totp'
import { saveSessionData } from '../util/Load'
import { MicrosoftRewardsBot } from '../index'
import { OAuth } from '../interface/OAuth'

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
  loginMaxMs: Number(process.env.LOGIN_MAX_WAIT_MS || 180000), // 3 min
  short: 500,
  medium: 1500,
  long: 3000
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

  constructor(bot: MicrosoftRewardsBot) { this.bot = bot }

  // --------------- Public API ---------------
  async login(page: Page, email: string, password: string, totpSecret?: string) {
    try {
      this.bot.log(this.bot.isMobile, 'LOGIN', 'Starting login process')
      this.currentTotpSecret = (totpSecret && totpSecret.trim()) || undefined

      await page.goto('https://rewards.bing.com/signin')
      await this.disableFido(page)
      await page.waitForLoadState('domcontentloaded').catch(()=>{})
      await this.bot.browser.utils.reloadBadPage(page)
      await this.checkAccountLocked(page)

      const already = await page.waitForSelector('html[data-role-name="RewardsPortal"]', { timeout: 8000 }).then(()=>true).catch(()=>false)
      if (!already) {
        await this.performLoginFlow(page, email, password)
      } else {
        this.bot.log(this.bot.isMobile, 'LOGIN', 'Session already authenticated')
        await this.checkAccountLocked(page)
      }

      await this.verifyBingContext(page)
      await saveSessionData(this.bot.config.sessionPath, page.context(), email, this.bot.isMobile)
      this.bot.log(this.bot.isMobile, 'LOGIN', 'Login complete (session saved)')
      this.currentTotpSecret = undefined
    } catch (e) {
      throw this.bot.log(this.bot.isMobile, 'LOGIN', 'Failed login: ' + e, 'error')
    }
  }

  async getMobileAccessToken(page: Page, email: string) {
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

    await page.goto(url.href)
    const start = Date.now()
    this.bot.log(this.bot.isMobile, 'LOGIN-APP', 'Authorizing mobile scope...')
    let code = ''
    while (Date.now() - start < DEFAULT_TIMEOUTS.loginMaxMs) {
      await this.handlePasskeyPrompts(page, 'oauth')
      const u = new URL(page.url())
      if (u.hostname === 'login.live.com' && u.pathname === '/oauth20_desktop.srf') {
        code = u.searchParams.get('code') || ''
        break
      }
      await this.bot.utils.wait(1000)
    }
    if (!code) throw this.bot.log(this.bot.isMobile, 'LOGIN-APP', 'OAuth code not received in time', 'error')

    const form = new URLSearchParams()
    form.append('grant_type', 'authorization_code')
    form.append('client_id', this.clientId)
    form.append('code', code)
    form.append('redirect_uri', this.redirectUrl)

    const req: AxiosRequestConfig = { url: this.tokenUrl, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, data: form.toString() }
    const resp = await this.bot.axios.request(req)
    const data: OAuth = resp.data
    this.bot.log(this.bot.isMobile, 'LOGIN-APP', `Authorized in ${Math.round((Date.now()-start)/1000)}s`)
    return data.access_token
  }

  // --------------- Main Flow ---------------
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
    const field = await page.waitForSelector(SELECTORS.emailInput, { timeout: 5000 }).catch(()=>null)
    if (!field) { this.bot.log(this.bot.isMobile, 'LOGIN', 'Email field not present', 'warn'); return }
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
    // Some flows require switching to password first
    const switchBtn = await page.waitForSelector('#idA_PWD_SwitchToPassword', { timeout: 1500 }).catch(()=>null)
    if (switchBtn) { await switchBtn.click().catch(()=>{}); await this.bot.utils.wait(1000) }

    // Rare flow: list of methods -> choose password
    const passwordField = await page.waitForSelector(SELECTORS.passwordInput, { timeout: 4000 }).catch(()=>null)
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
    // TOTP auto entry
    try {
      if (this.currentTotpSecret) {
        const code = generateTOTP(this.currentTotpSecret.trim())
        await page.fill('input[name="otc"]', code)
        await page.keyboard.press('Enter')
        this.bot.log(this.bot.isMobile, 'LOGIN', 'Submitted TOTP automatically')
        return
      }
    } catch {/* ignore */}

    // Manual prompt
    this.bot.log(this.bot.isMobile, 'LOGIN', 'Waiting for user 2FA code (SMS / Email / App fallback)')
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const code: string = await new Promise(res => rl.question('Enter 2FA code:\n', ans => { rl.close(); res(ans.trim()) }))
    await page.fill('input[name="otc"]', code)
    await page.keyboard.press('Enter')
    this.bot.log(this.bot.isMobile, 'LOGIN', '2FA code submitted')
  }

  // --------------- Verification / State ---------------
  private async awaitRewardsPortal(page: Page) {
    const start = Date.now()
    while (Date.now() - start < DEFAULT_TIMEOUTS.loginMaxMs) {
      await this.handlePasskeyPrompts(page, 'main')
      const u = new URL(page.url())
      if (u.hostname === LOGIN_TARGET.host && u.pathname === LOGIN_TARGET.path) break
      await this.bot.utils.wait(1000)
    }
    const portal = await page.waitForSelector('html[data-role-name="RewardsPortal"]', { timeout: 8000 }).catch(()=>null)
    if (!portal) throw this.bot.log(this.bot.isMobile, 'LOGIN', 'Portal root element missing after navigation', 'error')
    this.bot.log(this.bot.isMobile, 'LOGIN', 'Reached rewards portal')
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
    if (locked) throw this.bot.log(this.bot.isMobile,'CHECK-LOCKED','Account locked by Microsoft (serviceAbuseLandingTitle)','error')
  }

  // --------------- Passkey / Dialog Handling ---------------
  private async handlePasskeyPrompts(page: Page, context: 'main' | 'oauth') {
    let did = false
    // Video heuristic
    const biometric = await page.waitForSelector(SELECTORS.biometricVideo, { timeout: 500 }).catch(()=>null)
    if (biometric) {
      const btn = await page.$(SELECTORS.passkeySecondary)
      if (btn) { await btn.click().catch(()=>{}); did = true; this.logPasskeyOnce('video heuristic') }
    }
    if (!did) {
      const titleEl = await page.waitForSelector(SELECTORS.passkeyTitle, { timeout: 500 }).catch(()=>null)
      const secBtn = await page.waitForSelector(SELECTORS.passkeySecondary, { timeout: 500 }).catch(()=>null)
      const primBtn = await page.waitForSelector(SELECTORS.passkeyPrimary, { timeout: 500 }).catch(()=>null)
      const title = (titleEl ? (await titleEl.textContent()) : '')?.trim() || ''
      const looksLike = /sign in faster|passkey|fingerprint|face|pin/i.test(title)
      if (looksLike && secBtn) { await secBtn.click().catch(()=>{}); did = true; this.logPasskeyOnce('title heuristic '+title) }
      else if (!did && secBtn && primBtn) {
        const text = (await secBtn.textContent()||'').trim()
        if (/skip for now/i.test(text)) { await secBtn.click().catch(()=>{}); did = true; this.logPasskeyOnce('secondary button text') }
      }
      if (!did) {
        const textBtn = await page.locator('xpath=//button[contains(normalize-space(.),"Skip for now")]').first()
        if (await textBtn.isVisible().catch(()=>false)) { await textBtn.click().catch(()=>{}); did = true; this.logPasskeyOnce('text fallback') }
      }
      if (!did) {
        const close = await page.$('#close-button')
        if (close) { await close.click().catch(()=>{}); did = true; this.logPasskeyOnce('close button') }
      }
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
      await ConclusionWebhook(this.bot.config,'', { embeds:[{ title:`🔐 ${incident.kind}`, description:'Security check by @Light', color: severity==='critical'?0xFF0000:0xFFAA00, fields:[
        { name:'Account', value: incident.account },
        ...(incident.details?.length?[{ name:'Details', value: incident.details.join('\n') }]:[]),
        ...(incident.next?.length?[{ name:'Next steps', value: incident.next.join('\n') }]:[]),
        ...(incident.docsUrl?[{ name:'Docs', value: incident.docsUrl }]:[])
      ] }] })
    } catch {/* ignore */}
  }

  private getDocsUrl(anchor?: string) {
    const base = process.env.DOCS_BASE?.trim() || 'https://github.com/LightZirconite/Microsoft-Rewards-Script-Private/blob/V2/docs/security.md'
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

  private async saveIncidentArtifacts(page: Page, slug: string) {
    try {
      const base = path.join(process.cwd(),'diagnostics','security-incidents')
      await fs.promises.mkdir(base,{ recursive:true })
      const ts = new Date().toISOString().replace(/[:.]/g,'-')
      const dir = path.join(base, `${ts}-${slug}`)
      await fs.promises.mkdir(dir,{ recursive:true })
      try { await page.screenshot({ path: path.join(dir,'page.png'), fullPage:false }) } catch {/* ignore */}
      try { const html = await page.content(); await fs.promises.writeFile(path.join(dir,'page.html'), html) } catch {/* ignore */}
      this.bot.log(this.bot.isMobile,'SECURITY',`Saved incident artifacts: ${dir}`)
    } catch {/* ignore */}
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
