import { Page } from 'puppeteer'
import readline from 'readline'

import { MicrosoftRewardsBot } from '../index'

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})


export class Login {
    private bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    async login(page: Page, email: string, password: string) {

        try {
            // Navigate to the Bing login page
            await page.goto('https://login.live.com/')

            const isLoggedIn = await page.waitForSelector('html[data-role-name="MeePortal"]', { timeout: 10_000 }).then(() => true).catch(() => false)

            if (!isLoggedIn) {
                const isLocked = await page.waitForSelector('.serviceAbusePageContainer', { visible: true, timeout: 10_000 }).then(() => true).catch(() => false)
                if (isLocked) {
                    this.bot.log('LOGIN', 'This account has been locked!', 'error')
                    throw new Error('Account has been locked!')
                }

                await page.waitForSelector('#loginHeader', { visible: true, timeout: 10_000 })

                await this.execLogin(page, email, password)
                this.bot.log('LOGIN', 'Logged into Microsoft successfully')
            } else {
                this.bot.log('LOGIN', 'Already logged in')
            }

            // Check if logged in to bing
            await this.checkBingLogin(page)

            // We're done logging in
            this.bot.log('LOGIN', 'Logged in successfully')

        } catch (error) {
            // Throw and don't continue
            throw this.bot.log('LOGIN', 'An error occurred:' + error, 'error')
        }
    }

    private async execLogin(page: Page, email: string, password: string) {
        await page.type('#i0116', email)
        await page.click('#idSIButton9')

        this.bot.log('LOGIN', 'Email entered successfully')

        try {
            await page.waitForSelector('#i0118', { visible: true, timeout: 2000 })
            await this.bot.utils.wait(2000)

            await page.type('#i0118', password)
            await page.click('#idSIButton9')

        } catch (error) {
            this.bot.log('LOGIN', '2FA code required')

            const code = await new Promise<string>((resolve) => {
                rl.question('Enter 2FA code:\n', (input) => {
                    rl.close()
                    resolve(input)
                })
            })

            await page.type('input[name="otc"]', code)
            await page.keyboard.press('Enter')

        } finally {
            this.bot.log('LOGIN', 'Password entered successfully')
        }

        const currentURL = new URL(page.url())

        while (currentURL.pathname !== '/' || currentURL.hostname !== 'account.microsoft.com') {
            await this.bot.browser.utils.tryDismissAllMessages(page)
            currentURL.href = page.url()
        }

        // Wait for login to complete
        await page.waitForSelector('html[data-role-name="MeePortal"]', { timeout: 10_000 })
    }

    private async checkBingLogin(page: Page): Promise<void> {
        try {
            this.bot.log('LOGIN-BING', 'Verifying Bing login')
            await page.goto('https://www.bing.com/fd/auth/signin?action=interactive&provider=windows_live_id&return_url=https%3A%2F%2Fwww.bing.com%2F')

            const maxIterations = 5

            for (let iteration = 1; iteration <= maxIterations; iteration++) {
                const currentUrl = new URL(page.url())

                if (currentUrl.hostname === 'www.bing.com' && currentUrl.pathname === '/') {
                    await this.bot.utils.wait(3000)
                    await this.bot.browser.utils.tryDismissBingCookieBanner(page)

                    const loggedIn = await this.checkBingLoginStatus(page)
                    if (loggedIn) {
                        this.bot.log('LOGIN-BING', 'Bing login verification passed!')
                        break
                    }
                }

                await this.bot.utils.wait(1000)
            }

        } catch (error) {
            this.bot.log('LOGIN-BING', 'An error occurred:' + error, 'error')
        }
    }

    private async checkBingLoginStatus(page: Page): Promise<boolean> {
        try {
            await page.waitForSelector('#id_n', { timeout: 10_000 })
            return true
        } catch (error) {
            return false
        }
    }

}