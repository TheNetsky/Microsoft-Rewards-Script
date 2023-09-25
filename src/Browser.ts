import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

import { getUserAgent } from './util/UserAgent'
import { loadSesion } from './BrowserFunc'

puppeteer.use(StealthPlugin())

export async function Browser(email: string, headless = false) {
    const userAgent = await getUserAgent(false)

    const browser = await puppeteer.launch({
        headless: headless, // Set to true for a headless browser
        userDataDir: await loadSesion(email),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            `--user-agent=${userAgent.userAgent}`
        ]
    })

    return browser
}

export async function mobileBrowser(email: string, headless = false) {
    const userAgent = await getUserAgent(true)

    const browser = await puppeteer.launch({
        headless: headless, // Set to true for a headless browser,
        userDataDir: await loadSesion(email),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            `--user-agent=${userAgent.userAgent}`,
            '--window-size=568,1024'
        ]
    })

    return browser
}