export type HeaderScalar = string | number | boolean
export type HeaderValue = HeaderScalar | readonly string[] | null | undefined
export type RequestHeaders = Record<string, HeaderValue>

const BROWSER_OWNED_HEADERS = new Set([
    'accept-charset',
    'accept-encoding',
    'access-control-request-headers',
    'access-control-request-method',
    'connection',
    'content-length',
    'cookie',
    'date',
    'dnt',
    'expect',
    'host',
    'keep-alive',
    'origin',
    'permissions-policy',
    'referer',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'user-agent',
    'via'
])

export function sanitizeForBrowserFetch(headers: Readonly<Record<string, string>>): Record<string, string> {
    const sanitized: Record<string, string> = {}

    for (const [name, value] of Object.entries(headers)) {
        const lower = name.toLowerCase()
        if (BROWSER_OWNED_HEADERS.has(lower)) continue
        if (lower.startsWith('sec-fetch-') || lower.startsWith('sec-ch-')) continue
        if (lower === 'proxy-authorization') continue
        sanitized[name] = value
    }

    return sanitized
}

export function localeRequestHeaders(acceptLanguage: string): Record<string, string> {
    return acceptLanguage.trim() ? { 'Accept-Language': acceptLanguage } : {}
}
