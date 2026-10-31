import type { Locator, Page } from 'patchright'

const TRACKING_PARAMETERS = new Set(['form', 'ocid', 'publ', 'crea'])

export function normalizeRewardUrl(raw: string | undefined, base: string, removeTracking = false): string | null {
    if (!raw?.trim()) return null
    try {
        const url = new URL(raw.replace(/&amp;/gi, '&'), base)
        url.hash = ''
        const entries = [...url.searchParams.entries()]
            .filter(([name]) => !removeTracking || !TRACKING_PARAMETERS.has(name.toLowerCase()))
            .sort(([leftName, leftValue], [rightName, rightValue]) =>
                leftName === rightName ? leftValue.localeCompare(rightValue) : leftName.localeCompare(rightName)
            )
        url.search = ''
        for (const [name, value] of entries) url.searchParams.append(name, value)
        return url.toString()
    } catch {
        return null
    }
}

export function normalizeCardText(value: string | null | undefined): string {
    return (value ?? '')
        .replace(/[\u200b-\u200d\ufeff]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

export function rewardUrlIdentity(raw: string | undefined, base: string): { offerIds: string[]; tokens: string[] } {
    const offerIds = new Set<string>()
    const tokens = new Set<string>()
    const pending = raw ? [raw.replace(/&amp;/gi, '&')] : []
    const visited = new Set<string>()
    const decode = (value: string): string => {
        try {
            return decodeURIComponent(value)
        } catch {
            return value
        }
    }

    while (pending.length && visited.size < 10) {
        const value = pending.shift()!
        if (visited.has(value)) continue
        visited.add(value)
        let url: URL
        try {
            url = new URL(value, base)
        } catch {
            continue
        }
        for (const part of url.pathname.split('/').filter(Boolean)) tokens.add(decode(part))
        const quest = url.pathname.match(/^\/earn\/quest\/([^/]+)\/?$/)
        if (quest) offerIds.add(decode(quest[1]!))
        for (const [key, parameter] of url.searchParams) {
            tokens.add(parameter)
            if (/^(?:offer_?id|btroid|btdsuoid)$/i.test(key) && parameter) offerIds.add(parameter)
            if (key.toLowerCase() === 'filters') {
                let filters = parameter
                for (let depth = 0; depth < 3; depth++) {
                    for (const match of filters.matchAll(
                        /\b(?:BTDSUOID|BTROID|offer_?id)\s*:\s*(?:"([^"]+)"|'([^']+)'|([^\s"']+))/gi
                    ))
                        offerIds.add(match[1] ?? match[2] ?? match[3]!)
                    const decoded = decode(filters)
                    if (decoded === filters) break
                    filters = decoded
                }
            }
            if (/^(?:ru|url|u|redirect(?:url)?|returnurl|returnto|destination)$/i.test(key)) {
                let destination = parameter
                for (let depth = 0; depth < 3; depth++) {
                    if (/^(?:https?:\/\/|\/)/i.test(destination)) {
                        try {
                            pending.push(new URL(destination, url).href)
                        } catch {
                            break
                        }
                        break
                    }
                    const decoded = decode(destination)
                    if (decoded === destination) break
                    destination = decoded
                }
            }
        }
    }
    return { offerIds: [...offerIds], tokens: [...tokens] }
}

export interface RenderedRewardCard {
    index: number
    destination: string
    offerIds: string[]
    controlIds: string[]
    title: string
    description: string
    text: string
    controlName: string
    parentControlIndex: number | null
    section: string
    visible: boolean
    disabled: boolean
    complete: boolean
    points: number
    hasPointsBadge: boolean
}

export async function readRewardCards(page: Page, controls: Locator): Promise<RenderedRewardCard[]> {
    const cards = await controls.evaluateAll(elements => {
        const indexes = new Map(elements.map((element, index) => [element, index]))
        const text = (value: string | null | undefined) =>
            (value ?? '')
                .replace(/[\u200b-\u200d\ufeff]/g, '')
                .replace(/\s+/g, ' ')
                .trim()
        const attributes = (element: Element, names: string[]) =>
            names.flatMap(name => {
                const value = element.closest(`[${name}]`)?.getAttribute(name)
                return value ? [value] : []
            })
        return elements.map((element, index) => {
            const heading = element.querySelector('.promo-title, .text-globalBody2Strong, .c-heading-3, h2, h3')
            const description = element.querySelector('.promo-desc') ?? heading?.nextElementSibling
            const badge = element.querySelector('.rounded-cornerCircular p.text-metadata, .point_cont .point')
            const style = getComputedStyle(element)
            const card = element.closest('.promo_cont') ?? element
            let parentControlIndex: number | null = null
            for (let parent = element.parentElement; parent; parent = parent.parentElement) {
                const parentIndex = indexes.get(parent)
                if (parentIndex !== undefined) {
                    parentControlIndex = parentIndex
                    break
                }
            }
            const labelledBy = element
                .getAttribute('aria-labelledby')
                ?.split(/\s+/)
                .map(id => document.getElementById(id)?.textContent ?? '')
                .join(' ')
            return {
                index,
                destination: element.getAttribute('href') ?? '',
                offerIds: attributes(element, ['data-offerid', 'data-offer-id']),
                controlIds: attributes(element, ['data-bi-id', 'id']),
                title: text(heading?.textContent),
                description: text(description?.textContent),
                text: text(element.textContent),
                controlName: text(labelledBy || element.getAttribute('aria-label') || element.textContent),
                parentControlIndex,
                section: element.closest('section[id]')?.id ?? '',
                visible:
                    style.visibility !== 'hidden' && style.display !== 'none' && element.getClientRects().length > 0,
                disabled: Boolean(
                    element.closest('[aria-disabled="true"], [data-disabled], [disabled], [inert]') ||
                    card.querySelector('.locked_point, .locked_level_required_text, #locked_level_required_text')
                ),
                complete: Boolean(card.querySelector('.bg-statusSuccessRewardsBg')),
                points: Number(text(badge?.textContent).replace(/[^0-9]/g, '')) || 0,
                hasPointsBadge: Boolean(badge)
            }
        })
    })
    const base = page.url()
    return cards.map(card => ({
        ...card,
        offerIds: [...new Set([...card.offerIds, ...rewardUrlIdentity(card.destination, base).offerIds])]
    }))
}
