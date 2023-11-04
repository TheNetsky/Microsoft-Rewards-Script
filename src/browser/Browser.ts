import puppeteer from 'puppeteer-extra'
import { FingerprintInjector } from 'fingerprint-injector'
import { FingerprintGenerator } from 'fingerprint-generator'

import { MicrosoftRewardsBot } from '../index'

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

    async createBrowser(email: string, proxy: AccountProxy, isMobile: boolean) {
        //        const userAgent = await getUserAgent(isMobile)

        const browser = await puppeteer.launch({
            headless: this.bot.config.headless,
            userDataDir: await this.bot.browser.func.loadSesion(email),
            args: [
                '--no-sandbox',
                '--mute-audio',
                '--disable-setuid-sandbox',
                '--ignore-certificate-errors',
                '--ignore-certificate-errors-spki-list',
                '--ignore-ssl-errors',
                proxy.url ? `--proxy-server=${proxy.url}:${proxy.port}` : ''
            ]
        })

        const { fingerprint, headers } = new FingerprintGenerator().getFingerprint({
            devices: isMobile ? ['mobile'] : ['desktop'],
            operatingSystems: isMobile ? ['android'] : ['windows'],
            browsers: ['edge'],
            browserListQuery: 'last 2 Edge versions'
        })

        // Modify the newPage function to attach the fingerprint
        const originalNewPage = browser.newPage
        browser.newPage = async function () {
            const page = await originalNewPage.apply(browser)
            await new FingerprintInjector().attachFingerprintToPuppeteer(page, { fingerprint, headers })
            return page
        }

        return browser
    }

}

export default Browser