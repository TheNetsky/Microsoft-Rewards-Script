import { Page } from 'playwright'

import { MicrosoftRewardsBot } from '../index'


export default class BrowserUtil {
    private bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    async tryDismissAllMessages(page: Page): Promise<boolean> {
        const buttons = [
            { selector: '#acceptButton', label: 'AcceptButton' },
            { selector: '#iLandingViewAction', label: 'iLandingViewAction' },
            { selector: '#iShowSkip', label: 'iShowSkip' },
            { selector: '#iNext', label: 'iNext' },
            { selector: '#iLooksGood', label: 'iLooksGood' },
            { selector: '#idSIButton9', label: 'idSIButton9' },
            { selector: '.ms-Button.ms-Button--primary', label: 'Primary Button' }
        ]

        let result = false

        for (const button of buttons) {
            try {
                const element = await page.waitForSelector(button.selector, { state: 'visible', timeout: 1000 })
                if (element) {
                    await element.click()
                    result = true
                }

            } catch (error) {
                continue
            }
        }

        return result
    }

    async tryDismissCookieBanner(page: Page): Promise<void> {
        try {
            await page.waitForSelector('#cookieConsentContainer', { timeout: 1000 })
            const cookieBanner = await page.$('#cookieConsentContainer')

            if (cookieBanner) {
                const button = await cookieBanner.$('button')
                if (button) {
                    await button.click()
                    await this.bot.utils.wait(2000)
                }
            }

        } catch (error) {
            // Continue if element is not found or other error occurs
        }
    }

    async tryDismissBingCookieBanner(page: Page): Promise<void> {
        try {
            await page.waitForSelector('#bnp_btn_accept', { timeout: 1000 })
            const cookieBanner = await page.$('#bnp_btn_accept')

            if (cookieBanner) {
                await cookieBanner.click()
            }
        } catch (error) {
            // Continue if element is not found or other error occurs
        }
    }

    async getLatestTab(page: Page): Promise<Page> {
        try {
            await this.bot.utils.wait(500)

            const browser = page.context()
            const pages = browser.pages()
            const newTab = pages[pages.length - 1]

            if (newTab) {
                return newTab
            }

            throw this.bot.log('GET-NEW-TAB', 'Unable to get latest tab', 'error')
        } catch (error) {
            throw this.bot.log('GET-NEW-TAB', 'An error occurred:' + error, 'error')
        }
    }

    async getTabs(page: Page) {
        try {
            const browser = page.context()
            const pages = browser.pages()

            const homeTab = pages[1]
            let homeTabURL: URL

            if (!homeTab) {
                throw this.bot.log('GET-TABS', 'Home tab could not be found!', 'error')

            } else {
                homeTabURL = new URL(homeTab.url())

                if (homeTabURL.hostname !== 'rewards.bing.com') {
                    throw this.bot.log('GET-TABS', 'Reward page hostname is invalid: ' + homeTabURL.host, 'error')
                }
            }

            const workerTab = pages[2]
            if (!workerTab) {
                throw this.bot.log('GET-TABS', 'Worker tab could not be found!', 'error')
            }

            return {
                homeTab: homeTab,
                workerTab: workerTab
            }

        } catch (error) {
            throw this.bot.log('GET-TABS', 'An error occurred:' + error, 'error')
        }
    }

}