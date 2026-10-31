import type { Page } from 'patchright'

interface PageHealth {
    crashed: boolean
    handlers: Array<() => void>
}

const pageHealth = new WeakMap<Page, PageHealth>()

export function trackBrowserPage(page: Page): void {
    if (pageHealth.has(page)) return
    const state: PageHealth = { crashed: false, handlers: [] }
    pageHealth.set(page, state)
    const crash = (): void => {
        if (state.crashed) return
        state.crashed = true
        state.handlers.at(-1)?.()
    }
    page.on('crash', crash)
    page.once('close', () => {
        page.off('crash', crash)
        state.handlers.length = 0
    })
}

export function isBrowserPageCrashed(page: Page): boolean {
    return pageHealth.get(page)?.crashed === true
}

export function isBrowserPageCrashError(error: unknown): boolean {
    return /\bcrash(?:ed)?\b/i.test(error instanceof Error ? error.message : String(error))
}

/** Temporarily replace the page's default crash log while a task owns it. */
export function onBrowserPageCrash(page: Page, handler: () => void): () => void {
    trackBrowserPage(page)
    const state = pageHealth.get(page)!
    const entry = (): void => handler()
    state.handlers.push(entry)
    if (state.crashed) entry()
    return () => {
        const index = state.handlers.indexOf(entry)
        if (index >= 0) state.handlers.splice(index, 1)
    }
}
