import rebrowser, { BrowserContext } from 'patchright'
import { newInjectedContext } from 'fingerprint-injector'
import { BrowserFingerprintWithHeaders, FingerprintGenerator } from 'fingerprint-generator'

import type { MicrosoftRewardsBot } from '../index'
import { loadSession, saveFingerprint } from '../util/SessionStore'
import { fingerprintMatchesLocale } from '../util/Locale'
import { formatBrowserProxyServer } from '../util/Proxy'
import { UserAgentManager } from './UserAgent'

import type { Account } from '../interface/Account'
import { configureMediaBlocking } from './MediaBlocker'

/* Test Stuff
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
    private readonly fingerprintGenerator = new FingerprintGenerator()
    private readonly userAgentManager: UserAgentManager
    private static readonly BROWSER_ARGS = [
        '--mute-audio',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-web-authentication-ui',
        '--disable-external-intent-requests',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=WebAuthentication,PasswordManagerOnboarding,PasswordManager,EnablePasswordsAccountStorage,Passkeys,WebAuthenticationProxy,U2F',
        '--disable-save-password-bubble',
        '--disable-dev-shm-usage',
        '--disable-background-networking',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
    ] as const

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
        this.userAgentManager = new UserAgentManager(bot)
    }

    async createBrowser(account: Account): Promise<BrowserCreationResult> {
        const headless = this.bot.config.headless

        const hasProxy = Boolean(account.proxy.url)
        const ignoreCertificateErrors = hasProxy && this.bot.config.proxy.ignoreCertificateErrors

        let browser: rebrowser.Browser
        try {
            const proxyConfig = account.proxy.url
                ? {
                      server: formatBrowserProxyServer(account.proxy.url, account.proxy.port),
                      ...(account.proxy.username &&
                          account.proxy.password && {
                              username: account.proxy.username,
                              password: account.proxy.password
                          })
                  }
                : undefined

            const runningAsRoot = typeof process.getuid === 'function' && process.getuid() === 0
            const sandboxDisabled = process.platform === 'linux' && runningAsRoot
            const sandboxArgs = sandboxDisabled ? ['--no-sandbox', '--disable-setuid-sandbox'] : []

            const certArgs = ignoreCertificateErrors
                ? ['--ignore-certificate-errors', '--ignore-certificate-errors-spki-list', '--ignore-ssl-errors']
                : []

            if (ignoreCertificateErrors) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'BROWSER-SECURITY',
                    'TLS 证书验证已被 proxy.ignoreCertificateErrors 禁用'
                )
            }

            this.bot.logger.info(
                this.bot.isMobile,
                'BROWSER',
                `正在启动内置的补丁版 Chromium (Edge UA) | headless=${headless} | platform=${process.platform} | proxy=${hasProxy ? 'yes' : 'no'} | tls=${ignoreCertificateErrors ? 'verification-disabled' : 'verified'} | sandbox=${sandboxDisabled ? 'disabled-root' : 'enabled'}`
            )

            browser = await rebrowser.chromium.launch({
                headless,
                ...(proxyConfig && { proxy: proxyConfig }),
                args: [...Browser.BROWSER_ARGS, ...sandboxArgs, ...certArgs]
            })
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.bot.logger.error(this.bot.isMobile, 'BROWSER', `浏览器启动失败: ${errorMessage}`)
            throw error
        }

        try {
            const session = loadSession(this.bot.config.sessionPath, account.email, this.bot.isMobile)

            if (session?.storageState) {
                const ageMinutes = Math.max(0, Math.floor((Date.now() - session.updatedAt) / 60000))
                this.bot.logger.info(
                    this.bot.isMobile,
                    'SESSION',
                    `正在恢复已保存的浏览器会话 | Cookie数=${session.storageState.cookies.length} | origins=${session.storageState.origins.length} | 已保存分钟数=${ageMinutes}`
                )
            } else {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'SESSION',
                    '未找到已保存的浏览器会话；可能需要登录'
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
                    `已保存的指纹区域与 ${this.bot.accountLocale.locale} 不匹配；正在生成替代指纹`
                )
            }

            const fingerprint =
                (reuseFingerprint && savedFingerprint) || (await this.generateFingerprint(this.bot.isMobile))

            const screen = fingerprint.fingerprint.screen

            //@ts-expect-error It doesn't like the browser instance from different packages
            const injected = await newInjectedContext(browser, {
                fingerprint,
                newContextOptions: {
                    permissions: [],
                    ignoreHTTPSErrors: ignoreCertificateErrors,
                    // Restore cookies
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

            if (hasProxy) {
                await context.addInitScript(() => {
                    // @ts-expect-error Chromium-specific runtime globals
                    delete window.RTCPeerConnection
                    // @ts-expect-error Legacy Chromium runtime global
                    delete window.webkitRTCPeerConnection
                    // @ts-expect-error Chromium-specific runtime global
                    delete window.RTCDataChannel
                })
            }

            await configureMediaBlocking(this.bot, context)

            context.on('page', p => {
                p.on('crash', () =>
                    this.bot.logger.error(this.bot.isMobile, 'BROWSER', `渲染器崩溃 | ${p.url()}`)
                )
            })
            context.on('close', () => this.bot.logger.warn(this.bot.isMobile, 'BROWSER', '浏览器上下文已关闭'))

            context.setDefaultTimeout(this.bot.utils.stringToNumber(this.bot.config?.globalTimeout ?? 30000))

            if (shouldUseFingerprint && !reuseFingerprint) {
                saveFingerprint(this.bot.config.sessionPath, account.email, this.bot.isMobile, fingerprint)
            }

            this.bot.logger.info(
                this.bot.isMobile,
                'BROWSER',
                `已创建上下文 | locale=${this.bot.accountLocale.locale} | Accept-Language="${this.bot.accountLocale.acceptLanguage}" | User-Agent: "${fingerprint.fingerprint.navigator.userAgent}"`
            )
            this.bot.logger.debug(this.bot.isMobile, 'BROWSER-FINGERPRINT', JSON.stringify(fingerprint))

            return { context, fingerprint }
        } catch (error) {
            await browser.close().catch(() => {})
            throw error
        }
    }

    async generateFingerprint(isMobile: boolean): Promise<BrowserFingerprintWithHeaders> {
        const hostOs: 'windows' | 'macos' | 'linux' =
            process.platform === 'darwin' ? 'macos' : process.platform === 'linux' ? 'linux' : 'windows'

        const fingerPrintData = this.fingerprintGenerator.getFingerprint({
            devices: isMobile ? ['mobile'] : ['desktop'],
            operatingSystems: isMobile ? ['android'] : [hostOs],
            browsers: [{ name: 'edge' }],
            locales: this.bot.accountLocale.acceptedLocales
        })

        return this.userAgentManager.updateFingerprintUserAgent(fingerPrintData, isMobile)
    }
}

export default Browser
