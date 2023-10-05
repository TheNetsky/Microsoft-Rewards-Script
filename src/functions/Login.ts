import { Page } from 'puppeteer'
import readline from 'readline'

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})

import { tryDismissAllMessages, tryDismissBingCookieBanner } from '../browser/BrowserUtil'
import { wait } from '../util/Utils'
import { log } from '../util/Logger'

export async function login(page: Page, email: string, password: string) {

    try {
        // Navigate to the Bing login page
        await page.goto('https://login.live.com/')
        
        const isLoggedIn = await page.waitForSelector('html[data-role-name="MeePortal"]', { timeout: 5000 }).then(() => true).catch(() => false)

        if (!isLoggedIn) {
            await page.waitForSelector('#loginHeader', { visible: true, timeout: 10_000 })

            await execLogin(page, email, password)
            log('LOGIN', 'Logged into Microsoft successfully')
        } else {
            log('LOGIN', 'Already logged in')
        }

        // Check if logged in to bing
        await checkBingLogin(page)

        // We're done logging in
        log('LOGIN', 'Logged in successfully')

    } catch (error) {
        log('LOGIN', 'An error occurred:' + error, 'error')
    }
}

async function execLogin(page: Page, email: string, password: string) {
    await page.type('#i0116', email)
    await page.click('#idSIButton9')
    log('LOGIN', 'Email entered successfully')

    try {
        await page.waitForSelector('#i0118', { visible: true, timeout: 2000 })
        await wait(2000)

        await page.type('#i0118', password)
        await page.click('#idSIButton9')

    } catch (error) {
        log('LOGIN', '2FA code required')

        const code = await new Promise<string>((resolve) => {
            rl.question('Enter 2FA code:\n', (input) => {
                rl.close()
                resolve(input)
            })
        })

        await page.type('input[name="otc"]', code)
        await page.keyboard.press('Enter')

    } finally {
        log('LOGIN', 'Password entered successfully')
    }

    const currentURL = new URL(page.url())

    while (currentURL.pathname !== '/' || currentURL.hostname !== 'account.microsoft.com') {
        await tryDismissAllMessages(page)
        currentURL.href = page.url()
    }

    // Wait for login to complete
    await page.waitForSelector('html[data-role-name="MeePortal"]', { timeout: 10_000 })
}

async function checkBingLogin(page: Page): Promise<void> {
    try {
        log('LOGIN-BING', 'Verifying Bing login')
        await page.goto('https://www.bing.com/fd/auth/signin?action=interactive&provider=windows_live_id&return_url=https%3A%2F%2Fwww.bing.com%2F')

        const maxIterations = 5

        for (let iteration = 1; iteration <= maxIterations; iteration++) {
            const currentUrl = new URL(page.url())

            if (currentUrl.hostname === 'www.bing.com' && currentUrl.pathname === '/') {
                await wait(3000)
                await tryDismissBingCookieBanner(page)

                const loggedIn = await checkBingLoginStatus(page)
                if (loggedIn) {
                    log('LOGIN-BING', 'Bing login verification passed!')
                    break
                }
            }

            await wait(1000)
        }

    } catch (error) {
        log('LOGIN-BING', 'An error occurred:' + error, 'error')
    }
}

async function checkBingLoginStatus(page: Page): Promise<boolean> {
    try {
        await page.waitForSelector('#id_n', { timeout: 5000 })
        return true
    } catch (error) {
        return false
    }
}