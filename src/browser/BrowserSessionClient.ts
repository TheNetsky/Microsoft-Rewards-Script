import type { Cookie, Page } from 'patchright'

import type { BotContext } from '../core/BotContext'
import { buildCookieHeader, filterCookiesForUrl, mergeSetCookies } from '../network/CookieUtils'
import type { HttpRequestConfig, HttpResponse } from '../network/HttpClient'
import type { RequestHeaders } from '../network/RequestHeaders'
import { saveStorageState } from '../session/SessionStore'
import { createSessionState, filterSessionCookies } from '../session/SessionState'
import { synchronizeRewardsCookies } from './RewardsBrowserContext'

const MAX_HOPS = 12
const NAVIGATION_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
const HOP_DROPPED_HEADERS = new Set(['cookie', 'origin', 'referer', 'accept', 'content-type', 'cache-control'])

export interface SessionResponse<T> extends HttpResponse<T> {
    url: string
    hops: string[]
}

function headerValue(headers: Record<string, string | string[]>, name: string): string | undefined {
    const value = headers[name]
    return Array.isArray(value) ? value[0] : value
}

function decodeHtml(value: string): string {
    return value
        .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
}

function attribute(tag: string, name: string): string | undefined {
    const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag)
    const value = match?.[1] ?? match?.[2]
    return value === undefined ? undefined : decodeHtml(value)
}

function autoSubmitForm(html: unknown, pageUrl: string, relyingParty: string): { action: string; body: string } | null {
    if (typeof html !== 'string') return null
    const autoSubmit =
        /<body\b[^>]*\bonload\s*=\s*["'][^"']*submit/i.test(html) ||
        /<form\b[^>]*\b(?:name|id)\s*=\s*["']fmHF["']/i.test(html)
    if (!autoSubmit) return null
    const formMatch = /<form\b[^>]*>/i.exec(html)
    const formTag = formMatch?.[0]
    const rawAction = formTag && attribute(formTag, 'action')
    if (!formMatch || !formTag || !rawAction || (attribute(formTag, 'method') ?? 'get').toLowerCase() !== 'post')
        return null
    const action = new URL(rawAction, pageUrl)
    if (action.origin !== relyingParty) return null
    const body = new URLSearchParams()
    const formEnd = html.indexOf('</form>', formMatch.index)
    const formHtml = html.slice(formMatch.index, formEnd < 0 ? undefined : formEnd)
    for (const input of formHtml.match(/<input\b[^>]*>/gi) ?? []) {
        const name = attribute(input, 'name')
        if (name) body.append(name, attribute(input, 'value') ?? '')
    }
    return body.toString() ? { action: action.toString(), body: body.toString() } : null
}

export class BrowserSessionClient {
    constructor(
        private readonly bot: BotContext,
        private readonly activePage: () => Page | null
    ) {}

    getCachedCookies(explicitCookies?: Cookie[], targetUrl?: string): Cookie[] {
        const cookies = explicitCookies ?? (this.bot.isMobile ? this.bot.cookies.mobile : this.bot.cookies.desktop)
        return targetUrl ? filterCookiesForUrl(cookies, targetUrl) : cookies
    }

    async browserRequest<T>(config: HttpRequestConfig & { url: string }): Promise<SessionResponse<T>> {
        config = { ...config, deadline: config.deadline ?? Date.now() + (config.timeout ?? 20000) }
        const identity: RequestHeaders = Object.fromEntries(
            Object.entries(config.headers ?? {}).filter(([name]) => !HOP_DROPPED_HEADERS.has(name.toLowerCase()))
        )
        let url = config.url
        let method = (config.method ?? 'GET').toUpperCase()
        let data = config.data
        let headers: RequestHeaders = config.headers ?? {}
        const hops: string[] = []

        for (let hop = 0; hop <= MAX_HOPS; hop++) {
            this.bot.signal.throwIfAborted()
            let response: HttpResponse<T>
            try {
                response = await this.bot.http.request<T>({
                    ...config,
                    url,
                    method,
                    data,
                    headers: { ...headers, Cookie: buildCookieHeader(this.getCachedCookies(undefined, url)) },
                    redirect: 'manual'
                })
            } catch (error) {
                const failed = (error as { response?: HttpResponse<T> })?.response
                if (!failed) throw error
                response = failed
            }
            hops.push(`${response.status}@${new URL(url).hostname}`)
            await this.applyResponseCookies(url, response.headers['set-cookie'])

            const location = headerValue(response.headers, 'location')
            const previous = new URL(url)
            if (response.status >= 300 && response.status < 400 && location) {
                url = new URL(location, url).toString()
                if (
                    response.status === 303 ||
                    ((response.status === 301 || response.status === 302) && method !== 'GET')
                ) {
                    method = 'GET'
                    data = undefined
                }
                headers = { ...identity, Accept: NAVIGATION_ACCEPT, Referer: `${previous.origin}/` }
                continue
            }

            const form = autoSubmitForm(response.data, url, new URL(config.url).origin)
            if (form && hop < MAX_HOPS) {
                url = form.action
                method = 'POST'
                data = form.body
                headers = {
                    ...identity,
                    Accept: NAVIGATION_ACCEPT,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Origin: previous.origin,
                    Referer: `${previous.origin}/`
                }
                continue
            }
            return { ...response, url, hops }
        }
        throw new Error(`Too many redirects | hops=${hops.join(' > ')}`)
    }

    async checkpoint(source = 'SESSION-CHECKPOINT'): Promise<boolean> {
        const page = this.activePage()
        if (!page) {
            this.bot.logger.debug(
                this.bot.isMobile,
                source,
                'Could not checkpoint session because no active browser page is available'
            )
            return false
        }

        try {
            await this.persistActiveCookies(page, source, true)
            return true
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                source,
                `Could not checkpoint active session | error=${error instanceof Error ? error.message : String(error)}`
            )
            return false
        }
    }

    async synchronize(source: string): Promise<boolean> {
        const page = this.activePage()
        if (!page) return false

        try {
            const context = page.context()
            await synchronizeRewardsCookies(context)
            const liveCookies = await context.cookies()

            this.updateCache(liveCookies, source)
            return true
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                source,
                `Could not synchronize active browser cookies | error=${error instanceof Error ? error.message : String(error)}`
            )
            return false
        }
    }

    async applyResponseCookies(requestUrl: string, setCookieHeader?: string[] | string): Promise<void> {
        const current = this.bot.isMobile ? this.bot.cookies.mobile : this.bot.cookies.desktop
        const merged = mergeSetCookies(current, requestUrl, setCookieHeader)
        if (!merged.changed) return

        const page = this.activePage()
        if (page) {
            const removed = current.filter(
                cookie => !merged.cookies.some(next => this.cookieKey(next) === this.cookieKey(cookie))
            )
            for (const cookie of removed) {
                await page.context().clearCookies({ name: cookie.name, domain: cookie.domain, path: cookie.path })
            }
            const changed = merged.cookies.filter(
                cookie =>
                    !current.some(
                        old =>
                            this.cookieKey(old) === this.cookieKey(cookie) &&
                            this.cookieState(old) === this.cookieState(cookie)
                    )
            )
            if (changed.length) await page.context().addCookies(changed)
            this.updateCache(await page.context().cookies(), 'COOKIE-SYNC')
        } else {
            this.updateCache(merged.cookies, 'COOKIE-SYNC')
        }

        const email = this.bot.currentAccountEmail
        if (!email) return

        saveStorageState(
            this.bot.config.sessionPath,
            email,
            this.bot.isMobile,
            createSessionState(this.getCachedCookies())
        )
        this.bot.logger.debug(
            this.bot.isMobile,
            'COOKIE-SYNC',
            `Applied ${merged.processed} response cookie(s) and persisted the updated session`
        )
    }

    private async persistActiveCookies(page: Page, source: string, forcePersist = false): Promise<void> {
        try {
            const context = page.context()
            await synchronizeRewardsCookies(context)
            const storageState = createSessionState(await context.cookies())
            const changed = this.updateCache(storageState.cookies, source)
            if (!changed && !forcePersist) return

            const email = this.bot.currentAccountEmail
            if (!email) return

            saveStorageState(this.bot.config.sessionPath, email, this.bot.isMobile, storageState)
            this.bot.logger.debug(
                this.bot.isMobile,
                source,
                `Persisted live browser session | cookies=${storageState.cookies.length} | origins=${storageState.origins.length}`
            )
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                source,
                `Could not persist refreshed cookies | error=${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }

    private updateCache(liveCookies: Cookie[], source: string): boolean {
        liveCookies = filterSessionCookies(liveCookies)
        const cachedCookies = this.bot.isMobile ? this.bot.cookies.mobile : this.bot.cookies.desktop
        const cachedByKey = new Map(cachedCookies.map(cookie => [this.cookieKey(cookie), this.cookieState(cookie)]))
        const changed =
            cachedCookies.length !== liveCookies.length ||
            liveCookies.some(cookie => cachedByKey.get(this.cookieKey(cookie)) !== this.cookieState(cookie))

        if (this.bot.isMobile) this.bot.cookies.mobile = liveCookies
        else this.bot.cookies.desktop = liveCookies

        if (changed) {
            this.bot.logger.debug(
                this.bot.isMobile,
                source,
                `Refreshed cookie cache | previous=${cachedCookies.length} | current=${liveCookies.length}`
            )
        }

        return changed
    }

    private cookieKey(cookie: Cookie): string {
        return `${cookie.domain}|${cookie.path}|${cookie.name}`
    }

    private cookieState(cookie: Cookie): string {
        return JSON.stringify({
            value: cookie.value,
            expires: cookie.expires,
            httpOnly: cookie.httpOnly,
            secure: cookie.secure,
            sameSite: cookie.sameSite
        })
    }
}
