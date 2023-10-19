import { Page } from 'puppeteer'

import { wait } from './../util/Utils'
import { log } from './../util/Logger'

export async function tryDismissAllMessages(page: Page): Promise<boolean> {
    const buttons = [
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
            const element = await page.waitForSelector(button.selector, { visible: true, timeout: 1000 })
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

export async function tryDismissCookieBanner(page: Page): Promise<void> {
    try {
        await page.waitForSelector('#cookieConsentContainer', { timeout: 1000 })
        const cookieBanner = await page.$('#cookieConsentContainer')

        if (cookieBanner) {
            const button = await cookieBanner.$('button')
            if (button) {
                await button.click()
                await wait(2000)
            }
        }

    } catch (error) {
        // Continue if element is not found or other error occurs
    }
}

export async function tryDismissBingCookieBanner(page: Page): Promise<void> {
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

export async function getLatestTab(page: Page): Promise<Page> {
    try {
        await wait(500)

        const browser = page.browser()
        const pages = await browser.pages()
        const newTab = pages[pages.length - 1]

        if (newTab) {
            return newTab
        }

        throw log('GET-NEW-TAB', 'Unable to get latest tab', 'error')
    } catch (error) {
        throw log('GET-NEW-TAB', 'An error occurred:' + error, 'error')
    }
}