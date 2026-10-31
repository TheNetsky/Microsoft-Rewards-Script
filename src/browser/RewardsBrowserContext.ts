import type { Browser, BrowserContext, BrowserContextOptions, Cookie, Page } from 'patchright'
import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator'
import { FingerprintInjector } from 'fingerprint-injector'
import { applyDesktopAppFingerprint, isDesktopAppFingerprint } from './RewardsAppProfile'
import { createSessionState, filterSessionCookies } from '../session/SessionState'
import { URLs } from '../constants/urls'
import { closeBrowserPage, isPageAvailableForRequest } from './BrowserPageRequests'
import { trackBrowserPage } from './BrowserPageHealth'

const profiles = new WeakMap<
    BrowserContext,
    { fingerprint: BrowserFingerprintWithHeaders; options: BrowserContextOptions; timeout: number }
>()
interface RewardsTaskSession {
    context: BrowserContext
    sourceCookies: Cookie[]
    taskCookies: Cookie[]
    syncing: Promise<void>
}

const taskContexts = new WeakMap<BrowserContext, RewardsTaskSession>()
const pendingContexts = new WeakMap<BrowserContext, Promise<BrowserContext>>()
const contextOwners = new WeakMap<BrowserContext, BrowserContext>()
const closedSources = new WeakSet<BrowserContext>()
const closingContexts = new WeakMap<BrowserContext, Promise<void>>()

export function findRewardsPage(source: BrowserContext): Page | null {
    if (closedSources.has(source)) return null
    const appContext = taskContexts.get(source)?.context
    for (const context of appContext ? [source, appContext] : [source]) {
        const profile = profiles.get(context)
        if (profile && !isDesktopAppFingerprint(profile.fingerprint)) continue
        for (const page of context.pages()) {
            if (!isPageAvailableForRequest(page)) continue
            const url = new URL(page.url())
            if (
                url.origin === URLs.rewards.origin &&
                !url.pathname.startsWith('/api/') &&
                !url.pathname.startsWith('/auth/')
            )
                return page
        }
    }
    return null
}

export async function newRewardsBrowserContext(
    browser: Browser,
    fingerprint: BrowserFingerprintWithHeaders,
    options: BrowserContextOptions = {},
    timeout = 30000
): Promise<BrowserContext> {
    const screen = fingerprint.fingerprint.screen
    const context = await browser.newContext({
        userAgent: fingerprint.fingerprint.navigator.userAgent,
        colorScheme: 'dark',
        ...options,
        locale: fingerprint.fingerprint.navigator.language,
        viewport: { width: screen.width, height: screen.height, ...options.viewport },
        extraHTTPHeaders: { 'accept-language': fingerprint.headers['accept-language']!, ...options.extraHTTPHeaders }
    })
    context.on('page', trackBrowserPage)
    try {
        const injector = new FingerprintInjector()
        await injector.attachFingerprintToPlaywright(
            context as unknown as Parameters<FingerprintInjector['attachFingerprintToPlaywright']>[0],
            fingerprint
        )
        context.setDefaultTimeout(timeout)
        context.setDefaultNavigationTimeout(Math.max(timeout, 45000))
        profiles.set(context, { fingerprint, options, timeout })
        context.once('close', () => {
            void closeRewardsTaskContext(context).catch(() => undefined)
        })
        return context
    } catch (error) {
        await context.close().catch(() => undefined)
        throw error
    }
}

export async function createRewardsTaskContext(source: BrowserContext): Promise<BrowserContext | null> {
    if (closedSources.has(source)) throw new Error('Rewards browser session is closing')
    const profile = profiles.get(source)
    if (!profile || isDesktopAppFingerprint(profile.fingerprint)) {
        await synchronizeRewardsCookies(source)
        return null
    }
    const existing = taskContexts.get(source)?.context
    const pending = pendingContexts.get(source)
    if (existing || pending) {
        const context = existing ?? (await pending!)
        await synchronizeRewardsCookies(source)
        return context
    }
    const browser = source.browser()
    if (!browser) throw new Error('Rewards app task requires a running browser')
    const job = (async () => {
        const storageState = createSessionState(await source.cookies())
        const context = await newRewardsBrowserContext(
            browser,
            applyDesktopAppFingerprint(structuredClone(profile.fingerprint), browser.version()),
            { ...profile.options, isMobile: false, hasTouch: false, storageState },
            profile.timeout
        )
        try {
            const taskCookies = filterSessionCookies(await context.cookies())
            if (closedSources.has(source)) throw new Error('Rewards browser session is closing')
            taskContexts.set(source, {
                context,
                sourceCookies: storageState.cookies,
                taskCookies,
                syncing: Promise.resolve()
            })
            contextOwners.set(context, source)
            context.once('close', () => {
                if (taskContexts.get(source)?.context === context) taskContexts.delete(source)
                contextOwners.delete(context)
            })
            return context
        } catch (error) {
            await context.close().catch(() => undefined)
            throw error
        }
    })()
    pendingContexts.set(source, job)
    try {
        const context = await job
        await synchronizeRewardsCookies(source)
        return context
    } finally {
        if (pendingContexts.get(source) === job) pendingContexts.delete(source)
    }
}

const cookieKey = (cookie: Cookie) => `${cookie.domain}|${cookie.path}|${cookie.name}|${cookie.partitionKey ?? ''}`
const cookieMap = (cookies: Cookie[]) => new Map(cookies.map(cookie => [cookieKey(cookie), cookie]))
const sameCookie = (left?: Cookie, right?: Cookie) => JSON.stringify(left) === JSON.stringify(right)

function cookieChanges(before: Cookie[], after: Cookie[]): Map<string, Cookie | undefined> {
    const initial = cookieMap(before)
    const current = cookieMap(after)
    return new Map(
        [...new Set([...initial.keys(), ...current.keys()])]
            .filter(key => !sameCookie(initial.get(key), current.get(key)))
            .map(key => [key, current.get(key)])
    )
}

async function applyCookieChanges(
    target: BrowserContext,
    before: Cookie[],
    changes: Map<string, Cookie | undefined>
): Promise<Cookie[]> {
    if (!changes.size) return before
    const snapshot = cookieMap(before)
    const current = cookieMap(filterSessionCookies(await target.cookies()))
    for (const [key, cookie] of changes) {
        if (!sameCookie(current.get(key), snapshot.get(key))) continue
        if (cookie) {
            await target.addCookies([cookie])
            snapshot.set(key, cookie)
        } else {
            const old = snapshot.get(key)
            if (old?.partitionKey) await target.addCookies([{ ...old, expires: 1 }])
            else if (old) await target.clearCookies({ name: old.name, domain: old.domain, path: old.path })
            snapshot.delete(key)
        }
    }
    return [...snapshot.values()]
}

export async function synchronizeRewardsCookies(context: BrowserContext): Promise<void> {
    const source = contextOwners.get(context) ?? context
    await pendingContexts.get(source)
    const session = taskContexts.get(source)
    if (!session) return
    const job = session.syncing
        .catch(() => undefined)
        .then(async () => {
            const [sourceCookies, taskCookies] = await Promise.all([
                source.cookies().then(filterSessionCookies),
                session.context.cookies().then(filterSessionCookies)
            ])
            const sourceChanges = cookieChanges(session.sourceCookies, sourceCookies)
            const taskChanges = cookieChanges(session.taskCookies, taskCookies)
            for (const key of sourceChanges.keys()) taskChanges.delete(key)
            const [syncedSource, syncedTask] = await Promise.all([
                applyCookieChanges(source, sourceCookies, taskChanges),
                applyCookieChanges(session.context, taskCookies, sourceChanges)
            ])
            session.sourceCookies = syncedSource
            session.taskCookies = syncedTask
        })
    session.syncing = job
    return job
}

export function closeRewardsTaskContext(source: BrowserContext): Promise<void> {
    const closing = closingContexts.get(source)
    if (closing) return closing
    closedSources.add(source)
    const job = (async () => {
        await pendingContexts.get(source)?.catch(() => undefined)
        const session = taskContexts.get(source)
        if (!session) return
        try {
            await Promise.allSettled(session.context.pages().map(closeBrowserPage))
            await synchronizeRewardsCookies(source)
        } finally {
            await session.context.close()
        }
    })()
    closingContexts.set(source, job)
    return job
}
