import type { Page } from 'patchright'
import { readRewardCards } from './RewardCardParser'

export const EARN_TASK_SECTIONS = '#dailyset, #exploreonbing, #quests, #moreactivities'
export const DAILY_SET_LINKS = '#dailyset a[href], #dailyset [role="link"][href]'
export const MORE_ACTIVITIES_LINKS =
    '#exploreonbing a[href], #exploreonbing [role="link"][href], #moreactivities a[href], #moreactivities [role="link"][href]'
export const EARN_TASK_CONTROLS = `${DAILY_SET_LINKS}, ${MORE_ACTIVITIES_LINKS}`

export async function readEarnPage(page: Page) {
    const cards = (await readRewardCards(page, page.locator(EARN_TASK_CONTROLS)))
        .filter(card => card.visible && card.title)
        .map(card => ({ ...card, offerId: card.offerIds.length === 1 ? card.offerIds[0]! : null }))
    const account = await page.locator('header button[aria-expanded] p').evaluateAll(elements => {
        const text = (value: string | null | undefined) =>
            (value ?? '')
                .replace(/[\u200b-\u200d\ufeff]/g, '')
                .replace(/\s+/g, ' ')
                .trim()
        const visible = (element: Element) => {
            const style = getComputedStyle(element)
            return style.visibility !== 'hidden' && style.display !== 'none' && element.getClientRects().length > 0
        }
        const balances = elements
            .filter(visible)
            .map(element => text(element.textContent))
            .filter(value => /^\d[\d\s.,]*$/.test(value))
            .map(value => Number(value.replace(/[^0-9]/g, '')))
        const streakResetText =
            [...document.querySelectorAll('#streaks span.text-metadata')]
                .filter(visible)
                .map(element => text(element.textContent))
                .find(value => /reset/i.test(value)) ?? null
        return { balance: balances.length === 1 ? balances[0]! : null, streakResetText }
    })
    return { cards, ...account }
}
