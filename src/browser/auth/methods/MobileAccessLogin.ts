import type { Page } from 'patchright'
import { randomBytes } from 'crypto'
import { URLSearchParams } from 'url'
import type { AxiosRequestConfig } from 'axios'

import type { MicrosoftRewardsBot } from '../../../index'

export class MobileAccessLogin {
    private clientId = '0000000040170455'
    private authUrl = 'https://login.live.com/oauth20_authorize.srf'
    private redirectUrl = 'https://login.live.com/oauth20_desktop.srf'
    private tokenUrl = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
    private scope = 'service::prod.rewardsplatform.microsoft.com::MBI_SSL'
    private maxTimeout = 180_000 // 3min

    constructor(
        private bot: MicrosoftRewardsBot,
        private page: Page
    ) {}

    async get(email: string): Promise<string> {
        try {
            const authorizeUrl = new URL(this.authUrl)
            authorizeUrl.searchParams.append('response_type', 'code')
            authorizeUrl.searchParams.append('client_id', this.clientId)
            authorizeUrl.searchParams.append('redirect_uri', this.redirectUrl)
            authorizeUrl.searchParams.append('scope', this.scope)
            authorizeUrl.searchParams.append('state', randomBytes(16).toString('hex'))
            authorizeUrl.searchParams.append('access_type', 'offline_access')
            authorizeUrl.searchParams.append('login_hint', email)

            await this.bot.browser.utils.disableFido(this.page)

            await this.page.goto(authorizeUrl.href).catch(() => {})

            this.bot.logger.info(this.bot.isMobile, 'LOGIN-APP', 'Waiting for mobile OAuth code...')
            const start = Date.now()
            let code = ''

            while (Date.now() - start < this.maxTimeout) {
                const url = new URL(this.page.url())
                if (url.hostname === 'login.live.com' && url.pathname === '/oauth20_desktop.srf') {
                    code = url.searchParams.get('code') || ''
                    if (code) break
                }
                await this.bot.utils.wait(1000)
            }

            if (!code) {
                this.bot.logger.warn(this.bot.isMobile, 'LOGIN-APP', 'Timed out waiting for OAuth code')
                return ''
            }

            const data = new URLSearchParams()
            data.append('grant_type', 'authorization_code')
            data.append('client_id', this.clientId)
            data.append('code', code)
            data.append('redirect_uri', this.redirectUrl)

            const request: AxiosRequestConfig = {
                url: this.tokenUrl,
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                data: data.toString()
            }

            const response = await this.bot.axios.request(request)
            const token = (response?.data?.access_token as string) ?? ''

            if (!token) {
                this.bot.logger.warn(this.bot.isMobile, 'LOGIN-APP', 'No access_token in token response')
                return ''
            }

            this.bot.logger.info(this.bot.isMobile, 'LOGIN-APP', 'Mobile access token received')
            return token
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'LOGIN-APP',
                `MobileAccess error: ${error instanceof Error ? error.message : String(error)}`
            )
            return ''
        } finally {
            await this.page.goto(this.bot.config.baseURL, { timeout: 10000 }).catch(() => {})
        }
    }
}
