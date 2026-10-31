import type { BrowserContext, Cookie } from 'patchright'

export type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>

const SESSION_COOKIE_DOMAINS = ['bing.com', 'live.com', 'microsoft.com', 'microsoftonline.com', 'msn.com']

export function filterSessionCookies(cookies: readonly Cookie[]): Cookie[] {
    const now = Date.now() / 1000
    return cookies.filter(cookie => {
        if (cookie.expires !== -1 && Number.isFinite(cookie.expires) && cookie.expires <= now) return false
        const domain = cookie.domain.replace(/^\./, '').toLowerCase()
        return SESSION_COOKIE_DOMAINS.some(allowed => domain === allowed || domain.endsWith(`.${allowed}`))
    })
}

export function createSessionState(cookies: readonly Cookie[]): StorageState {
    return { cookies: filterSessionCookies(cookies), origins: [] }
}
