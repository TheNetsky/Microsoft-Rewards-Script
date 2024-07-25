import { Page } from 'playwright'
import readline from 'readline'

import { MicrosoftRewardsBot } from '../index'
import { saveSessionData } from '../util/Load'
import axios from 'axios'
import { OAuth } from '../interface/OAuth'
import * as crypto from 'crypto'

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})


export class Login {
    private bot: MicrosoftRewardsBot;
    private clientId: string    = '0000000040170455';
    private authBaseUrl: string = 'https://login.live.com/oauth20_authorize.srf';
    private redirectUrl: string = 'https://login.live.com/oauth20_desktop.srf';
    private tokenUrl: string    = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
    private scope: string       = 'service::prod.rewardsplatform.microsoft.com::MBI_SSL';

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    async login(page: Page, email: string, password: string) {

        try {
            // Navigate to the Bing login page
            await page.goto('https://rewards.bing.com/signin')

            const isLoggedIn = await page.waitForSelector('html[data-role-name="RewardsPortal"]', { timeout: 10_000 }).then(() => true).catch(() => false)

            if (!isLoggedIn) {
                // Check if account is locked
                const isLocked = await page.waitForSelector('.serviceAbusePageContainer', { state: 'visible', timeout: 1000 }).then(() => true).catch(() => false)
                if (isLocked) {
                    this.bot.log('LOGIN', 'This account has been locked!', 'error')
                    throw new Error('Account has been locked!')
                }

                await this.execLogin(page, email, password)
                this.bot.log('LOGIN', 'Logged into Microsoft successfully')
            } else {
                this.bot.log('LOGIN', 'Already logged in')
            }

            // Check if logged in to bing
            await this.checkBingLogin(page)

            // Save session
            await saveSessionData(this.bot.config.sessionPath, page.context(), email, this.bot.isMobile)

            // We're done logging in
            this.bot.log('LOGIN', 'Logged in successfully')

        } catch (error) {
            // Throw and don't continue
            throw this.bot.log('LOGIN', 'An error occurred:' + error, 'error')
        }
    }

    private async execLogin(page: Page, email: string, password: string) {
        try {
            // Enter email
            await page.fill('#i0116', email)
            await page.click('#idSIButton9')

            this.bot.log('LOGIN', 'Email entered successfully')

            try {
                // Enter password
                await page.waitForSelector('#i0118', { state: 'visible', timeout: 2000 })
                await this.bot.utils.wait(2000)

                await page.fill('#i0118', password)
                await page.click('#idSIButton9')

                this.bot.log('LOGIN', 'Password entered successfully')

                // When erroring at this stage it means a 2FA code is required
            } catch (error) {
                // this.bot.log('LOGIN', 'App approval required because you have passwordless enabled.');

                let numberToPress: string | null = await (await page.waitForSelector('#displaySign', { state: 'visible', timeout: 2000 })).textContent();

                if (!numberToPress) {
                    await page.click('button[aria-describedby="confirmSendTitle"]');
                    await this.bot.utils.wait(2000);
                    numberToPress = await (await page.waitForSelector('#displaySign', { state: 'visible', timeout: 2000 })).textContent();
                }

                if (numberToPress) {
                    while (true) {
                        try {
                            this.bot.log('LOGIN', 'Press the number below on your Authenticator app to approve the login');
                            this.bot.log('LOGIN', 'If you press the wrong number or the "Deny" button, try again in 60 seconds');
                            this.bot.log('LOGIN', 'Number to press: ' + numberToPress);
                            await page.waitForSelector('#i0281', { state: 'detached', timeout: 60000 })
                            break;
                        } catch (error) {
                            this.bot.log('LOGIN', 'The code is expired. Trying to get the new code...');
                            (await page.waitForSelector('button[aria-describedby="pushNotificationsTitle errorDescription"]', { state: 'visible', timeout: 5000 })).click();
                            numberToPress = await (await page.waitForSelector('#displaySign', { state: 'visible', timeout: 2000 })).textContent();
                        }
                    }
                    this.bot.log('LOGIN', 'Login successfully approved!');
                } else {
                    this.bot.log('LOGIN', '2FA code required')
                    // Wait for user input
                    const code = await new Promise<string>((resolve) => {
                        rl.question('Enter 2FA code:\n', (input) => {
                            rl.close()
                            resolve(input)
                        })
                    })
    
                    await page.fill('input[name="otc"]', code)
                    await page.keyboard.press('Enter')

                }
            }

        } catch (error) {
            this.bot.log('LOGIN', 'An error occurred:' + error, 'error')
        }

        const currentURL = new URL(page.url())

        while (currentURL.pathname !== '/' || currentURL.hostname !== 'rewards.bing.com') {
            await this.bot.browser.utils.tryDismissAllMessages(page)
            currentURL.href = page.url()
        }

        // Wait for login to complete
        await page.waitForSelector('html[data-role-name="RewardsPortal"]', { timeout: 10_000 })
    }

    private async checkBingLogin(page: Page): Promise<void> {
        try {
            this.bot.log('LOGIN-BING', 'Verifying Bing login')
            await page.goto('https://www.bing.com/fd/auth/signin?action=interactive&provider=windows_live_id&return_url=https%3A%2F%2Fwww.bing.com%2F')

            const maxIterations = 5

            for (let iteration = 1; iteration <= maxIterations; iteration++) {
                const currentUrl = new URL(page.url())

                if (currentUrl.hostname === 'www.bing.com' && currentUrl.pathname === '/') {
                    await this.bot.browser.utils.tryDismissBingCookieBanner(page)

                    const loggedIn = await this.checkBingLoginStatus(page)
                    // If mobile browser, skip this step
                    if (loggedIn || this.bot.isMobile) {
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
            await page.waitForSelector('#id_n', { timeout: 5000 })
            return true
        } catch (error) {
            return false
        }
    }

    async getMobileAccessToken(page: Page, email: string) {

        let authorizeUrl = new URL(this.authBaseUrl);
        authorizeUrl.searchParams.append('response_type', 'code');
        authorizeUrl.searchParams.append('client_id', this.clientId);
        authorizeUrl.searchParams.append('redirect_uri', this.redirectUrl);
        authorizeUrl.searchParams.append('scope', this.scope);
        authorizeUrl.searchParams.append('state', crypto.randomBytes(16).toString('hex'));
        authorizeUrl.searchParams.append('access_type', 'offline_access');
        authorizeUrl.searchParams.append('login_hint', email);

        await page.goto(authorizeUrl.href);

        const currentUrl = new URL(page.url());
        let code : string;
        
        while (true) {
            this.bot.log("LOGIN-APP", "Waiting for authorization");
            if (currentUrl.hostname === 'login.live.com' && currentUrl.pathname === '/oauth20_desktop.srf') {
                code = currentUrl.searchParams.get('code')!;
                break;
            }
        }

        const body = new URLSearchParams();
        body.append('grant_type', 'authorization_code');
        body.append('client_id', this.clientId);
        body.append('code', code);
        body.append('redirect_uri', this.redirectUrl);

        const tokenRequest = {
            url: this.tokenUrl,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: body.toString()
        }

        const tokenResponse = await axios(tokenRequest);
        const tokenData : OAuth = await tokenResponse.data;
        
        this.bot.log("LOGIN-APP", "Successfully authorized");
        return tokenData.access_token;
    }
}