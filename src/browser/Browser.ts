import rebrowser, { BrowserContext } from 'patchright'
import { newInjectedContext } from 'fingerprint-injector'
import { BrowserFingerprintWithHeaders, FingerprintGenerator } from 'fingerprint-generator'

import type { MicrosoftRewardsBot } from '../index'
import { loadSession, saveFingerprint } from '../util/SessionStore'
import { fingerprintMatchesLocale } from '../util/Locale'
import { UserAgentManager } from './UserAgent'

import type { Account, AccountProxy } from '../interface/Account'

/* 测试工具
https://abrahamjuliot.github.io/creepjs/
https://botcheck.luminati.io/
https://fv.pro/
https://pixelscan.net/
https://www.browserscan.net/
*/

interface BrowserCreationResult {
    context: BrowserContext
    fingerprint: BrowserFingerprintWithHeaders
}

class Browser {
    private readonly bot: MicrosoftRewardsBot
    private static readonly BROWSER_ARGS = [
        '--mute-audio',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-web-authentication-ui',
        '--disable-external-intent-requests',
        '--disable-blink-features=AutomationControlled,Attestation',
        '--disable-features=WebAuthentication,PasswordManagerOnboarding,PasswordManager,EnablePasswordsAccountStorage,Passkeys,WebAuthenticationProxy,U2F',
        '--disable-save-password-bubble',
        '--disable-dev-shm-usage',
        '--disable-background-networking',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-component-update'
    ] as const

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    async createBrowser(account: Account): Promise<BrowserCreationResult> {
        const headless = this.bot.config.headless

        const hasProxy = Boolean(account.proxy.url)

        let browser: rebrowser.Browser
        try {
            const proxyConfig = account.proxy.url
                ? {
                      server: this.formatProxyServer(account.proxy),
                      ...(account.proxy.username &&
                          account.proxy.password && {
                              username: account.proxy.username,
                              password: account.proxy.password
                          })
                  }
                : undefined

            const sandboxArgs = process.platform === 'win32' ? [] : ['--no-sandbox', '--disable-setuid-sandbox']

            const certArgs = hasProxy
                ? ['--ignore-certificate-errors', '--ignore-certificate-errors-spki-list', '--ignore-ssl-errors']
                : []

            this.bot.logger.info(
                this.bot.isMobile,
                'BROWSER',
                `Launching bundled patched Chromium (Edge UA) | headless: ${headless} | platform: ${process.platform} | proxy: ${hasProxy ? 'yes (TLS errors ignored)' : 'no (TLS validated)'}`
            )

            browser = await rebrowser.chromium.launch({
                headless,
                ...(proxyConfig && { proxy: proxyConfig }),
                args: [...Browser.BROWSER_ARGS, ...sandboxArgs, ...certArgs]
            })
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.bot.logger.error(this.bot.isMobile, 'BROWSER', `Browser launch failed: ${errorMessage}`)
            throw error
        }

        try {
            const session = loadSession(this.bot.config.sessionPath, account.email, this.bot.isMobile)

            if (session?.storageState) {
                const ageMinutes = Math.max(0, Math.floor((Date.now() - session.updatedAt) / 60000))
                this.bot.logger.info(
                    this.bot.isMobile,
                    'SESSION',
                    `Restoring saved browser session | cookies=${session.storageState.cookies.length} | origins=${session.storageState.origins.length} | ageMinutes=${ageMinutes}`
                )
            } else {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'SESSION',
                    'No saved browser session found; login may be required'
                )
            }

            const shouldUseFingerprint = this.bot.isMobile
                ? account.saveFingerprint.mobile
                : account.saveFingerprint.desktop

            const savedFingerprint = shouldUseFingerprint ? session?.fingerprint : null
            const reuseFingerprint =
                savedFingerprint && fingerprintMatchesLocale(savedFingerprint, this.bot.accountLocale)

            if (savedFingerprint && !reuseFingerprint) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'BROWSER-FINGERPRINT',
                    `Saved fingerprint locale does not match ${this.bot.accountLocale.locale}; generating a replacement`
                )
            }

            const fingerprint =
                (reuseFingerprint && savedFingerprint) || (await this.generateFingerprint(this.bot.isMobile))

            const screen = fingerprint.fingerprint.screen

            //@ts-expect-error 此处不接受来自不同包的浏览器实例
            const injected = await newInjectedContext(browser, {
                fingerprint,
                newContextOptions: {
                    permissions: [],
                    ignoreHTTPSErrors: hasProxy,
                    // 恢复 Cookie
                    ...(session?.storageState ? { storageState: session.storageState } : {}),
                    ...(this.bot.isMobile
                        ? {
                              isMobile: true,
                              hasTouch: true,
                              deviceScaleFactor: screen.devicePixelRatio,
                              viewport: { width: screen.width, height: screen.height },
                              screen: { width: screen.width, height: screen.height }
                          }
                        : {})
                }
            })
            const context = injected as unknown as BrowserContext

            await context.addInitScript(() => {
                try {
                    Object.defineProperty(navigator, 'webdriver', { configurable: true, get: () => false })
                } catch {}

                const rejectWebAuthn = () => Promise.reject(new DOMException('WebAuthn disabled', 'NotAllowedError'))
                try {
                    Object.defineProperty(navigator, 'credentials', {
                        configurable: true,
                        get: () => ({
                            create: rejectWebAuthn,
                            get: rejectWebAuthn,
                            preventSilentAccess: () => Promise.resolve()
                        })
                    })
                } catch {}

                try {
                    if (window.PublicKeyCredential) {
                        window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = () =>
                            Promise.resolve(false)
                    }
                } catch {}

                // 阻止 WebRTC 绕过代理泄露真实 IP
                // @ts-expect-error 删除此项，因为它可能会向浏览器泄露本机信息
                delete window.RTCPeerConnection
                // @ts-expect-error 原因同上
                delete window.webkitRTCPeerConnection
                // @ts-expect-error 如果你看到了这里，说明 Netsky 曾为此苦苦挣扎 :(
                delete window.RTCDataChannel
            })

            context.on('page', p => {
                p.on('crash', () =>
                    this.bot.logger.error(this.bot.isMobile, 'BROWSER', `Renderer crashed | ${p.url()}`)
                )
            })
            context.on('close', () => this.bot.logger.warn(this.bot.isMobile, 'BROWSER', 'Browser context closed'))

            context.setDefaultTimeout(this.bot.utils.stringToNumber(this.bot.config?.globalTimeout ?? 30000))

            if (shouldUseFingerprint) {
                saveFingerprint(this.bot.config.sessionPath, account.email, this.bot.isMobile, fingerprint)
            }

            this.bot.logger.info(
                this.bot.isMobile,
                'BROWSER',
                `Created context | locale=${this.bot.accountLocale.locale} | Accept-Language="${this.bot.accountLocale.acceptLanguage}" | User-Agent: "${fingerprint.fingerprint.navigator.userAgent}"`
            )
            this.bot.logger.debug(this.bot.isMobile, 'BROWSER-FINGERPRINT', JSON.stringify(fingerprint))

            return { context, fingerprint }
        } catch (error) {
            await browser.close().catch(() => {})
            throw error
        }
    }

    private formatProxyServer(proxy: AccountProxy): string {
        try {
            const urlObj = new URL(proxy.url)
            const protocol = urlObj.protocol.replace(':', '')
            return `${protocol}://${urlObj.hostname}:${proxy.port}`
        } catch {
            return `${proxy.url}:${proxy.port}`
        }
    }

    async generateFingerprint(isMobile: boolean): Promise<BrowserFingerprintWithHeaders> {
        const hostOs: 'windows' | 'macos' | 'linux' =
            process.platform === 'darwin' ? 'macos' : process.platform === 'linux' ? 'linux' : 'windows'

        const fingerPrintData = new FingerprintGenerator().getFingerprint({
            devices: isMobile ? ['mobile'] : ['desktop'],
            operatingSystems: isMobile ? ['android'] : [hostOs],
            browsers: [{ name: 'edge' }],
            locales: this.bot.accountLocale.acceptedLocales
        })

        const userAgentManager = new UserAgentManager(this.bot)
        return await userAgentManager.updateFingerprintUserAgent(fingerPrintData, isMobile)
    }
}

export default Browser
