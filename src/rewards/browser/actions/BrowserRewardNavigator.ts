import { pointValue } from '../../shared/PointAccounting'
import { ghostClick } from '../../../browser/GhostClick'
import { browserTimeout } from '../../../browser/BrowserTiming'
import { BrowserTaskPage } from '../../../browser/BrowserTaskPage'
import { isBrowserPageCrashed } from '../../../browser/BrowserPageHealth'
import { HttpError } from '../../../network/HttpError'
import type { Locator, Page, Request } from 'patchright'

import { URLs } from '../../../constants/urls'
import type { BotContext } from '../../../core/BotContext'
import { ActivitySkipError } from '../../shared/ActivityResult'
import { EARN_TASK_CONTROLS, EARN_TASK_SECTIONS } from '../parsers/EarnPageParser'
import {
    normalizeCardText,
    normalizeRewardUrl,
    readRewardCards,
    rewardUrlIdentity,
    type RenderedRewardCard
} from '../parsers/RewardCardParser'
import type { OfferReading } from '../../shared/OfferVerifier'

const FLYOUT_REWARD_LINKS = '#bingRewards a[href]'
const DASHBOARD_REWARD_LINKS =
    'main a[href], main [role="link"][href], #dashboard a[href], mee-rewards-card a[href], a[data-react-aria-pressable="true"][href]'
const MAX_CARD_SCROLLS = 20
const PAGE_LOAD_ATTEMPTS = 3
const RETRYABLE_PAGE_STATUSES = new Set([408, 425, 500, 502, 503, 504])

export interface RewardTarget {
    destination?: string
    offerId?: string
    title?: string
    description?: string
}

export interface BrowserClickResult {
    page: Page
    openedPopup: boolean
    /** Close every popup opened by this click, keeping the originating page open. */
    close(): Promise<void>
    activityReport?: {
        offerId?: string
        accepted: boolean
        offerComplete: boolean
        earnedCredits: number | null
    } | null
}

export class BrowserRewardNavigator {
    constructor(private readonly bot: BotContext) {}

    getActivePage(): Page | null {
        const page = this.bot.isMobile ? this.bot.mainMobilePage : this.bot.mainDesktopPage
        if (!page) return null
        try {
            return page.isClosed() ? null : page
        } catch {
            return null
        }
    }

    async openEarn(page: Page, refresh = false): Promise<void> {
        await page.bringToFront()
        const current = this.parseUrl(page.url())
        if (refresh || !current || current.origin !== URLs.rewards.origin || current.pathname !== '/earn') {
            await this.loadPage(page, URLs.rewards.earn, 'EARN-PAGE', 'Rendered Rewards earn page')
        }

        await this.bot.browser.utils.dismissMessages(page)
        await page.locator('main').waitFor({ state: 'attached', timeout: browserTimeout(this.bot) })
        await page.waitForFunction(
            () => {
                const main = document.querySelector('main')
                return (
                    Boolean(main?.querySelector('section[id]')) &&
                    ![...main!.querySelectorAll('.animate-pulse, [aria-busy="true"]')].some(
                        element => element.getClientRects().length > 0
                    )
                )
            },
            undefined,
            { timeout: browserTimeout(this.bot, 'navigation'), polling: 250 }
        )
        await this.expandSections(page, EARN_TASK_SECTIONS)
    }

    private async expandSections(page: Page, roots: string): Promise<void> {
        for (const section of await page.locator(roots).all()) {
            const expand = section.locator('button[slot="trigger"][aria-controls][aria-expanded]')
            if ((await expand.isVisible()) && (await expand.getAttribute('aria-expanded')) === 'false') {
                await ghostClick(page, expand, browserTimeout(this.bot), this.bot.signal, { scroll: 'direct' })
                await expand
                    .and(page.locator('[aria-expanded="true"]'))
                    .waitFor({ state: 'attached', timeout: browserTimeout(this.bot) })
            }
        }
    }

    async openFlyout(page: Page, refresh = false): Promise<void> {
        await page.bringToFront()
        if (refresh || page.url() !== URLs.bing.rewardsFlyoutPage) {
            await this.loadPage(page, URLs.bing.rewardsFlyoutPage, 'FLYOUT-PAGE', 'Rendered Bing Rewards flyout')
        }
        await this.bot.browser.utils.dismissMessages(page)
        await page.locator('#bingRewards').waitFor({ state: 'visible', timeout: browserTimeout(this.bot) })
        await page
            .locator(FLYOUT_REWARD_LINKS)
            .first()
            .waitFor({ state: 'attached', timeout: browserTimeout(this.bot, 'optional') })
            .catch(() => undefined)
    }

    async openDashboard(page: Page, refresh = false): Promise<void> {
        await page.bringToFront()
        const current = this.parseUrl(page.url())
        if (refresh || current?.origin !== URLs.rewards.origin || current.pathname !== '/dashboard') {
            await this.loadPage(page, URLs.rewards.dashboard, 'DASHBOARD-PAGE', 'Rendered Rewards dashboard')
        }
        await this.bot.browser.utils.dismissMessages(page)
        await page
            .locator(DASHBOARD_REWARD_LINKS)
            .first()
            .waitFor({ state: 'attached', timeout: browserTimeout(this.bot, 'navigation') })
        await page.waitForFunction(
            () =>
                ![
                    ...document.querySelectorAll(
                        'main .animate-pulse, main [aria-busy="true"], #dashboard [aria-busy="true"]'
                    )
                ].some(element => element.getClientRects().length > 0),
            undefined,
            { timeout: browserTimeout(this.bot, 'navigation'), polling: 250 }
        )
        await this.expandSections(page, '#dailyset')
    }

    private async loadPage(page: Page, url: string, context: string, description: string): Promise<void> {
        for (let attempt = 1; attempt <= PAGE_LOAD_ATTEMPTS; attempt++) {
            this.bot.signal.throwIfAborted()
            try {
                const response = await page.goto(url, {
                    waitUntil: 'domcontentloaded',
                    timeout: browserTimeout(this.bot, 'navigation')
                })
                if (!response)
                    throw Object.assign(new Error(`${description} returned no response`), { code: 'NO_RESPONSE' })
                if (!response.ok()) {
                    const status = response.status()
                    throw new HttpError(
                        status,
                        { status, headers: response.headers() },
                        `${description} returned status ${status}`
                    )
                }
                return
            } catch (error) {
                this.bot.signal.throwIfAborted()
                const message = error instanceof Error ? error.message : String(error)
                const retryable =
                    error instanceof HttpError
                        ? RETRYABLE_PAGE_STATUSES.has(error.status)
                        : (error as { code?: string })?.code === 'NO_RESPONSE' ||
                          (error as { name?: string })?.name === 'TimeoutError' ||
                          /net::ERR_(?:CONNECTION_RESET|CONNECTION_CLOSED|TIMED_OUT|NETWORK_CHANGED)/.test(message)
                if (!retryable || page.isClosed() || attempt === PAGE_LOAD_ATTEMPTS) throw error
                const retryDelay = Math.max((error as { retryAfterMs?: number })?.retryAfterMs ?? 0, 2000 * attempt)

                if (retryDelay > 10000) throw error
                this.bot.logger.warn(
                    this.bot.isMobile,
                    context,
                    `Page load failed | attempt=${attempt}/${PAGE_LOAD_ATTEMPTS} | retryInMs=${retryDelay} | reloading=${url} | ${message.split(/\r?\n/, 1)[0]}`
                )
                await this.bot.utils.wait(retryDelay)
            }
        }
    }

    async findFlyoutCard(page: Page, target: RewardTarget, scope = FLYOUT_REWARD_LINKS): Promise<Locator | null> {
        const find = async () => {
            const match = await this.findControl(page, target, scope)
            return match ?? (scope !== FLYOUT_REWARD_LINKS ? this.findControl(page, target, FLYOUT_REWARD_LINKS) : null)
        }
        return this.findWithScrolling(page, target, '#bingRewards', find)
    }

    async findEarnCard(page: Page, target: RewardTarget, scope = EARN_TASK_CONTROLS): Promise<Locator | null> {
        return this.findWithScrolling(page, target, EARN_TASK_SECTIONS, () =>
            this.findControl(
                page,
                target,
                page.locator(scope).filter({ hasNot: page.locator('.bg-statusSuccessRewardsBg') })
            )
        )
    }

    async findDashboardCard(page: Page, target: RewardTarget): Promise<Locator | null> {
        return this.findWithScrolling(page, target, 'main, #dashboard, mee-rewards-card', () =>
            this.findControl(page, target, DASHBOARD_REWARD_LINKS)
        )
    }

    private async findWithScrolling(
        page: Page,
        target: RewardTarget,
        roots: string,
        find: () => Promise<Locator | null>
    ): Promise<Locator | null> {
        this.bot.signal.throwIfAborted()
        const timeout = browserTimeout(this.bot)
        const deadline = Date.now() + timeout
        const remaining = () => Math.max(0, deadline - Date.now())
        const reveal = async (control: Locator): Promise<Locator> => {
            this.bot.signal.throwIfAborted()
            this.bot.logger.debug(
                this.bot.isMobile,
                'REWARD-CARD',
                `Jumping directly to matched card | offerId=${target.offerId ?? 'unknown'} | page=${page.url()} | selector=${control}`
            )
            await control.scrollIntoViewIfNeeded({ timeout: Math.max(1, remaining()), signal: this.bot.signal })
            this.bot.signal.throwIfAborted()
            return control
        }
        this.bot.logger.debug(
            this.bot.isMobile,
            'REWARD-CARD',
            `Locating rendered card | offerId=${target.offerId ?? 'unknown'} | roots=${roots} | timeoutMs=${timeout}`
        )
        const match = await find()
        if (match) return reveal(match)
        if (!remaining()) return null
        await this.bot.utils.wait(Math.min(250, remaining()))
        this.bot.signal.throwIfAborted()
        if (!remaining()) return null
        const ready = await find()
        if (ready) return reveal(ready)
        if (!remaining()) return null
        if (!(await page.locator(roots).count())) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'REWARD-CARD',
                `Task section is absent; checking the next surface | offerId=${target.offerId ?? 'unknown'} | roots=${roots} | page=${page.url()}`
            )
            return null
        }
        this.bot.logger.debug(
            this.bot.isMobile,
            'REWARD-CARD',
            `Card not matched in the DOM; checking lazy content with instant scroll jumps | offerId=${target.offerId ?? 'unknown'}`
        )

        const selectors = await page.locator(roots).evaluateAll(elements => {
            const root = document.scrollingElement ?? document.documentElement
            const candidates = new Set<Element>(elements)
            const scanned = new Set<Element>()
            const pending: Element[] = [...elements]
            while (pending.length) {
                const element = pending.pop()!
                if (scanned.has(element)) continue
                scanned.add(element)
                candidates.add(element)
                for (const child of element.children) pending.push(child)
                if (element.shadowRoot) for (const child of element.shadowRoot.children) pending.push(child)
            }
            for (const element of elements) {
                const ancestors = new Set<Element>()
                for (let node: Element | null = element; node && !ancestors.has(node);) {
                    ancestors.add(node)
                    candidates.add(node)
                    const tree = node.getRootNode()
                    node = node.assignedSlot ?? node.parentElement ?? (tree instanceof ShadowRoot ? tree.host : null)
                }
            }
            candidates.add(root)

            const paths = [...candidates].flatMap(element => {
                if (!(
                    element.clientHeight > 0 &&
                    element.scrollHeight > element.clientHeight + 1 &&
                    element.getClientRects().length > 0
                ))
                    return []
                const style = getComputedStyle(element)
                if (!(
                    style.visibility === 'visible' &&
                    (element === root
                        ? !['hidden', 'clip'].includes(style.overflowY)
                        : /^(auto|scroll|overlay)$/.test(style.overflowY))
                ))
                    return []
                const path: string[] = []
                for (let node: Element | null = element; node; node = node.parentElement) {
                    if (node.id) {
                        path.unshift(`#${CSS.escape(node.id)}`)
                        break
                    }
                    const siblings = [...(node.parentElement?.children ?? [])].filter(
                        sibling => sibling.tagName === node!.tagName
                    )
                    path.unshift(
                        `${node.tagName.toLowerCase()}:nth-of-type(${Math.max(1, siblings.indexOf(node) + 1)})`
                    )
                }
                return [path.join(' > ')]
            })
            return [...new Set(paths)]
        })
        this.bot.logger.debug(
            this.bot.isMobile,
            'REWARD-CARD',
            `Card scroll containers ready | offerId=${target.offerId ?? 'unknown'} | containers=${selectors.length} | remainingMs=${remaining()}`
        )
        for (const selector of selectors) {
            this.bot.signal.throwIfAborted()
            if (!remaining()) break
            const container = page.locator(selector)
            for (let step = 0; step < MAX_CARD_SCROLLS && Date.now() < deadline; step++) {
                this.bot.signal.throwIfAborted()
                const position = await container.evaluate(element => ({
                    top: element.scrollTop,
                    height: element.clientHeight,
                    maximum: Math.max(0, element.scrollHeight - element.clientHeight)
                }))
                const distance =
                    step === 0 ? -position.top : Math.min(position.height * 0.75, position.maximum - position.top)
                if (!distance && step > 0) break
                if (distance) {
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'REWARD-CARD',
                        `Jumping to check lazy cards | offerId=${target.offerId ?? 'unknown'} | step=${step + 1} | scrollTop=${Math.round(position.top)} | distance=${Math.round(distance)}`
                    )
                    try {
                        await container.evaluate(
                            (element, delta) =>
                                element.scrollTo({ top: element.scrollTop + delta, behavior: 'instant' }),
                            distance,
                            { timeout: Math.max(1, remaining()) }
                        )
                    } catch (error) {
                        this.bot.signal.throwIfAborted()
                        this.bot.logger.debug(
                            this.bot.isMobile,
                            'REWARD-CARD',
                            `Card discovery scroll unavailable | offerId=${target.offerId ?? 'unknown'} | ${String(error)}`
                        )
                        break
                    }
                    if (!remaining()) break
                    await this.bot.utils.wait(Math.min(250, remaining()))
                }
                this.bot.signal.throwIfAborted()
                if (!remaining()) break
                const found = await find()
                if (found) return reveal(found)
                if (distance && (await container.evaluate(element => element.scrollTop)) === position.top) break
            }
        }
        this.bot.signal.throwIfAborted()
        const final = remaining() ? await find() : null
        return final ? reveal(final) : null
    }

    async readDashboardCard(control: Locator): Promise<OfferReading> {
        const reading = await control.evaluate(element => {
            const badge = element.querySelector('.rounded-cornerCircular p.text-metadata')
            const points = (badge?.textContent ?? '').replace(/[^0-9]/g, '')
            return {
                complete: Boolean(element.querySelector('.bg-statusSuccessRewardsBg')),
                maximum: points ? Number(points) : null
            }
        })
        return { complete: reading.complete, progress: null, maximum: pointValue(reading.maximum) }
    }

    async findControl(page: Page, target: RewardTarget, scope: string | Locator = 'a[href]'): Promise<Locator | null> {
        this.bot.signal.throwIfAborted()
        const anchors = typeof scope === 'string' ? page.locator(scope) : scope
        const rendered = await readRewardCards(page, anchors)
        const cards = rendered.filter(card => card.visible && !card.disabled)
        const title = normalizeCardText(target.title)
        const description = normalizeCardText(target.description)
        const preferText = (matches: RenderedRewardCard[]): RenderedRewardCard[] => {
            if (matches.length <= 1) return matches
            const titled = title ? matches.filter(card => card.title === title) : []
            const selected = titled.length ? titled : matches
            const described = description ? selected.filter(card => card.description === description) : []
            const detailed = described.length ? described : selected
            const named = title ? detailed.filter(card => card.controlName === title || card.text === title) : []
            return named.length ? named : detailed
        }
        let ambiguous: string | undefined
        const select = (matches: RenderedRewardCard[], reason: string): Locator | null => {
            const preferred = preferText(matches)
            const selected = preferred.filter(
                card =>
                    !preferred.some(
                        parent =>
                            parent.index === card.parentControlIndex &&
                            !!card.destination &&
                            normalizeRewardUrl(card.destination, page.url()) !== null &&
                            normalizeRewardUrl(parent.destination, page.url()) ===
                                normalizeRewardUrl(card.destination, page.url())
                    )
            )
            if (selected.length > 1) {
                ambiguous = reason
                return null
            }
            const match = this.unique(
                selected.map(card =>
                    card.destination &&
                    rendered.filter(other => other.visible && other.destination === card.destination).length === 1
                        ? anchors.and(page.locator(`[href=${JSON.stringify(card.destination)}]:visible`))
                        : anchors.nth(card.index)
                ),
                reason
            )
            if (match)
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'REWARD-CARD',
                    `Matched rendered card | offerId=${target.offerId ?? 'unknown'} | matchedBy=${reason} | renderedOfferIds=${selected[0]!.offerIds.join(',') || 'unavailable'}`
                )
            return match
        }
        const byOffer = target.offerId
            ? cards.filter(card => {
                  const identity = rewardUrlIdentity(card.destination, page.url())
                  return (
                      [...card.offerIds, ...card.controlIds].includes(target.offerId!) ||
                      (!card.offerIds.length && identity.tokens.includes(target.offerId!))
                  )
              })
            : []
        if (byOffer.length) {
            const match = select(byOffer, 'offer ID')
            if (match) return match
        }

        const candidates = byOffer.length
            ? byOffer
            : cards.filter(
                  card =>
                      !target.offerId ||
                      target.offerId.startsWith('card:') ||
                      !card.offerIds.length ||
                      card.offerIds.includes(target.offerId)
              )
        const destination = normalizeRewardUrl(target.destination, page.url())
        const stableDestination = normalizeRewardUrl(target.destination, page.url(), true)
        const exact = destination
            ? candidates.filter(card => normalizeRewardUrl(card.destination, page.url()) === destination)
            : []
        const stable = stableDestination
            ? candidates.filter(card => normalizeRewardUrl(card.destination, page.url(), true) === stableDestination)
            : []
        if (exact.length) {
            const match = select(exact, 'destination URL')
            if (match) return match
        }
        if (stable.length) {
            const match = select(stable, 'destination URL without tracking parameters')
            if (match) return match
        }
        const titled = title ? candidates.filter(card => card.title === title) : []
        if (titled.length) {
            const match = select(titled, 'card title')
            if (match) return match
        }
        const named = title ? candidates.filter(card => card.controlName === title || card.text === title) : []
        if (named.length) {
            const match = select(named, 'control name')
            if (match) return match
        }
        const text = title ? candidates.filter(card => card.text.toLowerCase().includes(title.toLowerCase())) : []
        if (text.length) {
            const match = select(text, 'card text')
            if (match) return match
        }
        if (ambiguous)
            throw new ActivitySkipError(
                'ambiguous-target',
                `Multiple visible controls match ${ambiguous}; no control was clicked`
            )

        return null
    }

    async findOfferControl(page: Page, target: RewardTarget): Promise<Locator | null> {
        return this.findControl(
            page,
            target,
            'main a[href], main [role="link"][href], main button, main [role="button"], a[data-react-aria-pressable="true"]'
        )
    }

    private unique(matches: Locator[], reason: string): Locator | null {
        if (matches.length > 1)
            throw new ActivitySkipError(
                'ambiguous-target',
                `Multiple visible controls match ${reason}; no control was clicked`
            )
        return matches[0] ?? null
    }

    async uniqueVisible(candidates: Locator, reason: string): Promise<Locator | null> {
        const matches: Locator[] = []
        const count = await candidates.count()
        for (let index = 0; index < count; index++) {
            const candidate = candidates.nth(index)
            if (await candidate.isVisible()) matches.push(candidate)
        }
        return this.unique(matches, reason)
    }

    async click(
        page: Page,
        target: Locator,
        offerId?: string,
        options?: { timeout?: number; activationOnly?: boolean }
    ): Promise<BrowserClickResult> {
        const timeout = (kind: 'action' | 'navigation' | 'optional' = 'action'): number =>
            options?.timeout ?? browserTimeout(this.bot, kind)
        const signal = this.bot.signal
        signal.throwIfAborted()
        await page.bringToFront()

        const linkTarget = await target.getAttribute('target', { timeout: timeout() })
        const expectsPopup = Boolean(linkTarget && !['_self', '_top', '_parent'].includes(linkTarget))
        const beforeUrl = page.url()
        const task = await BrowserTaskPage.create(page, true)
        const closeOnAbort = (): void => {
            void task.close().catch(() => undefined)
        }
        signal.addEventListener('abort', closeOnAbort, { once: true })
        const opened: { page: Page | null } = { page: null }
        let signalPopup: (page: Page) => void = () => undefined
        const popupPromise = new Promise<Page>(resolve => {
            signalPopup = resolve
        })
        const observePopup = (popup: Page): void => {
            opened.page ??= popup
            signalPopup(popup)
        }
        let popupTimeout: ReturnType<typeof setTimeout> | undefined
        let cancelPopupWait: (() => void) | undefined
        let closePopupWait: (() => void) | undefined
        let crashPopupWait: (() => void) | undefined
        let report: Promise<BrowserClickResult['activityReport']> | undefined
        let reportTimeout: ReturnType<typeof setTimeout> | undefined
        const observeReport = (request: Request): void => {
            if (report || request.method() !== 'POST') return
            try {
                const url = new URL(request.url())
                if (url.origin !== URLs.bing.origin || !url.pathname.toLowerCase().endsWith('/reportactivity')) return
                const reportedId = request.postDataJSON()?.OfferId
                if (
                    typeof reportedId !== 'string' ||
                    reportedId.replace(/_activation(?=_|$)/i, '') !== offerId?.replace(/_activation(?=_|$)/i, '')
                )
                    return
                report = Promise.race([
                    (async () => {
                        const response = await request.response()
                        if (!response?.ok()) return null
                        const body = await response.json()
                        const result = {
                            offerId: reportedId,
                            accepted: body.ErrorDetail?.ErrorCode === 0,
                            offerComplete: body.OfferComplete === true,
                            earnedCredits: pointValue(body.EarnedCredits)
                        }
                        this.bot.logger.debug(
                            this.bot.isMobile,
                            'REWARD-REPORT',
                            `Activity report received | offerId=${reportedId} | accepted=${result.accepted}` +
                                ` | complete=${result.offerComplete} | points=${result.earnedCredits ?? 'unknown'}`
                        )
                        return result
                    })().catch(() => null),
                    new Promise<null>(resolve => {
                        reportTimeout = setTimeout(() => resolve(null), timeout())
                    })
                ])
            } catch {
                // Ignore
            }
        }
        page.on('popup', observePopup)
        const context = page.context()
        if (offerId) context.on('request', observeReport)

        try {
            await ghostClick(page, target, timeout(), signal, { scroll: 'direct' })
            this.bot.logger.debug(
                this.bot.isMobile,
                'REWARD-CARD',
                `GhostCursor click sent | offerId=${offerId ?? 'unknown'} | scroll=direct`
            )

            if (!options?.activationOnly && !opened.page && (expectsPopup || page.url() === beforeUrl)) {
                await Promise.race([
                    popupPromise,
                    new Promise<void>((resolve, reject) => {
                        popupTimeout = setTimeout(resolve, timeout(expectsPopup ? 'navigation' : 'optional'))
                        cancelPopupWait = () => reject(signal.reason)
                        closePopupWait = () => reject(new Error('Reward source page closed while waiting for a popup'))
                        crashPopupWait = () => reject(new Error('Reward source page crashed while waiting for a popup'))
                        signal.addEventListener('abort', cancelPopupWait, { once: true })
                        page.once('close', closePopupWait)
                        page.once('crash', crashPopupWait)
                        if (signal.aborted) cancelPopupWait()
                        else if (page.isClosed()) closePopupWait()
                        else if (isBrowserPageCrashed(page)) crashPopupWait()
                    })
                ])
                if (expectsPopup && !opened.page) throw new Error('Reward link did not open its expected popup')
            }
            signal.throwIfAborted()
            const popup = opened.page
            const destinationPage = popup ?? page
            if (isBrowserPageCrashed(destinationPage)) throw new Error('Reward destination page crashed')
            await destinationPage.bringToFront()

            if (popup) {
                await popup.waitForURL(url => url.href !== 'about:blank', {
                    waitUntil: 'domcontentloaded',
                    timeout: timeout('navigation')
                })
            }
            await destinationPage.waitForLoadState('domcontentloaded', { timeout: timeout() }).catch(() => undefined)
            await this.bot.browser.utils.dismissMessages(destinationPage).catch(() => undefined)
            await this.bot.utils.wait(1500)
            if (isBrowserPageCrashed(destinationPage)) throw new Error('Reward destination page crashed')
            const activityReport = report ? await report : undefined
            signal.throwIfAborted()

            return { page: destinationPage, openedPopup: Boolean(popup), activityReport, close: () => task.close() }
        } catch (error) {
            await task.close().catch(() => undefined)
            signal.throwIfAborted()
            throw error
        } finally {
            page.off('popup', observePopup)
            if (offerId) context.off('request', observeReport)
            if (reportTimeout) clearTimeout(reportTimeout)
            if (popupTimeout) clearTimeout(popupTimeout)
            if (cancelPopupWait) signal.removeEventListener('abort', cancelPopupWait)
            if (closePopupWait) page.off('close', closePopupWait)
            if (crashPopupWait) page.off('crash', crashPopupWait)
            signal.removeEventListener('abort', closeOnAbort)
        }
    }

    private parseUrl(raw: string): URL | null {
        try {
            return new URL(raw)
        } catch {
            return null
        }
    }
}
