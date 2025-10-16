import { Page } from 'rebrowser-playwright'
import { load } from 'cheerio'

import { MicrosoftRewardsBot } from '../index'
import { captureDiagnostics as captureSharedDiagnostics } from '../util/Diagnostics'

type DismissButton = { selector: string; label: string; isXPath?: boolean }

export default class BrowserUtil {
    private bot: MicrosoftRewardsBot

    private static readonly DISMISS_BUTTONS: readonly DismissButton[] = [
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

    private static readonly OVERLAY_SELECTORS = {
        container: '#bnp_overlay_wrapper',
        reject: '#bnp_btn_reject, button[aria-label*="Reject" i]',
        accept: '#bnp_btn_accept'
    } as const

    private static readonly STREAK_DIALOG_SELECTORS = {
        container: '[role="dialog"], div[role="alert"], div.ms-Dialog',
        textFilter: /streak protection has run out/i,
        closeButtons: 'button[aria-label*="close" i], button:has-text("Close"), button:has-text("Dismiss"), button:has-text("Got it"), button:has-text("OK"), button:has-text("Ok")'
    } as const

    private static readonly TERMS_UPDATE_SELECTORS = {
        titleId: '#iTOUTitle',
        titleText: /we're updating our terms/i,
        nextButton: 'button[data-testid="primaryButton"]:has-text("Next"), button[type="submit"]:has-text("Next")'
    } as const

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    async tryDismissAllMessages(page: Page): Promise<void> {
        const maxRounds = 3
        for (let round = 0; round < maxRounds; round++) {
            const dismissCount = await this.dismissRound(page)
            if (dismissCount === 0) break
        }
    }

    private async dismissRound(page: Page): Promise<number> {
        let count = 0
        count += await this.dismissStandardButtons(page)
        count += await this.dismissOverlayButtons(page)
        count += await this.dismissStreakDialog(page)
        count += await this.dismissTermsUpdateDialog(page)
        return count
    }

    private async dismissStandardButtons(page: Page): Promise<number> {
        let count = 0
        for (const btn of BrowserUtil.DISMISS_BUTTONS) {
            const dismissed = await this.tryClickButton(page, btn)
            if (dismissed) {
                count++
                await page.waitForTimeout(150)
            }
        }
        return count
    }

    private async tryClickButton(page: Page, btn: DismissButton): Promise<boolean> {
        try {
            const loc = btn.isXPath ? page.locator(`xpath=${btn.selector}`) : page.locator(btn.selector)
            const visible = await loc.first().isVisible({ timeout: 200 }).catch(() => false)
            if (!visible) return false

            await loc.first().click({ timeout: 500 }).catch(() => {})
            this.bot.log(this.bot.isMobile, 'DISMISS-ALL-MESSAGES', `Dismissed: ${btn.label}`)
            return true
        } catch {
            return false
        }
    }

    private async dismissOverlayButtons(page: Page): Promise<number> {
        try {
            const { container, reject, accept } = BrowserUtil.OVERLAY_SELECTORS
            const overlay = page.locator(container)
            const visible = await overlay.isVisible({ timeout: 200 }).catch(() => false)
            if (!visible) return 0

            const rejectBtn = overlay.locator(reject)
            if (await rejectBtn.first().isVisible().catch(() => false)) {
                await rejectBtn.first().click({ timeout: 500 }).catch(() => {})
                this.bot.log(this.bot.isMobile, 'DISMISS-ALL-MESSAGES', 'Dismissed: Overlay Reject')
                return 1
            }

            const acceptBtn = overlay.locator(accept)
            if (await acceptBtn.first().isVisible().catch(() => false)) {
                await acceptBtn.first().click({ timeout: 500 }).catch(() => {})
                this.bot.log(this.bot.isMobile, 'DISMISS-ALL-MESSAGES', 'Dismissed: Overlay Accept')
                return 1
            }

            return 0
        } catch {
            return 0
        }
    }

    private async dismissStreakDialog(page: Page): Promise<number> {
        try {
            const { container, textFilter, closeButtons } = BrowserUtil.STREAK_DIALOG_SELECTORS
            const dialog = page.locator(container).filter({ hasText: textFilter })
            const visible = await dialog.first().isVisible({ timeout: 200 }).catch(() => false)
            if (!visible) return 0

            const closeBtn = dialog.locator(closeButtons).first()
            if (await closeBtn.isVisible({ timeout: 200 }).catch(() => false)) {
                await closeBtn.click({ timeout: 500 }).catch(() => {})
                this.bot.log(this.bot.isMobile, 'DISMISS-ALL-MESSAGES', 'Dismissed: Streak Protection Dialog Button')
                return 1
            }

            await page.keyboard.press('Escape').catch(() => {})
            this.bot.log(this.bot.isMobile, 'DISMISS-ALL-MESSAGES', 'Dismissed: Streak Protection Dialog Escape')
            return 1
        } catch {
            return 0
        }
    }

    private async dismissTermsUpdateDialog(page: Page): Promise<number> {
        try {
            const { titleId, titleText, nextButton } = BrowserUtil.TERMS_UPDATE_SELECTORS
            
            // Check if terms update page is present
            const titleById = page.locator(titleId)
            const titleByText = page.locator('h1').filter({ hasText: titleText })
            
            const hasTitle = await titleById.isVisible({ timeout: 200 }).catch(() => false) ||
                           await titleByText.first().isVisible({ timeout: 200 }).catch(() => false)
            
            if (!hasTitle) return 0

            // Click the Next button
            const nextBtn = page.locator(nextButton).first()
            if (await nextBtn.isVisible({ timeout: 500 }).catch(() => false)) {
                await nextBtn.click({ timeout: 1000 }).catch(() => {})
                this.bot.log(this.bot.isMobile, 'DISMISS-ALL-MESSAGES', 'Dismissed: Terms Update Dialog (Next)')
                // Wait a bit for navigation
                await page.waitForTimeout(1000)
                return 1
            }

            return 0
        } catch {
            return 0
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