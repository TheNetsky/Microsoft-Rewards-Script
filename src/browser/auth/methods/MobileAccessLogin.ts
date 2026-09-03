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
                `认证URL构建完成: ${authorizeUrl.origin}${authorizeUrl.pathname}`
            )

            let code = await this.resolveCodeViaRequest(authorizeUrl)
            if (!code) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'LOGIN-APP',
                    '基于请求的OAuth未返回代码，通过当前浏览器上下文重试'
                )
                code = await this.resolveCodeViaBrowser(authorizeUrl)
            }

            if (!code) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'LOGIN-APP',
                    '无法解析移动OAuth代码 - 本次运行将跳过应用活动'
                )
                return ''
            }

            this.bot.logger.debug(this.bot.isMobile, 'LOGIN-APP', '已解析OAuth代码，正在交换访问令牌')

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
                    `移动令牌交换失败 | error=${error} | description=${description}`
                )
                return ''
            }

            this.bot.logger.info(this.bot.isMobile, 'LOGIN-APP', '移动访问令牌已接收')
            return token
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'LOGIN-APP',
                `MobileAccess错误: ${error instanceof Error ? error.stack || error.message : String(error)}`
            )
            return ''
        }
    }

    private async resolveCodeViaRequest(authorizeUrl: URL): Promise<string> {
        try {
            this.bot.logger.debug(this.bot.isMobile, 'LOGIN-APP', '通过请求解析移动OAuth代码')

            const response = await this.page.request.get(authorizeUrl.href, { maxRedirects: 20, timeout: 30000 })
            const finalUrl = response.url()

            this.bot.logger.debug(
                this.bot.isMobile,
                'LOGIN-APP',
                `OAuth请求解析完成 → ${this.safeUrl(finalUrl)} (状态 ${response.status()})`
            )

            return this.extractCode(finalUrl)
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'LOGIN-APP',
                `OAuth代码请求失败: ${error instanceof Error ? error.message : String(error)}`
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
                `OAuth浏览器解析完成 → ${this.safeUrl(oauthPage.url())} | code=${code ? 'present' : 'missing'}`
            )

            return code
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'LOGIN-APP',
                `OAuth浏览器回退失败: ${error instanceof Error ? error.message : String(error)}`
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
