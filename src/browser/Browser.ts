import playwright, { BrowserContext } from 'rebrowser-playwright'

import { newInjectedContext } from 'fingerprint-injector'
import { FingerprintGenerator } from 'fingerprint-generator'

import { MicrosoftRewardsBot } from '../index'
import { loadSessionData, saveFingerprintData } from '../util/Load'
import { updateFingerprintUserAgent } from '../util/UserAgent'

import { AccountProxy } from '../interface/Account'

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

    async createBrowser(proxy: AccountProxy, email: string): Promise<BrowserContext> {
        const browser = await playwright.chromium.launch({
            //channel: 'msedge', // Uses Edge instead of chrome
            headless: this.bot.config.headless,
            ...(proxy.url && { proxy: { username: proxy.username, password: proxy.password, server: `${proxy.url}:${proxy.port}` } }),
            args: [
                '--disable-accelerated-video-decode',
                '--disable-gpu-media-service',
                '--disable-image-animation',
                '--autoplay-policy=no-user-gesture-required',
                '--force-fieldtrials=SiteIsolationExtensions/Control',
                '--enable-low-end-device-mode',
                '--process-per-site',
                '--mute-audio',                    // 禁用音频
                '--disable-extensions',           // 禁用所有扩展
                '--disable-plugins',              // 禁用插件（如 Flash）
                '--disable-software-rasterizer',  // 禁用软件光栅化
                '--disable-component-update',     // 禁止组件自动更新
                '--disable-domain-reliability',   // 禁用域名可靠性监控
                '--disable-client-side-phishing-detection',  // 禁用反钓鱼检测
                '--disable-crash-reporter',       // 禁用崩溃报告
                '--disable-translate',            // 禁用翻译功能
                '--disable-background-downloads', // 禁止后台下载
                '--disable-breakpad',             // 禁用崩溃日志上传
                '--disable-logging',
                '--disable-notifications',
                '--disable-infobars',
                '--disable-background-timer-throttling',
                '--disable-sync',
                '--disable-dev-shm-usage',
                '--no-first-run',
                '--disable-renderer-backgrounding',
                '--disable-gpu',
                '--disable-background-networking',
                '--blink-settings=imagesEnabled=false',
                '--no-sandbox',
                '--mute-audio',
                '--disable-setuid-sandbox',
                '--ignore-certificate-errors',
                '--ignore-certificate-errors-spki-list',
                '--ignore-ssl-errors'
            ]
        })

        const sessionData = await loadSessionData(this.bot.config.sessionPath, email, this.bot.isMobile, this.bot.config.saveFingerprint)

        const fingerprint = sessionData.fingerprint ? sessionData.fingerprint : await this.generateFingerprint()

        const context = await newInjectedContext(browser as any, { fingerprint: fingerprint })

        // Set timeout to preferred amount
        context.setDefaultTimeout(this.bot.utils.stringToMs(this.bot.config?.globalTimeout ?? 30_000))

        await context.addCookies(sessionData.cookies)

        if (this.bot.config.saveFingerprint) {
            await saveFingerprintData(this.bot.config.sessionPath, email, this.bot.isMobile, fingerprint)
        }

        this.bot.log(this.bot.isMobile, 'BROWSER', `Created browser with User-Agent: "${fingerprint.fingerprint.navigator.userAgent}"`)

        return context as BrowserContext
    }

    async generateFingerprint() {
        const fingerPrintData = new FingerprintGenerator().getFingerprint({
            devices: this.bot.isMobile ? ['mobile'] : ['desktop'],
            operatingSystems: this.bot.isMobile ? ['android'] : ['windows'],
            browsers: [{ name: 'edge' }]
        })

        const updatedFingerPrintData = await updateFingerprintUserAgent(fingerPrintData, this.bot.isMobile)

        return updatedFingerPrintData
    }
}

export default Browser
