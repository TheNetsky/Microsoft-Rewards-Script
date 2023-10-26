import puppeteer from 'puppeteer-extra'
import stealthPlugin from 'puppeteer-extra-plugin-stealth'

import { MicrosoftRewardsBot } from '../index'

import { getUserAgent } from '../util/UserAgent'

import { AccountProxy } from '../interface/Account'

puppeteer.use(stealthPlugin())


class Browser {
    private bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    async createBrowser(email: string, proxy: AccountProxy, isMobile: boolean) {
        const userAgent = await getUserAgent(isMobile)

        const browser = await puppeteer.launch({
            headless: this.bot.config.headless,
            userDataDir: await this.bot.browser.func.loadSesion(email),
            args: [
                '--no-sandbox',
                '--mute-audio',
                '--disable-setuid-sandbox',
                `--user-agent=${userAgent.userAgent}`,
                isMobile ? '--window-size=568,1024' : '',
                proxy.url ? `--proxy-server=${proxy.url}:${proxy.port}` : ''
            ]
        })

        return browser
    }
}

export default Browser