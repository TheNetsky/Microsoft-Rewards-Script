import playwright from 'playwright'
import { BrowserContext } from 'playwright'

import { newInjectedContext } from 'fingerprint-injector'
import { FingerprintGenerator } from 'fingerprint-generator'

import { MicrosoftRewardsBot } from '../index'
import { loadSessionData, saveFingerprintData } from '../util/Load'

import { AccountProxy } from '../interface/Account'

/* Test Stuff
https://abrahamjuliot.github.io/creepjs/
https://botcheck.luminati.io/
http://f.vision/
*/

class Browser {
    private bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    async createBrowser(proxy: AccountProxy, email: string): Promise<BrowserContext> {
        const browser = await playwright.chromium.launch({
            //channel: 'msedge', // Uses Edge instead of chrome
            headless: this.bot.config.headless,
            ...(proxy.url && { proxy: { username: proxy.username, password: proxy.password, server: `${proxy.url}:${proxy.port}` } }),
            args: [
                '--no-sandbox',
                '--mute-audio',
                '--disable-setuid-sandbox',
                '--ignore-certificate-errors',
                '--ignore-certificate-errors-spki-list',
                '--ignore-ssl-errors'
            ]
        })

        const sessionData = await loadSessionData(this.bot.config.sessionPath, email, this.bot.isMobile, this.bot.config.saveFingerprint)

        const fingerpint = sessionData.fingerprint ? sessionData.fingerprint : this.generateFingerprint()

        const context = await newInjectedContext(browser, { fingerprint: fingerpint })

        // Set timeout to preferred amount
        context.setDefaultTimeout(this.bot.config?.globalTimeout ?? 30_000)

        await context.addCookies(sessionData.cookies)

        if (this.bot.config.saveFingerprint) {
            await saveFingerprintData(this.bot.config.sessionPath, email, this.bot.isMobile, fingerpint)
        }

        this.bot.log('BROWSER', `Created browser with User-Agent: "${fingerpint.fingerprint.navigator.userAgent}"`)

        return context
    }

    generateFingerprint() {
        const fingerPrintData = new FingerprintGenerator().getFingerprint({
            devices: this.bot.isMobile ? ['mobile'] : ['desktop'],
            operatingSystems: this.bot.isMobile ? ['android'] : ['windows'],
            browsers: ['edge']
        })

        return fingerPrintData
    }
}

export default Browser
