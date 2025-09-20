import { Page } from 'rebrowser-playwright'
import { load } from 'cheerio'

import { MicrosoftRewardsBot } from '../index'


export default class BrowserUtil {
    private bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    async tryDismissAllMessages(page: Page): Promise<void> {
        const buttons = [
            { selector: '#acceptButton', label: 'AcceptButton' },
            { selector: '.ext-secondary.ext-button', label: '"Skip for now" Button' },
            { selector: '#iLandingViewAction', label: 'iLandingViewAction' },
            { selector: '#iShowSkip', label: 'iShowSkip' },
            { selector: '#iNext', label: 'iNext' },
            { selector: '#iLooksGood', label: 'iLooksGood' },
            { selector: '#idSIButton9', label: 'idSIButton9' },
            { selector: '.ms-Button.ms-Button--primary', label: 'Primary Button' },
            { selector: '.c-glyph.glyph-cancel', label: 'Mobile Welcome Button' },
            { selector: '.maybe-later', label: 'Mobile Rewards App Banner' },
            { selector: '//div[@id="cookieConsentContainer"]//button[contains(text(), "Accept")]', label: 'Accept Cookie Consent Container', isXPath: true },
            { selector: '#bnp_btn_accept', label: 'Bing Cookie Banner' },
            { selector: '#reward_pivot_earn', label: 'Reward Coupon Accept' }
        ]

        for (const button of buttons) {
            try {
                const element = button.isXPath ? page.locator(`xpath=${button.selector}`) : page.locator(button.selector)
                await element.first().click({ timeout: 500 })
                await page.waitForTimeout(500)

                this.bot.log(this.bot.isMobile, 'DISMISS-ALL-MESSAGES', `Dismissed: ${button.label}`)

            } catch (error) {
                // Silent fail
            }
        }

        // Handle blocking Bing privacy overlay intercepting clicks (#bnp_overlay_wrapper)
        try {
            const overlay = await page.locator('#bnp_overlay_wrapper').first()
            if (await overlay.isVisible({ timeout: 500 }).catch(()=>false)) {
                // Try common dismiss buttons inside overlay
                const rejectBtn = await page.locator('#bnp_btn_reject, button[aria-label*="Reject" i]').first()
                const acceptBtn = await page.locator('#bnp_btn_accept').first()
                if (await rejectBtn.isVisible().catch(()=>false)) {
                    await rejectBtn.click({ timeout: 500 }).catch(()=>{})
                    this.bot.log(this.bot.isMobile, 'DISMISS-ALL-MESSAGES', 'Dismissed: Bing Overlay Reject')
                } else if (await acceptBtn.isVisible().catch(()=>false)) {
                    await acceptBtn.click({ timeout: 500 }).catch(()=>{})
                    this.bot.log(this.bot.isMobile, 'DISMISS-ALL-MESSAGES', 'Dismissed: Bing Overlay Accept (fallback)')
                }
                await page.waitForTimeout(300)
            }
        } catch { /* ignore */ }
    }

    async getLatestTab(page: Page): Promise<Page> {
        try {
            await this.bot.utils.wait(1000)

            const browser = page.context()
            const pages = browser.pages()
            const newTab = pages[pages.length - 1]

            if (newTab) {
                return newTab
            }

            throw this.bot.log(this.bot.isMobile, 'GET-NEW-TAB', 'Unable to get latest tab', 'error')
        } catch (error) {
            throw this.bot.log(this.bot.isMobile, 'GET-NEW-TAB', 'An error occurred:' + error, 'error')
        }
    }

    async getTabs(page: Page) {
        try {
            const browser = page.context()
            const pages = browser.pages()

            const homeTab = pages[1]
            let homeTabURL: URL

            if (!homeTab) {
                throw this.bot.log(this.bot.isMobile, 'GET-TABS', 'Home tab could not be found!', 'error')

            } else {
                homeTabURL = new URL(homeTab.url())

                if (homeTabURL.hostname !== 'rewards.bing.com') {
                    throw this.bot.log(this.bot.isMobile, 'GET-TABS', 'Reward page hostname is invalid: ' + homeTabURL.host, 'error')
                }
            }

            const workerTab = pages[2]
            if (!workerTab) {
                throw this.bot.log(this.bot.isMobile, 'GET-TABS', 'Worker tab could not be found!', 'error')
            }

            return {
                homeTab: homeTab,
                workerTab: workerTab
            }

        } catch (error) {
            throw this.bot.log(this.bot.isMobile, 'GET-TABS', 'An error occurred:' + error, 'error')
        }
    }

    async reloadBadPage(page: Page): Promise<void> {
        try {
            const html = await page.content().catch(() => '')
            const $ = load(html)

            const isNetworkError = $('body.neterror').length

            if (isNetworkError) {
                this.bot.log(this.bot.isMobile, 'RELOAD-BAD-PAGE', 'Bad page detected, reloading!')
                await page.reload()
            }

        } catch (error) {
            throw this.bot.log(this.bot.isMobile, 'RELOAD-BAD-PAGE', 'An error occurred:' + error, 'error')
        }
    }

    /**
     * Perform small human-like gestures: short waits, minor mouse moves and occasional scrolls.
     * This should be called sparingly between actions to avoid a fixed cadence.
     */
    async humanizePage(page: Page): Promise<void> {
        try {
            // 40% minor mouse move
            if (Math.random() < 0.4) {
                const x = Math.floor(Math.random() * 30) + 5
                const y = Math.floor(Math.random() * 20) + 3
                await page.mouse.move(x, y, { steps: 2 }).catch(() => { })
            }
            // 20% tiny scroll
            if (Math.random() < 0.2) {
                const dy = (Math.random() < 0.5 ? 1 : -1) * (Math.floor(Math.random() * 150) + 50)
                await page.mouse.wheel(0, dy).catch(() => { })
            }
            // Random short wait 150–450ms
            await this.bot.utils.wait(this.bot.utils.randomNumber(150, 450))
        } catch { /* swallow */ }
    }

    /**
     * Capture minimal diagnostics for a page: screenshot + HTML content.
     * Files are written under ./reports/<date>/ with a safe label.
     */
    async captureDiagnostics(page: Page, label: string): Promise<void> {
        try {
            const cfg = this.bot.config?.diagnostics || {}
            if (cfg.enabled === false) return
            const maxPerRun = typeof cfg.maxPerRun === 'number' ? cfg.maxPerRun : 8
            if (!this.bot.tryReserveDiagSlot(maxPerRun)) return

            const safe = label.replace(/[^a-z0-9-_]/gi, '_').slice(0, 64)
            const now = new Date()
            const day = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
            const baseDir = `${process.cwd()}/reports/${day}`
            const fs = await import('fs')
            const path = await import('path')
            if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true })
            const ts = `${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`
            const shot = path.join(baseDir, `${ts}_${safe}.png`)
            const htmlPath = path.join(baseDir, `${ts}_${safe}.html`)
            if (cfg.saveScreenshot !== false) {
                await page.screenshot({ path: shot }).catch(()=>{})
            }
            if (cfg.saveHtml !== false) {
                const html = await page.content().catch(()=> '<html></html>')
                fs.writeFileSync(htmlPath, html)
            }
            this.bot.log(this.bot.isMobile, 'DIAG', `Saved diagnostics to ${shot} and ${htmlPath}`)
        } catch (e) {
            this.bot.log(this.bot.isMobile, 'DIAG', `Failed to capture diagnostics: ${e instanceof Error ? e.message : e}`, 'warn')
        }
    }

}