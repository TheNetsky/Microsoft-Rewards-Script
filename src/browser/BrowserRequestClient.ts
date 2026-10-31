import { HttpError } from '../network/HttpError'
import type { BrowserContext, Page, Request, Response } from 'patchright'

import type { BotContext } from '../core/BotContext'
import { sanitizeForBrowserFetch } from '../network/RequestHeaders'
import { mergeRequestHeaders } from '../network/HttpClient'
import { URLs } from '../constants/urls'
import { BrowserTaskPage } from './BrowserTaskPage'
import { browserTimeout } from './BrowserTiming'
import { createRewardsTaskContext, findRewardsPage, synchronizeRewardsCookies } from './RewardsBrowserContext'
import { closeBrowserPage, isPageAvailableForRequest, usingBrowserPage } from './BrowserPageRequests'

export interface BrowserRequestConfig {
    maxResponseBytes?: number
    timeout?: number
    url: string
    method: 'GET' | 'POST'
    headers: Record<string, string>
    body?: string
    responseType?: 'json' | 'text'
    pageOwnership?: 'observe' | 'own' | 'background'
    allowNodeFallback?: boolean
}

export interface BrowserRequestResponse<T> {
    status: number
    data: T
    headers: Record<string, string | string[]>
    via: 'in-page' | 'node-http'
}

export class BrowserRequestClient {
    private readonly helperPagesByContext = new WeakMap<BrowserContext, Map<string, Page>>()
    private readonly pendingHelperPages = new WeakMap<BrowserContext, Map<string, Promise<Page | null>>>()
    private readonly tornDownContexts = new WeakSet<BrowserContext>()
    private readonly helperRequests = new WeakMap<Page, Promise<unknown>>()

    constructor(
        private readonly bot: BotContext,
        private readonly activePage: () => Page | null
    ) {}

    async request<T = unknown>(config: BrowserRequestConfig, ownedPage?: Page): Promise<BrowserRequestResponse<T>> {
        this.bot.signal.throwIfAborted()

        if (ownedPage) return this.requestUsingPage<T>({ ...config, pageOwnership: 'own' }, ownedPage)
        const activePage = this.activePage()
        if (activePage && config.pageOwnership !== 'background' && new URL(config.url).origin === URLs.rewards.origin) {
            const task = await BrowserTaskPage.createRewards(activePage)
            try {
                return await this.requestUsingPage<T>({ ...config, pageOwnership: 'own' }, task.page)
            } finally {
                await task.close()
            }
        }
        return this.requestUsingPage<T>(config, activePage)
    }

    private async requestUsingPage<T>(
        config: BrowserRequestConfig,
        activePage: Page | null
    ): Promise<BrowserRequestResponse<T>> {
        const targetOrigin = new URL(config.url).origin
        const ownership = config.pageOwnership ?? 'observe'

        let fetchPage: Page | null
        if (ownership === 'own' && activePage) {
            try {
                if (new URL(activePage.url()).origin !== targetOrigin) {
                    await activePage.goto(config.url, {
                        waitUntil: 'domcontentloaded',
                        timeout: browserTimeout(this.bot, 'navigation')
                    })
                }
                fetchPage = activePage
            } catch {
                fetchPage = null
            }
        } else {
            fetchPage = await this.acquireHelperPage(targetOrigin, activePage, ownership === 'background')
        }

        if (fetchPage) {
            const page = fetchPage
            return usingBrowserPage(page, async () => {
                if (
                    ownership !== 'background' &&
                    targetOrigin === URLs.rewards.origin &&
                    !new URL(config.url).pathname.startsWith('/_next/')
                )
                    await this.bot.browser.utils.dismissMessages(page)
                const source = activePage?.context()
                const fetch = async () => {
                    this.bot.signal.throwIfAborted()
                    await synchronizeRewardsCookies(page.context())
                    try {
                        return await this.fetchUsingPage<T>(config, page)
                    } finally {
                        await synchronizeRewardsCookies(page.context())
                    }
                }
                if (source && this.helperPagesByContext.get(source)?.get(targetOrigin) === page) {
                    const request = (this.helperRequests.get(page) ?? Promise.resolve())
                        .catch(() => undefined)
                        .then(fetch)
                    this.helperRequests.set(page, request)
                    try {
                        return await request
                    } finally {
                        if (this.helperRequests.get(page) === request) this.helperRequests.delete(page)
                    }
                }
                return fetch()
            })
        }

        if (activePage) throw new Error(`No usable in-page fetch context for ${config.url}`)
        if (config.allowNodeFallback !== true) throw new Error(`Browser page required for ${config.url}`)

        const response = await this.bot.http.request<T>({
            url: config.url,
            method: config.method,
            headers: mergeRequestHeaders(
                config.headers,
                this.bot.browser.userAgentManager.getRequestHeaders(
                    this.bot.isMobile,
                    !this.bot.isMobile || targetOrigin === URLs.rewards.origin
                )
            ),
            data: config.body,
            responseType: config.responseType ?? 'json',
            timeout: config.timeout,
            maxResponseBytes: config.maxResponseBytes
        })
        return {
            status: response.status,
            data: response.data,
            headers: response.headers,
            via: 'node-http'
        }
    }

    private async fetchUsingPage<T>(config: BrowserRequestConfig, fetchPage: Page): Promise<BrowserRequestResponse<T>> {
        const signal = this.bot.signal
        signal.throwIfAborted()
        const controller = await fetchPage.evaluateHandle(() => new AbortController())
        const abort = () => {
            void controller.evaluate(value => value.abort()).catch(() => undefined)
        }
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) abort()
        let networkError: string | undefined
        let redirect: string | undefined
        const belongsToFetch = (request: Request): boolean => {
            let initial = request
            while (initial.redirectedFrom()) initial = initial.redirectedFrom()!
            return initial.url() === config.url && initial.method() === config.method
        }
        const onFailed = (request: Request) => {
            if (belongsToFetch(request)) networkError = request.failure()?.errorText
        }
        const onResponse = (response: Response) => {
            if (response.status() < 300 || response.status() >= 400 || !belongsToFetch(response.request())) return
            const location = response.headers().location
            if (location) {
                try {
                    redirect = `${response.status()} ${new URL(location, response.url()).origin}`
                } catch {
                    redirect = `${response.status()} invalid-location`
                }
            }
        }
        fetchPage.on('requestfailed', onFailed)
        fetchPage.on('response', onResponse)
        const evalPayload = {
            url: config.url,
            method: config.method,
            timeout: config.timeout ?? browserTimeout(this.bot),
            maxResponseBytes: config.maxResponseBytes ?? 16 * 1024 * 1024,
            headers: sanitizeForBrowserFetch(config.headers),
            body: config.body ?? null
        }
        const result = await fetchPage
            .evaluate(
                async ({ payload, controller }) => {
                    let blockedDirective: string | undefined
                    const onPolicyViolation = (event: SecurityPolicyViolationEvent) => {
                        if (
                            event.effectiveDirective === 'connect-src' &&
                            event.disposition === 'enforce' &&
                            (event.blockedURI === payload.url || event.blockedURI === new URL(payload.url).origin)
                        )
                            blockedDirective = event.effectiveDirective
                    }
                    document.addEventListener('securitypolicyviolation', onPolicyViolation)
                    try {
                        if (location.origin !== new URL(payload.url).origin)
                            throw new Error('Request page navigated away from the target origin')
                        const init: RequestInit = {
                            method: payload.method,
                            headers: payload.headers,
                            credentials: 'include',
                            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(payload.timeout)])
                        }
                        if (payload.body !== null) init.body = payload.body

                        const response = await fetch(payload.url, init)
                        const reader = response.body?.getReader()
                        const chunks: Uint8Array[] = []
                        let size = 0
                        try {
                            if (reader)
                                while (true) {
                                    const item = await reader.read()
                                    if (item.done) break
                                    size += item.value.byteLength
                                    if (size > payload.maxResponseBytes)
                                        throw new Error('Response exceeds configured byte limit')
                                    chunks.push(item.value)
                                }
                        } catch (error) {
                            await reader?.cancel().catch(() => undefined)
                            throw error
                        } finally {
                            reader?.releaseLock()
                        }
                        const bytes = new Uint8Array(size)
                        let offset = 0
                        for (const chunk of chunks) {
                            bytes.set(chunk, offset)
                            offset += chunk.byteLength
                        }
                        const text = new TextDecoder().decode(bytes)
                        const headers: Record<string, string> = {}
                        response.headers.forEach((value, key) => {
                            headers[key.toLowerCase()] = value
                        })
                        return { ok: true as const, status: response.status, headers, body: text }
                    } catch (error) {
                        return {
                            ok: false as const,
                            error: error instanceof Error ? error.message : String(error),
                            errorName: error instanceof Error ? error.name : 'unknown',
                            pageOrigin: location.origin,
                            online: navigator.onLine,
                            blockedDirective
                        }
                    } finally {
                        document.removeEventListener('securitypolicyviolation', onPolicyViolation)
                    }
                },
                { payload: evalPayload, controller }
            )
            .catch((error: unknown) => ({
                ok: false as const,
                error: error instanceof Error ? error.message : String(error),
                errorName: error instanceof Error ? error.name : 'unknown',
                pageOrigin: new URL(fetchPage.url()).origin,
                online: undefined,
                blockedDirective: undefined
            }))
            .finally(async () => {
                signal.removeEventListener('abort', abort)
                fetchPage.off('requestfailed', onFailed)
                fetchPage.off('response', onResponse)
                await controller.dispose().catch(() => undefined)
            })

        signal.throwIfAborted()
        if (result.ok) {
            if (result.status === 429) {
                this.bot.accountState.defer('Service rate limit during browser request')
                throw new HttpError(result.status, result)
            }
            let data: unknown = result.body
            if (config.responseType !== 'text') {
                try {
                    data = JSON.parse(result.body)
                } catch {
                    data = result.body
                }
            }
            return {
                status: result.status,
                data: data as T,
                headers: result.headers,
                via: 'in-page'
            }
        }

        this.bot.logger.debug(
            this.bot.isMobile,
            'BROWSER-FETCH',
            `In-page fetch failed | url=${config.url} | error=${result.error}` +
                ` | pageOrigin=${result.pageOrigin} | errorName=${result.errorName}` +
                ` | online=${result.online ?? 'unknown'} | networkError=${networkError ?? 'unavailable'}` +
                ` | redirect=${redirect ?? 'none-observed'} | blockedDirective=${result.blockedDirective ?? 'none-observed'}`
        )
        throw new Error(`In-page fetch failed for ${config.url}: ${result.error}`)
    }

    async closeHelperPages(context: BrowserContext): Promise<void> {
        this.tornDownContexts.add(context)

        const pending = this.pendingHelperPages.get(context)
        if (pending) {
            const inFlight = Array.from(pending.values())
            await Promise.allSettled(
                inFlight.map(async job => {
                    try {
                        const page = await job
                        if (page) {
                            await this.helperRequests.get(page)?.catch(() => undefined)
                            await closeBrowserPage(page)
                        }
                    } catch {
                        // Ignore
                    }
                })
            )
        }
        this.pendingHelperPages.delete(context)

        const pages = this.helperPagesByContext.get(context)
        if (pages) {
            for (const page of pages.values()) {
                try {
                    await this.helperRequests.get(page)?.catch(() => undefined)
                    await closeBrowserPage(page)
                } catch {
                    // Ignore
                }
            }
        }
        this.helperPagesByContext.delete(context)
    }

    private async acquireHelperPage(origin: string, activePage: Page | null, background = false): Promise<Page | null> {
        let context: BrowserContext | null = null
        if (activePage) {
            try {
                context = activePage.context()
            } catch {
                // Ignore
            }
        }
        if (!context || this.tornDownContexts.has(context)) return null
        const acquiring = this.pendingHelperPages.get(context)?.get(origin)
        if (acquiring) return acquiring
        if (background) {
            const existing =
                origin === URLs.rewards.origin
                    ? findRewardsPage(context)
                    : context
                          .pages()
                          .find(page => isPageAvailableForRequest(page) && new URL(page.url()).origin === origin)
            if (existing) return existing
        }

        let pages = this.helperPagesByContext.get(context)
        if (pages) {
            const cached = pages.get(origin)
            if (cached) {
                try {
                    if (!background && isPageAvailableForRequest(cached) && new URL(cached.url()).origin === origin)
                        return cached
                } catch {
                    // Ignore
                }
                pages.delete(origin)
                await closeBrowserPage(cached).catch(() => undefined)
            }
        } else {
            pages = new Map()
            this.helperPagesByContext.set(context, pages)
        }

        let pending = this.pendingHelperPages.get(context)
        if (!pending) {
            pending = new Map()
            this.pendingHelperPages.set(context, pending)
        }
        const inFlight = pending.get(origin)
        if (inFlight) return inFlight

        const pageMap = pages
        const pendingMap = pending
        const job = (async (): Promise<Page | null> => {
            let helperContext: BrowserContext | null = null
            let page: Page | null = null
            try {
                if (background && origin === URLs.rewards.origin)
                    helperContext = await createRewardsTaskContext(context)
                if (this.tornDownContexts.has(context)) return null
                page = await (helperContext ?? context).newPage()
                let navigated = true
                try {
                    await page.goto(origin === URLs.rewards.origin ? URLs.rewards.earn : origin, {
                        waitUntil: 'domcontentloaded',
                        timeout: browserTimeout(this.bot, 'navigation')
                    })
                } catch (error) {
                    navigated = false
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'BROWSER-FETCH',
                        `Helper page navigation failed | origin=${origin} | ${error instanceof Error ? error.message : String(error)}`
                    )
                }

                let landed = false
                try {
                    landed = navigated && new URL(page.url()).origin === origin
                } catch {
                    landed = false
                }

                if (landed && !this.tornDownContexts.has(context)) {
                    if (origin === URLs.rewards.origin) await this.bot.browser.utils.dismissMessages(page)
                    if (helperContext) await synchronizeRewardsCookies(helperContext)
                    if (this.tornDownContexts.has(context)) return null
                    pageMap.set(origin, page)
                    return page
                }

                return null
            } catch (error) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'BROWSER-FETCH',
                    `Could not open helper page | origin=${origin} | ${error instanceof Error ? error.message : String(error)}`
                )
                return null
            } finally {
                if (!page || pageMap.get(origin) !== page) {
                    if (page) await closeBrowserPage(page).catch(() => undefined)
                }
                pendingMap.delete(origin)
            }
        })()

        pending.set(origin, job)
        return job
    }
}
