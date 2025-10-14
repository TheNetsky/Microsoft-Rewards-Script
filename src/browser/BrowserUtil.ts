import { Page } from 'rebrowser-playwright'
import { load } from 'cheerio'

import { MicrosoftRewardsBot } from '../index'
import { captureDiagnostics as captureSharedDiagnostics } from '../util/Diagnostics'


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
            try {
                const streakDialog = page.locator('[role="dialog"], div[role="alert"], div.ms-Dialog').filter({ hasText: /streak protection has run out/i })
                const visibleDialog = await streakDialog.first().isVisible({ timeout: 200 }).catch(()=>false)
                if (visibleDialog) {
                    const closeButton = streakDialog.locator('button[aria-label*="close" i], button:has-text("Close"), button:has-text("Dismiss"), button:has-text("Got it"), button:has-text("OK"), button:has-text("Ok")').first()
                    if (await closeButton.isVisible({ timeout: 200 }).catch(()=>false)) {
                        await closeButton.click({ timeout: 500 }).catch(()=>{})
                        this.bot.log(this.bot.isMobile, 'DISMISS-ALL-MESSAGES', 'Dismissed: Streak Protection Dialog Button')
                        dismissedThisRound++
                    } else {
                        await page.keyboard.press('Escape').catch(()=>{})
                        this.bot.log(this.bot.isMobile, 'DISMISS-ALL-MESSAGES', 'Dismissed: Streak Protection Dialog Escape')
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
            await this.bot.humanizer.microGestures(page)
            await this.bot.humanizer.actionPause()
        } catch { /* swallow */ }
    }

    /**
     * Capture minimal diagnostics for a page: screenshot + HTML content.
     * Files are written under ./reports/<date>/ with a safe label.
     */
    async captureDiagnostics(page: Page, label: string): Promise<void> {
        await captureSharedDiagnostics(this.bot, page, label)
    }

}