import rebrowser, { BrowserContext } from 'patchright'

import { newInjectedContext } from 'fingerprint-injector'
import { BrowserFingerprintWithHeaders, FingerprintGenerator } from 'fingerprint-generator'

import type { MicrosoftRewardsBot } from '../index'
import { loadSessionData, saveFingerprintData } from '../util/Load'
import { UserAgentManager } from './UserAgent'

import type { AccountProxy } from '../interface/Account'

/* Test Stuff
https://abrahamjuliot.github.io/creepjs/
https://botcheck.luminati.io/
https://fv.pro/
https://pixelscan.net/
https://www.browserscan.net/
*/

class Browser {
    private bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    async createBrowser(
        proxy: AccountProxy,
        email: string
    ): Promise<{
        context: BrowserContext
        fingerprint: BrowserFingerprintWithHeaders
    }> {
        let browser: rebrowser.Browser
        try {
            browser = await rebrowser.chromium.launch({
                headless: this.bot.config.headless,
                ...(proxy?.url && {
                    proxy: { username: proxy.username, password: proxy.password, server: `${proxy.url}:${proxy.port}` }
                }),
                args: [
                    '--no-sandbox',
                    '--mute-audio',
                    '--disable-setuid-sandbox',
                    '--ignore-certificate-errors',
                    '--ignore-certificate-errors-spki-list',
                    '--ignore-ssl-errors',
                    '--no-first-run',
                    '--no-default-browser-check',
                    '--disable-user-media-security=true',
                    '--disable-blink-features=Attestation',
                    '--disable-features=WebAuthentication,PasswordManagerOnboarding,PasswordManager,EnablePasswordsAccountStorage,Passkeys',
                    '--disable-save-password-bubble'
                ]
            })
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'BROWSER',
                `Launch failed: ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }

        const sessionData = await loadSessionData(
            this.bot.config.sessionPath,
            email,
            this.bot.config.saveFingerprint,
            this.bot.isMobile
        )

        const fingerprint = sessionData.fingerprint
            ? sessionData.fingerprint
            : await this.generateFingerprint(this.bot.isMobile)

        const context = await newInjectedContext(browser as any, { fingerprint: fingerprint })

        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'credentials', {
                value: {
                    create: () => Promise.reject(new Error('WebAuthn disabled')),
                    get: () => Promise.reject(new Error('WebAuthn disabled'))
                }
            })
        })

        context.setDefaultTimeout(this.bot.utils.stringToNumber(this.bot.config?.globalTimeout ?? 30000))

        await context.addCookies(sessionData.cookies)

        if (this.bot.config.saveFingerprint) {
            await saveFingerprintData(this.bot.config.sessionPath, email, this.bot.isMobile, fingerprint)
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'BROWSER',
            `Created browser with User-Agent: "${fingerprint.fingerprint.navigator.userAgent}"`
        )

        this.bot.logger.debug(this.bot.isMobile, 'BROWSER-FINGERPRINT', JSON.stringify(fingerprint))

        return {
            context: context as unknown as BrowserContext,
            fingerprint: fingerprint
        }
    }

    async generateFingerprint(isMobile: boolean) {
        const fingerPrintData = new FingerprintGenerator().getFingerprint({
            devices: isMobile ? ['mobile'] : ['desktop'],
            operatingSystems: isMobile ? ['android', 'ios'] : ['windows', 'linux'],
            browsers: [{ name: 'edge' }]
        })

        const userAgentManager = new UserAgentManager(this.bot)
        const updatedFingerPrintData = await userAgentManager.updateFingerprintUserAgent(fingerPrintData, isMobile)

        return updatedFingerPrintData
    }
}

export default Browser
