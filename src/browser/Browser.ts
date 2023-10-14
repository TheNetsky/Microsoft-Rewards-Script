import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

import { getUserAgent } from '../util/UserAgent'
import { loadSesion } from './BrowserFunc'

import { headless } from '../config.json'

puppeteer.use(StealthPlugin())

class Browser {

    async createBrowser(email: string, isMobile: boolean) {
        const userAgent = await getUserAgent(isMobile)

        const browser = await puppeteer.launch({
            headless: headless,
            userDataDir: await loadSesion(email),
            args: [
                '--no-sandbox',
                '--mute-audio',
                '--disable-setuid-sandbox',
                `--user-agent=${userAgent.userAgent}`,
                isMobile ? '--window-size=568,1024' : ''
            ]
        })

        return browser
    }
}

export default Browser