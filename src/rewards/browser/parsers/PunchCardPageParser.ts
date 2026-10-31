import type { Page } from 'patchright'
import type { ParentQuest } from '../../shared/parsers/RewardsPageParser'

export const PUNCHCARD_LINKS = '#quests a[href*="/earn/quest/"]'

export interface RenderedPunchCard extends ParentQuest {
    destination: string
}

export interface RenderedPunchCardStep {
    offerId: string | null
    title: string
    description: string
    destination: string
    controlName: string
    role: 'link' | 'button'
    disabled: boolean
    complete: boolean
}

export async function readPunchCardParents(page: Page): Promise<RenderedPunchCard[]> {
    return page.locator(PUNCHCARD_LINKS).evaluateAll(elements => {
        const text = (value: string | null | undefined) =>
            (value ?? '')
                .replace(/[\u200b-\u200d\ufeff]/g, '')
                .replace(/\s+/g, ' ')
                .trim()
        const cards = new Map<string, RenderedPunchCard>()
        for (const element of elements) {
            const style = getComputedStyle(element)
            if (
                !element.getClientRects().length ||
                style.visibility === 'hidden' ||
                style.display === 'none' ||
                element.closest('[aria-disabled="true"], [data-disabled], [inert]')
            )
                continue
            const heading = element.querySelector('h3')
            if (!heading) continue
            let destination: URL
            let offerId: string
            try {
                destination = new URL(element.getAttribute('href') ?? '', location.href)
                const match = destination.pathname.match(/^\/earn\/quest\/([^/]+)\/?$/)
                if (destination.origin !== location.origin || !match) continue
                offerId = decodeURIComponent(match[1]!)
            } catch {
                continue
            }
            const progress = [...element.querySelectorAll('.text-metadata, p, span')]
                .map(node => text(node.textContent).match(/^(\d+)\s*\/\s*(\d+)\s+tasks?$/i))
                .find(match => match !== null)
            const points = [...element.querySelectorAll('.rounded-cornerCircular p')]
                .map(node => text(node.textContent))
                .find(value => /^\+?\s*\d[\d,]*$/.test(value))
            cards.set(offerId, {
                offerId,
                title: text(heading.textContent),
                destination: destination.href,
                pointProgressMax: points ? Number(points.replace(/[^0-9]/g, '')) : 0,
                pointProgressMaxKnown: points !== undefined,
                completedSteps: progress ? Number(progress[1]) : null,
                totalSteps: progress ? Number(progress[2]) : null,
                complete: Boolean(
                    element.querySelector('.bg-statusSuccessRewardsBg') ||
                    (progress && Number(progress[2]) > 0 && Number(progress[1]) >= Number(progress[2]))
                )
            })
        }
        return [...cards.values()]
    })
}

export async function readPunchCardPage(page: Page) {
    return page.locator('main').evaluate(main => {
        const text = (value: string | null | undefined) =>
            (value ?? '')
                .replace(/[\u200b-\u200d\ufeff]/g, '')
                .replace(/\s+/g, ' ')
                .trim()
        const visible = (element: Element) => {
            const style = getComputedStyle(element)
            return element.getClientRects().length > 0 && style.visibility !== 'hidden' && style.display !== 'none'
        }
        const progress = [...main.querySelectorAll('p, span')]
            .filter(visible)
            .map(node => text(node.textContent).match(/^(\d+)\s*\/\s*(\d+)\s+tasks?$/i))
            .find(match => match !== null)
        const steps: RenderedPunchCardStep[] = []
        for (const heading of main.querySelectorAll('h3')) {
            if (!visible(heading)) continue
            let container = heading.parentElement

            while (container && container !== main && container.querySelectorAll('h3').length === 1) {
                const controls = [
                    ...container.querySelectorAll('a[href], [role="link"], button, [role="button"]')
                ].filter(visible)
                if (controls.length) {
                    if (controls.length !== 1) break
                    const control = controls[0]!
                    const row =
                        container.parentElement?.querySelectorAll('h3').length === 1
                            ? container.parentElement
                            : container
                    const disabled = Boolean(
                        control.closest('[disabled], [aria-disabled="true"], [data-disabled], [inert]')
                    )
                    const complete = Boolean(
                        row?.matches('[data-completed="true"], [data-complete="true"]') ||
                        row?.querySelector(
                            '[data-completed="true"], [data-complete="true"], .bg-statusSuccessRewardsBg, [aria-label="Completed"]'
                        )
                    )
                    steps.push({
                        offerId:
                            control.getAttribute('data-offerid') ??
                            control.getAttribute('data-offer-id') ??
                            container.getAttribute('data-offerid') ??
                            container.getAttribute('data-offer-id'),
                        title: text(heading.textContent),
                        description: text(heading.nextElementSibling?.textContent),
                        destination: control.getAttribute('href') ?? '',
                        controlName: text(control.getAttribute('aria-label') ?? control.textContent),
                        role: control.matches('button, [role="button"]') ? 'button' : 'link',
                        disabled,
                        complete
                    })
                    break
                }
                container = container.parentElement
            }
        }
        return {
            steps,
            completed: progress ? Number(progress[1]) : null,
            total: progress ? Number(progress[2]) : null
        }
    })
}
