import type { Cookie } from 'patchright'

export interface CookieMergeResult {
    cookies: Cookie[]
    changed: boolean
    processed: number
}

function defaultCookiePath(pathname: string): string {
    if (!pathname || pathname[0] !== '/' || pathname === '/') return '/'
    const lastSlash = pathname.lastIndexOf('/')
    return lastSlash <= 0 ? '/' : pathname.slice(0, lastSlash)
}

function domainMatches(host: string, domain: string): boolean {
    const normalized = domain.replace(/^\./, '').toLowerCase()
    return host === normalized || host.endsWith(`.${normalized}`)
}

function cookieMatchesHost(host: string, domain: string): boolean {
    const normalized = domain.toLowerCase()
    return normalized.startsWith('.') ? domainMatches(host, normalized) : host === normalized
}

export function filterCookiesForUrl(cookies: readonly Cookie[], targetUrl: string): Cookie[] {
    const url = new URL(targetUrl)
    const host = url.hostname.toLowerCase()
    const requestPath = url.pathname || '/'
    const now = Date.now() / 1000

    return cookies
        .filter(cookie => {
            if (cookie.expires !== -1 && cookie.expires <= now) return false
            if (cookie.secure && url.protocol !== 'https:') return false
            if (!cookieMatchesHost(host, cookie.domain)) return false

            const cookiePath = cookie.path || '/'
            if (!requestPath.startsWith(cookiePath)) return false
            if (
                requestPath.length > cookiePath.length &&
                !cookiePath.endsWith('/') &&
                requestPath.charAt(cookiePath.length) !== '/'
            ) {
                return false
            }

            return true
        })
        .sort(
            (a, b) =>
                (b.path?.length ?? 0) - (a.path?.length ?? 0) ||
                Number(!b.domain.startsWith('.')) - Number(!a.domain.startsWith('.')) ||
                b.domain.length - a.domain.length
        )
}

export function buildCookieHeader(cookies: readonly Cookie[], allowedDomains?: readonly string[]): string {
    return cookies
        .filter(cookie => {
            if (!allowedDomains?.length) return true
            const cookieDomain = cookie.domain.replace(/^\./, '').toLowerCase()
            return allowedDomains.some(domain => {
                const allowed = domain.replace(/^\./, '').toLowerCase()
                return cookieDomain === allowed || cookieDomain.endsWith(`.${allowed}`)
            })
        })
        .map(cookie => `${cookie.name}=${cookie.value}`)
        .join('; ')
}

function splitSetCookieHeader(setCookieHeader?: string[] | string): string[] {
    if (!setCookieHeader) return []
    if (Array.isArray(setCookieHeader)) return setCookieHeader.filter(Boolean)

    return setCookieHeader
        .split(/,(?=\s*[^;,=\s]+=[^;,]*)/g)
        .map(value => value.trim())
        .filter(Boolean)
}

function parseSetCookie(raw: string, requestUrl: string): { cookie: Cookie; remove: boolean } | null {
    const parts = raw.split(';').map(part => part.trim())
    const first = parts.shift()
    if (!first) return null

    const equals = first.indexOf('=')
    if (equals <= 0) return null

    const request = new URL(requestUrl)
    const requestHost = request.hostname.toLowerCase()
    const name = first.slice(0, equals).trim()
    const value = first.slice(equals + 1)
    if (!name) return null

    let domain = requestHost
    let cookiePath = defaultCookiePath(request.pathname)
    let expires = -1
    let secure = false
    let httpOnly = false
    let sameSite: Cookie['sameSite'] = 'Lax'
    let maxAge: number | null = null

    for (const attribute of parts) {
        const separator = attribute.indexOf('=')
        const attributeName = (separator < 0 ? attribute : attribute.slice(0, separator)).trim().toLowerCase()
        const attributeValue = separator < 0 ? '' : attribute.slice(separator + 1).trim()

        if (attributeName === 'domain' && attributeValue) {
            const candidate = attributeValue.toLowerCase()
            if (!domainMatches(requestHost, candidate)) return null
            domain = `.${candidate.replace(/^\./, '')}`
        } else if (attributeName === 'path' && attributeValue.startsWith('/')) {
            cookiePath = attributeValue
        } else if (attributeName === 'secure') {
            secure = true
        } else if (attributeName === 'httponly') {
            httpOnly = true
        } else if (attributeName === 'expires' && attributeValue) {
            const parsed = Date.parse(attributeValue)
            if (Number.isFinite(parsed)) expires = parsed / 1000
        } else if (attributeName === 'max-age' && attributeValue) {
            const seconds = Number(attributeValue)
            if (Number.isFinite(seconds)) maxAge = seconds
        } else if (attributeName === 'samesite') {
            const normalized = attributeValue.toLowerCase()
            if (normalized === 'strict') sameSite = 'Strict'
            else if (normalized === 'none') sameSite = 'None'
            else sameSite = 'Lax'
        }
    }

    if (maxAge !== null) expires = maxAge <= 0 ? 0 : Date.now() / 1000 + maxAge
    if (sameSite === 'None' && !secure) return null
    if (name.startsWith('__Secure-') && !secure) return null
    if (name.startsWith('__Host-') && (!secure || domain !== requestHost || cookiePath !== '/')) return null

    const remove = expires !== -1 && expires <= Date.now() / 1000
    return { cookie: { name, value, domain, path: cookiePath, expires, httpOnly, secure, sameSite }, remove }
}

export function mergeSetCookies(
    current: readonly Cookie[],
    requestUrl: string,
    setCookieHeader?: string[] | string
): CookieMergeResult {
    const rawCookies = splitSetCookieHeader(setCookieHeader)
    if (!rawCookies.length) return { cookies: [...current], changed: false, processed: 0 }

    const updated = [...current]
    let changed = false

    for (const raw of rawCookies) {
        const parsed = parseSetCookie(raw, requestUrl)
        if (!parsed) continue

        const index = updated.findIndex(
            cookie =>
                cookie.name === parsed.cookie.name &&
                cookie.domain === parsed.cookie.domain &&
                cookie.path === parsed.cookie.path
        )

        if (parsed.remove) {
            if (index >= 0) {
                updated.splice(index, 1)
                changed = true
            }
            continue
        }

        if (index < 0) {
            updated.push(parsed.cookie)
            changed = true
        } else if (JSON.stringify(updated[index]) !== JSON.stringify(parsed.cookie)) {
            updated[index] = parsed.cookie
            changed = true
        }
    }

    return { cookies: updated, changed, processed: rawCookies.length }
}
