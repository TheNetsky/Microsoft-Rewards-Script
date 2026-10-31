import { setTimeout as delay } from 'node:timers/promises'
import { HttpError } from './HttpError'
import { Impit } from 'impit'
import type { HttpMethod, ImpitResponse, RequestInit as ImpitRequestInit } from 'impit'
import type { AccountProxy } from '../core/Account'
import { parseBrowserProxyUrl } from '../../scripts/lib/proxy.cjs'
import type { RequestHeaders } from './RequestHeaders'

const DEFAULT_TIMEOUT = 20000
const MAX_RETRIES = 3
const RETRY_BASE_DELAY = 1000

export interface HttpRequestConfig {
    signal?: AbortSignal
    deadline?: number
    url?: string
    method?: string
    headers?: RequestHeaders
    params?: Record<string, string> | URLSearchParams
    data?: unknown
    timeout?: number
    responseType?: 'json' | 'text'
    retries?: number
    maxResponseBytes?: number
    redirect?: 'follow' | 'manual'
}

export interface HttpResponse<T = unknown> {
    data: T
    status: number
    statusText: string
    headers: Record<string, string | string[]>
    config: HttpRequestConfig
}

export function mergeRequestHeaders(
    defaultHeaders: RequestHeaders,
    requestHeaders: RequestHeaders = {}
): RequestHeaders {
    const merged = { ...defaultHeaders }

    for (const [key, value] of Object.entries(requestHeaders)) {
        const existingKey = Object.keys(merged).find(name => name.toLowerCase() === key.toLowerCase())
        if (existingKey) delete merged[existingKey]
        merged[key] = value
    }

    return merged
}

function toInit(config: HttpRequestConfig): { url: string; init: ImpitRequestInit } {
    let url = config.url ?? ''
    if (config.params) {
        const qs =
            config.params instanceof URLSearchParams
                ? config.params.toString()
                : new URLSearchParams(config.params).toString()
        if (qs) url += (url.includes('?') ? '&' : '?') + qs
    }

    const headers: Record<string, string> = {}
    if (config.headers) {
        for (const [key, value] of Object.entries(config.headers)) {
            if (value === undefined || value === null) continue
            headers[key] = Array.isArray(value) ? value.join(', ') : String(value)
        }
    }

    let body: ImpitRequestInit['body']
    const data = config.data
    if (data !== undefined && data !== null) {
        if (
            typeof data === 'string' ||
            data instanceof URLSearchParams ||
            data instanceof Uint8Array ||
            data instanceof ArrayBuffer
        ) {
            body = data
        } else {
            body = JSON.stringify(data)
            if (!Object.keys(headers).some(h => h.toLowerCase() === 'content-type')) {
                headers['Content-Type'] = 'application/json'
            }
        }
    }

    const init: ImpitRequestInit = {
        signal: config.signal,
        method: (config.method ?? 'GET').toUpperCase() as HttpMethod,
        headers,
        body,
        timeout: config.timeout ?? DEFAULT_TIMEOUT,
        ...(config.redirect ? { redirect: config.redirect } : {})
    }

    return { url, init }
}

async function toResponse<T>(res: ImpitResponse, config: HttpRequestConfig): Promise<HttpResponse<T>> {
    const limit = config.maxResponseBytes ?? 16 * 1024 * 1024
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    const signal = config.signal
    let rejectAbort: (reason: unknown) => void = () => undefined
    const aborted = new Promise<never>((_, reject) => {
        rejectAbort = reject
    })
    const cancel = (): void => {
        rejectAbort(signal?.reason ?? new Error('Request aborted'))
        void reader.cancel().catch(() => undefined)
    }
    signal?.addEventListener('abort', cancel, { once: true })
    try {
        signal?.throwIfAborted()
        while (true) {
            const item = await Promise.race([reader.read(), aborted])
            signal?.throwIfAborted()
            if (item.done) break
            size += item.value.byteLength
            if (size > limit) throw new RangeError('Response exceeds configured byte limit')
            chunks.push(item.value)
        }
    } catch (error) {
        void reader.cancel().catch(() => undefined)
        throw error
    } finally {
        signal?.removeEventListener('abort', cancel)
    }
    const text = Buffer.concat(chunks).toString('utf8')

    let data: unknown = text
    if (config.responseType !== 'text') {
        try {
            data = JSON.parse(text)
        } catch {
            data = text
        }
    }

    const headers: Record<string, string | string[]> = {}
    res.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value
    })

    const withSetCookie = res.headers as Headers & { getSetCookie?: () => string[] }
    const setCookie = typeof withSetCookie.getSetCookie === 'function' ? withSetCookie.getSetCookie() : undefined
    if (setCookie && setCookie.length) headers['set-cookie'] = setCookie

    return {
        data: data as T,
        status: res.status,
        statusText: res.statusText,
        headers,
        config
    }
}

async function send<T>(instance: Impit, config: HttpRequestConfig): Promise<HttpResponse<T>> {
    const method = (config.method ?? 'GET').toUpperCase()
    const safeToRetry = ['GET', 'HEAD', 'OPTIONS'].includes(method)
    const retries = safeToRetry ? (config.retries ?? MAX_RETRIES) : 0
    const maxRetries = Number.isFinite(retries) ? Math.min(3, Math.max(0, Math.floor(retries))) : 0
    const deadline = config.deadline ?? Date.now() + (config.timeout ?? DEFAULT_TIMEOUT)
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new Error('Request deadline exceeded')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('Request deadline exceeded')), remaining)
    const signal = config.signal ? AbortSignal.any([config.signal, controller.signal]) : controller.signal
    try {
        for (let attempt = 0; ; attempt++) {
            signal.throwIfAborted()
            const attemptConfig = { ...config, signal, deadline, timeout: Math.max(1, deadline - Date.now()) }
            const { url, init } = toInit(attemptConfig)
            try {
                const res = await instance.fetch(url, init)
                const out = await toResponse<T>(res, attemptConfig)
                if (out.status >= 200 && out.status < 300) return out
                if (config.redirect === 'manual' && out.status >= 300 && out.status < 400) return out
                throw new HttpError(out.status, out)
            } catch (error) {
                signal.throwIfAborted()
                const retryable =
                    error instanceof HttpError
                        ? [408, 425, 500, 502, 503, 504].includes(error.status)
                        : !(error instanceof RangeError)
                if (!retryable || attempt >= maxRetries) throw error
                const backoff = RETRY_BASE_DELAY * 2 ** attempt + Math.floor(Math.random() * 250)
                const wait = error instanceof HttpError ? Math.max(backoff, error.retryAfterMs ?? 0) : backoff
                if (Date.now() + wait >= deadline) throw error
                await delay(wait, undefined, { signal })
            }
        }
    } finally {
        clearTimeout(timer)
    }
}

export interface HttpClientOptions {
    signal?: () => AbortSignal
    onError?: (error: HttpError, request: HttpRequestConfig) => void
}

class HttpClient {
    private instance: Impit
    private direct?: Impit
    private account: AccountProxy
    private defaultHeaders: RequestHeaders

    constructor(
        account: AccountProxy,
        defaultHeaders: RequestHeaders = {},
        private readonly options: HttpClientOptions = {}
    ) {
        this.account = account
        this.defaultHeaders = { ...defaultHeaders }

        const proxyUrl = this.account.url && this.account.proxyHttp ? this.buildProxyUrl(this.account) : undefined

        this.instance = new Impit({ browser: 'chrome', proxyUrl, timeout: DEFAULT_TIMEOUT })
    }

    setDefaultHeaders(headers: RequestHeaders): void {
        this.defaultHeaders = mergeRequestHeaders(this.defaultHeaders, headers)
    }

    async request<T = unknown>(config: HttpRequestConfig, useProxy = true): Promise<HttpResponse<T>> {
        const requestConfig: HttpRequestConfig = {
            ...config,
            signal:
                config.signal && this.options.signal
                    ? AbortSignal.any([config.signal, this.options.signal()])
                    : (config.signal ?? this.options.signal?.()),
            headers: mergeRequestHeaders(this.defaultHeaders, config.headers)
        }
        try {
            if (!useProxy) this.direct ??= new Impit({ browser: 'chrome', timeout: DEFAULT_TIMEOUT })
            return await send<T>(useProxy ? this.instance : this.direct!, requestConfig)
        } catch (error) {
            if (error instanceof HttpError) this.options.onError?.(error, config)
            throw error
        }
    }

    private buildProxyUrl(proxyConfig: AccountProxy): string {
        const { url: baseUrl, port, username, password } = proxyConfig

        const urlObj = parseBrowserProxyUrl(baseUrl)
        const protocol = urlObj.protocol.toLowerCase()

        if (username && password) {
            urlObj.username = encodeURIComponent(username)
            urlObj.password = encodeURIComponent(password)
            urlObj.port = port.toString()
            return urlObj.toString()
        }

        return `${protocol}//${urlObj.hostname}:${port}`
    }
}

let sharedInstance: Impit | undefined

export async function httpRequest<T = unknown>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
    if (!sharedInstance) sharedInstance = new Impit({ browser: 'chrome', timeout: DEFAULT_TIMEOUT })
    return send<T>(sharedInstance, config)
}

export default HttpClient
