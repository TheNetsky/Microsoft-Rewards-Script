import { Page } from 'rebrowser-playwright'
import readline from 'readline'
import * as crypto from 'crypto'
import { AxiosRequestConfig } from 'axios'

import { MicrosoftRewardsBot } from '../index'
import { saveSessionData } from '../util/Load'

import { OAuth } from '../interface/OAuth'


const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})

export class Login {
    private bot: MicrosoftRewardsBot
    private clientId: string = '0000000040170455'
    private authBaseUrl: string = 'https://login.live.com/oauth20_authorize.srf'
    private redirectUrl: string = 'https://login.live.com/oauth20_desktop.srf'
    private tokenUrl: string = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
    private scope: string = 'service::prod.rewardsplatform.microsoft.com::MBI_SSL'

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    async login(page: Page, email: string, password: string) {

        try {
            // Navigate to the Bing login page
            await page.goto('https://rewards.bing.com/signin')

            // Check if account is locked
            await this.checkLocked(page)

            const isLoggedIn = await page.waitForSelector('html[data-role-name="RewardsPortal"]', { timeout: 10_000 }).then(() => true).catch(() => false)

            if (!isLoggedIn) {
                await this.execLogin(page, email, password)
                this.bot.log(this.bot.isMobile, 'LOGIN', 'Logged into Microsoft successfully')
            } else {
                this.bot.log(this.bot.isMobile, 'LOGIN', 'Already logged in')

                // Check if account is locked
                await this.checkLocked(page)
            }

            // Check if logged in to bing
            await this.checkBingLogin(page)

            // Save session
            await saveSessionData(this.bot.config.sessionPath, page.context(), email, this.bot.isMobile)

            // We're done logging in
            this.bot.log(this.bot.isMobile, 'LOGIN', 'Logged in successfully')

        } catch (error) {
            // Throw and don't continue
            throw this.bot.log(this.bot.isMobile, 'LOGIN', 'An error occurred:' + error, 'error')
        }
    }

    private async execLogin(page: Page, email: string, password: string) {
        try {
            await this.enterEmail(page, email)
            await this.bot.browser.utils.reloadBadPage(page)
            await this.enterPassword(page, password)

            // Check if account is locked
            await this.checkLocked(page)

            await this.bot.browser.utils.reloadBadPage(page)
            await this.checkLoggedIn(page)
        } catch (error: any) {
            this.bot.log(this.bot.isMobile, 'LOGIN', 'An error occurred: ' + error.message, 'error')
        }
    }

    private async enterEmail(page: Page, email: string) {
        await page.fill('#i0116', email)
        await page.click('#idSIButton9')
        this.bot.log(this.bot.isMobile, 'LOGIN', 'Email entered successfully')
    }

    private async enterPassword(page: Page, password: string) {
        try {
            await page.waitForSelector('#i0118', { state: 'visible', timeout: 2000 })
            await this.bot.utils.wait(2000)
            await page.fill('#i0118', password)
            await page.click('#idSIButton9')
            this.bot.log(this.bot.isMobile, 'LOGIN', 'Password entered successfully')
        } catch {
            this.bot.log(this.bot.isMobile, 'LOGIN', 'Password entry failed or 2FA required')
            await this.handle2FA(page)
        }
    }

    private async handle2FA(page: Page) {
        try {
            const numberToPress = await this.get2FACode(page)
            if (numberToPress) {
                // Authentictor App verification
                await this.authAppVerification(page, numberToPress)
            } else {
                // SMS verification
                await this.authSMSVerification(page)
            }
        } catch (error: any) {
            this.bot.log(this.bot.isMobile, 'LOGIN', `2FA handling failed: ${error.message}`)
        }
    }

    private async get2FACode(page: Page): Promise<string | null> {
        try {
            const element = await page.waitForSelector('#displaySign', { state: 'visible', timeout: 2000 })
            return await element.textContent()
        } catch {
            await page.click('button[aria-describedby="confirmSendTitle"]')
            await this.bot.utils.wait(2000)
            const element = await page.waitForSelector('#displaySign', { state: 'visible', timeout: 2000 })
            return await element.textContent()
        }
    }

    private async authAppVerification(page: Page, numberToPress: string | null) {
        // eslint-disable-next-line no-constant-condition
        while (true) {
            try {
                this.bot.log(this.bot.isMobile, 'LOGIN', `Press the number ${numberToPress} on your Authenticator app to approve the login`)
                this.bot.log(this.bot.isMobile, 'LOGIN', 'If you press the wrong number or the "DENY" button, try again in 60 seconds')

                await page.waitForSelector('#i0281', { state: 'detached', timeout: 60_000 })

                this.bot.log(this.bot.isMobile, 'LOGIN', 'Login successfully approved!')
                break
            } catch {
                this.bot.log(this.bot.isMobile, 'LOGIN', 'The code is expired. Trying to get a new code...')
                await page.click('button[aria-describedby="pushNotificationsTitle errorDescription"]')
                numberToPress = await this.get2FACode(page)
            }
        }
    }

    private async authSMSVerification(page: Page) {
        this.bot.log(this.bot.isMobile, 'LOGIN', 'SMS 2FA code required. Waiting for user input...')

        const code = await new Promise<string>((resolve) => {
            rl.question('Enter 2FA code:\n', (input) => {
                rl.close()
                resolve(input)
            })
        })

        await page.fill('input[name="otc"]', code)
        await page.keyboard.press('Enter')
        this.bot.log(this.bot.isMobile, 'LOGIN', '2FA code entered successfully')
    }

    private async checkLoggedIn(page: Page) {
        const targetHostname = 'rewards.bing.com'
        const targetPathname = '/'

        // eslint-disable-next-line no-constant-condition
        while (true) {
            await this.bot.browser.utils.tryDismissAllMessages(page)
            const currentURL = new URL(page.url())
            if (currentURL.hostname === targetHostname && currentURL.pathname === targetPathname) {
                break
            }
        }

        // Wait for login to complete
        await page.waitForSelector('html[data-role-name="RewardsPortal"]', { timeout: 10_000 })
        this.bot.log(this.bot.isMobile, 'LOGIN', 'Successfully logged into the rewards portal')
    }

    private async checkBingLogin(page: Page): Promise<void> {
        try {
            this.bot.log(this.bot.isMobile, 'LOGIN-BING', 'Verifying Bing login')
            await page.goto('https://www.bing.com/fd/auth/signin?action=interactive&provider=windows_live_id&return_url=https%3A%2F%2Fwww.bing.com%2F')

            const maxIterations = 5

            for (let iteration = 1; iteration <= maxIterations; iteration++) {
                const currentUrl = new URL(page.url())

                if (currentUrl.hostname === 'www.bing.com' && currentUrl.pathname === '/') {
                    await this.bot.browser.utils.tryDismissAllMessages(page)

                    const loggedIn = await this.checkBingLoginStatus(page)
                    // If mobile browser, skip this step
                    if (loggedIn || this.bot.isMobile) {
                        this.bot.log(this.bot.isMobile, 'LOGIN-BING', 'Bing login verification passed!')
                        break
                    }
                }

                await this.bot.utils.wait(1000)
            }

        } catch (error) {
            this.bot.log(this.bot.isMobile, 'LOGIN-BING', 'An error occurred:' + error, 'error')
        }
    }

    private async checkBingLoginStatus(page: Page): Promise<boolean> {
        try {
            await page.waitForSelector('#id_n', { timeout: 5000 })
            return true
        } catch (error) {
            return false
        }
    }

    async getMobileAccessToken(page: Page, email: string) {
        const authorizeUrl = new URL(this.authBaseUrl)

        authorizeUrl.searchParams.append('response_type', 'code')
        authorizeUrl.searchParams.append('client_id', this.clientId)
        authorizeUrl.searchParams.append('redirect_uri', this.redirectUrl)
        authorizeUrl.searchParams.append('scope', this.scope)
        authorizeUrl.searchParams.append('state', crypto.randomBytes(16).toString('hex'))
        authorizeUrl.searchParams.append('access_type', 'offline_access')
        authorizeUrl.searchParams.append('login_hint', email)

        await page.goto(authorizeUrl.href)

        const currentUrl = new URL(page.url())
        let code: string

        // eslint-disable-next-line no-constant-condition
        while (true) {
            this.bot.log(this.bot.isMobile, 'LOGIN-APP', 'Waiting for authorization')
            if (currentUrl.hostname === 'login.live.com' && currentUrl.pathname === '/oauth20_desktop.srf') {
                code = currentUrl.searchParams.get('code')!
                break
            }

            await this.bot.utils.wait(2000)
        }

        const body = new URLSearchParams()
        body.append('grant_type', 'authorization_code')
        body.append('client_id', this.clientId)
        body.append('code', code)
        body.append('redirect_uri', this.redirectUrl)

        const tokenRequest: AxiosRequestConfig = {
            url: this.tokenUrl,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: body.toString()
        }

        const tokenResponse = await this.bot.axios.request(tokenRequest)
        const tokenData: OAuth = await tokenResponse.data

        this.bot.log(this.bot.isMobile, 'LOGIN-APP', 'Successfully authorized')
        return tokenData.access_token
    }

    private async checkLocked(page: Page) {
        await this.bot.utils.wait(2000)
        const isLocked = await page.waitForSelector('#serviceAbuseLandingTitle', { state: 'visible', timeout: 1000 }).then(() => true).catch(() => false)
        if (isLocked) {
            throw this.bot.log(this.bot.isMobile, 'CHECK-LOCKED', 'This account has been locked! Remove the account from "accounts.json" and restart!', 'error')
        }
    }
}