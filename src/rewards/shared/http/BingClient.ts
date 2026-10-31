import { browserTimeout } from '../../../browser/BrowserTiming'
import type { SessionResponse } from '../../../browser/BrowserSessionClient'
import { URLs } from '../../../constants/urls'
import type { BotContext } from '../../../core/BotContext'
import { HttpError } from '../../../network/HttpError'
import type { HttpRequestConfig } from '../../../network/HttpClient'
import { localeRequestHeaders } from '../../../network/RequestHeaders'

export class BingClient {
    constructor(private readonly bot: BotContext) {}

    async request<T = unknown>(config: HttpRequestConfig & { url: string }): Promise<SessionResponse<T>> {
        if (new URL(config.url).origin !== URLs.bing.origin) throw new Error('Expected a Bing request URL')
        this.bot.signal.throwIfAborted()
        const response = await this.bot.sessionState.browserRequest<T>({
            timeout: browserTimeout(this.bot),
            ...config,
            headers: {
                ...this.bot.browser.userAgentManager.getRequestHeaders(this.bot.isMobile),
                ...localeRequestHeaders(this.bot.accountLocale.acceptLanguage),
                ...config.headers
            }
        })
        this.bot.signal.throwIfAborted()
        if (response.status < 200 || response.status >= 300) throw new HttpError(response.status, response)
        if (new URL(response.url).origin !== URLs.bing.origin)
            throw new Error('Bing request left the authenticated Bing session')
        return response
    }
}
