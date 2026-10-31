import type { Page } from 'patchright'
import { isBrowserPageCrashed } from './BrowserPageHealth'

interface PageRequests {
    pending: Set<Promise<unknown>>
    closing?: Promise<void>
}

const requestsByPage = new WeakMap<Page, PageRequests>()

function requestsFor(page: Page): PageRequests {
    let state = requestsByPage.get(page)
    if (!state) {
        state = { pending: new Set() }
        requestsByPage.set(page, state)
    }
    return state
}

export function isPageAvailableForRequest(page: Page): boolean {
    return !page.isClosed() && !isBrowserPageCrashed(page) && !requestsByPage.get(page)?.closing
}

export async function usingBrowserPage<T>(page: Page, action: () => Promise<T>): Promise<T> {
    const state = requestsFor(page)
    if (!isPageAvailableForRequest(page)) throw new Error('Request page is closed, closing or crashed')
    const request = Promise.resolve().then(action)
    state.pending.add(request)
    try {
        return await request
    } finally {
        state.pending.delete(request)
    }
}

export function closeBrowserPage(page: Page): Promise<void> {
    const state = requestsFor(page)
    return (state.closing ??= (async () => {
        await Promise.allSettled([...state.pending])
        if (!page.isClosed()) await page.close()
    })())
}
