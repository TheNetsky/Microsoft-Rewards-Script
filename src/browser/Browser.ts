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
                  '--disable-blink-features=AutomationControlled',  // 移除 `navigator.webdriver` 特征
                  '--disable-accelerated-video-decode', // 禁用硬件加速的视频解码
                  '--disable-gpu-media-service', // 禁用 GPU 媒体服务
                  '--disable-extensions', // 禁用所有扩展
                  '--disable-plugins', // 禁用插件（例如 Flash）
                  '--disable-software-rasterizer', // 禁用软件光栅化
                  '--disable-component-update', // 禁止组件自动更新
                  '--disable-domain-reliability', // 禁用域名可靠性监控
                  '--disable-client-side-phishing-detection', // 禁用客户端反钓鱼检测
                  '--disable-crash-reporter', // 禁用崩溃报告
                  '--disable-translate', // 禁用翻译功能
                  '--disable-background-downloads', // 禁止后台下载
                  '--disable-breakpad', // 禁用崩溃日志上传
                  '--disable-logging', // 禁用日志记录
                  '--disable-notifications', // 禁用通知功能
                  '--disable-infobars', // 禁用信息栏
                  '--disable-background-timer-throttling', // 禁用后台计时器节流
                  '--disable-sync', // 禁用同步功能
                  '--disable-dev-shm-usage', // 禁用 /dev/shm 的使用（解决共享内存问题）
                  '--no-first-run', // 跳过首次运行检查
                  '--disable-renderer-backgrounding', // 禁用渲染进程后台化
                  '--disable-gpu', // 禁用 GPU 硬件加速
                  '--disable-background-networking', // 禁用后台网络通信
                  '--no-sandbox', // 禁用沙盒模式
                  '--mute-audio', // 禁用音频
                  '--disable-setuid-sandbox', // 禁用 setuid 沙盒
                  '--ignore-certificate-errors', // 忽略所有证书错误
                  '--ignore-certificate-errors-spki-list', // 忽略指定 SPKI 列表的证书错误
                  '--ignore-ssl-errors' // 忽略 SSL 错误
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
