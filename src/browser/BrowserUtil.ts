import { Page } from 'rebrowser-playwright'
import { load } from 'cheerio'

import { MicrosoftRewardsBot } from '../index'


export default class BrowserUtil {
    private bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    async tryDismissAllMessages(page: Page): Promise<void> {
        const attempts = 3
        const buttonGroups: { selector: string; label: string; isXPath?: boolean }[] = [
            { selector: '#acceptButton', label: 'AcceptButton' },
            { selector: '.optanon-allow-all, .optanon-alert-box-button', label: 'OneTrust Accept' },
            { selector: '.ext-secondary.ext-button', label: 'Skip For Now' },
            { selector: '#iLandingViewAction', label: 'Landing Continue' },
            { selector: '#iShowSkip', label: 'Show Skip' },
            { selector: '#iNext', label: 'Next' },
            { selector: '#iLooksGood', label: 'LooksGood' },
            { selector: '#idSIButton9', label: 'PrimaryLoginButton' },
            { selector: '.ms-Button.ms-Button--primary', label: 'Primary Generic' },
            { selector: '.c-glyph.glyph-cancel', label: 'Mobile Welcome Cancel' },
            { selector: '.maybe-later, button[data-automation-id*="maybeLater" i]', label: 'Maybe Later' },
            { selector: '#bnp_btn_reject', label: 'Bing Cookie Reject' },
            { selector: '#bnp_btn_accept', label: 'Bing Cookie Accept' },
            { selector: '#bnp_close_link', label: 'Bing Cookie Close' },
            { selector: '#reward_pivot_earn', label: 'Rewards Pivot Earn' },
            { selector: '//div[@id="cookieConsentContainer"]//button[contains(text(), "Accept")]', label: 'Legacy Cookie Accept', isXPath: true }
        ]
        for (let round = 0; round < attempts; round++) {
            let dismissedThisRound = 0
            for (const btn of buttonGroups) {
                try {
                    const loc = btn.isXPath ? page.locator(`xpath=${btn.selector}`) : page.locator(btn.selector)
                    if (await loc.first().isVisible({ timeout: 200 }).catch(()=>false)) {
                        await loc.first().click({ timeout: 500 }).catch(()=>{})
                        dismissedThisRound++
                        this.bot.log(this.bot.isMobile, 'DISMISS-ALL-MESSAGES', `Dismissed: ${btn.label}`)
                        await page.waitForTimeout(150)
                    }
                } catch { /* ignore */ }
            }
            // Special case: blocking overlay with inside buttons
            try {
                const overlay = page.locator('#bnp_overlay_wrapper')
                if (await overlay.isVisible({ timeout: 200 }).catch(()=>false)) {
                    const reject = overlay.locator('#bnp_btn_reject, button[aria-label*="Reject" i]')
                    const accept = overlay.locator('#bnp_btn_accept')
                    if (await reject.first().isVisible().catch(()=>false)) {
                        await reject.first().click({ timeout: 500 }).catch(()=>{})
                        this.bot.log(this.bot.isMobile, 'DISMISS-ALL-MESSAGES', 'Dismissed: Overlay Reject')
                        dismissedThisRound++
                    } else if (await accept.first().isVisible().catch(()=>false)) {
                        await accept.first().click({ timeout: 500 }).catch(()=>{})
                        this.bot.log(this.bot.isMobile, 'DISMISS-ALL-MESSAGES', 'Dismissed: Overlay Accept')
                        dismissedThisRound++
                    }
                }
            } catch { /* ignore */ }
            if (dismissedThisRound === 0) break // nothing new dismissed -> stop early
        }
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
            const h = this.bot.config?.humanization || {}
            if (h.enabled === false) return
            const moveProb = typeof h.gestureMoveProb === 'number' ? h.gestureMoveProb : 0.4
            const scrollProb = typeof h.gestureScrollProb === 'number' ? h.gestureScrollProb : 0.2
            // minor mouse move
            if (Math.random() < moveProb) {
                const x = Math.floor(Math.random() * 30) + 5
                const y = Math.floor(Math.random() * 20) + 3
                await page.mouse.move(x, y, { steps: 2 }).catch(() => { })
            }
            // tiny scroll
            if (Math.random() < scrollProb) {
                const dy = (Math.random() < 0.5 ? 1 : -1) * (Math.floor(Math.random() * 150) + 50)
                await page.mouse.wheel(0, dy).catch(() => { })
            }
            // Random short wait; override via humanization.actionDelay
            const range = h.actionDelay
            if (range && typeof range.min !== 'undefined' && typeof range.max !== 'undefined') {
                try {
                    const ms = (await import('ms')).default
                    const min = typeof range.min === 'number' ? range.min : ms(String(range.min))
                    const max = typeof range.max === 'number' ? range.max : ms(String(range.max))
                    if (typeof min === 'number' && typeof max === 'number' && max >= min) {
                        await this.bot.utils.wait(this.bot.utils.randomNumber(Math.max(0, min), Math.min(max, 5000)))
                    } else {
                        await this.bot.utils.wait(this.bot.utils.randomNumber(150, 450))
                    }
                } catch {
                    await this.bot.utils.wait(this.bot.utils.randomNumber(150, 450))
                }
            } else {
                await this.bot.utils.wait(this.bot.utils.randomNumber(150, 450))
            }
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