import { randomBytes } from 'crypto'
import type { Page } from 'patchright'
import { URLSearchParams } from 'url'

import { URLs } from '../../../constants/urls'
import type { MicrosoftRewardsBot } from '../../../index'

interface TokenResponse {
    access_token?: string
    error?: string
    error_description?: string
}

export class MobileAccessLogin {
    private clientId = '0000000040170455'
    private authUrl = URLs.auth.oauthAuthorize
    private redirectUrl = URLs.auth.oauthRedirect
    private tokenUrl = URLs.auth.oauthToken
    private scope = 'service::prod.rewardsplatform.microsoft.com::MBI_SSL'

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

            this.bot.logger.debug(
                this.bot.isMobile,
                'LOGIN-APP',
                `Auth URL constructed: ${authorizeUrl.origin}${authorizeUrl.pathname}`
            )

            let code = await this.resolveCodeViaRequest(authorizeUrl)
            if (!code) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'LOGIN-APP',
                    'Request-based OAuth did not return a code, retrying through the active browser context'
                )
                code = await this.resolveCodeViaBrowser(authorizeUrl)
            }

            if (!code) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'LOGIN-APP',
                    'Could not resolve mobile OAuth code - app activities will be skipped this run'
                )
                return ''
            }

            this.bot.logger.debug(this.bot.isMobile, 'LOGIN-APP', 'OAuth code resolved, exchanging for access token')

            const data = new URLSearchParams()
            data.append('grant_type', 'authorization_code')
            data.append('client_id', this.clientId)
            data.append('code', code)
            data.append('redirect_uri', this.redirectUrl)
            data.append('scope', this.scope)

            const response = await this.bot.http.request<TokenResponse>({
                url: this.tokenUrl,
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                data: data.toString()
            })

            const token = response?.data?.access_token ?? ''
            if (!token) {
                const error = response?.data?.error ?? 'unknown_error'
                const description = response?.data?.error_description ?? 'No access_token in token response'
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'LOGIN-APP',
                    `Mobile token exchange failed | error=${error} | description=${description}`
                )
                return ''
            }

            this.bot.logger.info(this.bot.isMobile, 'LOGIN-APP', 'Mobile access token received')
            return token
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'LOGIN-APP',
                `MobileAccess error: ${error instanceof Error ? error.stack || error.message : String(error)}`
            )
            return ''
        }
    }

    private async resolveCodeViaRequest(authorizeUrl: URL): Promise<string> {
        try {
            this.bot.logger.debug(this.bot.isMobile, 'LOGIN-APP', 'Resolving mobile OAuth code via request')

            const response = await this.page.request.get(authorizeUrl.href, { maxRedirects: 20, timeout: 30000 })
            const finalUrl = response.url()

            this.bot.logger.debug(
                this.bot.isMobile,
                'LOGIN-APP',
                `OAuth request resolved → ${this.safeUrl(finalUrl)} (status ${response.status()})`
            )

            return this.extractCode(finalUrl)
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'LOGIN-APP',
                `OAuth code request failed: ${error instanceof Error ? error.message : String(error)}`
            )
            return ''
        }
    }

    private async resolveCodeViaBrowser(authorizeUrl: URL): Promise<string> {
        let oauthPage: Page | null = null

        try {
            oauthPage = await this.page.context().newPage()
            await oauthPage.goto(authorizeUrl.href, { waitUntil: 'domcontentloaded', timeout: 30000 })

            let code = this.extractCode(oauthPage.url())
            if (code) return code

            await oauthPage
                .waitForURL(url => url.pathname.toLowerCase() === '/oauth20_desktop.srf', { timeout: 30000 })
                .catch(() => {})

            code = this.extractCode(oauthPage.url())
            this.bot.logger.debug(
                this.bot.isMobile,
                'LOGIN-APP',
                `OAuth browser resolved → ${this.safeUrl(oauthPage.url())} | code=${code ? 'present' : 'missing'}`
            )

            return code
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'LOGIN-APP',
                `OAuth browser fallback failed: ${error instanceof Error ? error.message : String(error)}`
            )
            return ''
        } finally {
            await oauthPage?.close().catch(() => {})
        }
    }

    private extractCode(rawUrl: string): string {
        try {
            const url = new URL(rawUrl)
            if (url.pathname.toLowerCase() !== '/oauth20_desktop.srf') return ''
            return url.searchParams.get('code') ?? ''
        } catch {
            return ''
        }
    }

    private safeUrl(rawUrl: string): string {
        try {
            const url = new URL(rawUrl)
            const error = url.searchParams.get('error')
            return `${url.origin}${url.pathname}${error ? `?error=${encodeURIComponent(error)}` : ''}`
        } catch {
            return '(invalid URL)'
        }
    }
}
