import puppeteer from 'puppeteer-extra'
import stealthPlugin from 'puppeteer-extra-plugin-stealth'

import { getUserAgent } from '../util/UserAgent'
import { loadSesion } from './BrowserFunc'

import { AccountProxy } from '../interface/Account'

import { headless } from '../config.json'

puppeteer.use(stealthPlugin())

class Browser {

    async createBrowser(email: string, proxy: AccountProxy, isMobile: boolean) {
        const userAgent = await getUserAgent(isMobile)

        const browser = await puppeteer.launch({
            headless: headless,
            userDataDir: await loadSesion(email),
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