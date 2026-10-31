import { setTimeout as wait } from 'node:timers/promises'
import type { Locator, Page } from 'patchright'
import { getGhostCursor } from './GhostCursor'
import { humanScroll } from './HumanScroll'

export async function ghostClick(
    page: Page,
    target: Locator,
    timeout = 30000,
    signal?: AbortSignal,
    options: { scroll?: 'wheel' | 'direct' } = {}
): Promise<void> {
    const deadline = Date.now() + timeout
    let reason = 'control not found'
    const remaining = () => {
        signal?.throwIfAborted()
        if (page.isClosed()) throw new Error('Ghostclick page closed before the click')
        const milliseconds = deadline - Date.now()
        if (milliseconds <= 0) throw new Error(`Ghostclick timed out after ${timeout}ms | ${reason} | ${target}`)
        return milliseconds
    }

    await page.bringToFront()
    const cursor = await getGhostCursor(page)

    const inspect = () =>
        target.evaluate(
            element => {
                const style = getComputedStyle(element)
                const box = element.getBoundingClientRect()
                if (
                    !element.isConnected ||
                    style.display === 'none' ||
                    style.visibility !== 'visible' ||
                    !box.width ||
                    !box.height
                )
                    return { reason: 'control hidden or detached', box: null }
                if (element.matches(':disabled') || element.closest('[aria-disabled="true"], [inert], [data-disabled]'))
                    return { reason: 'control disabled', box: null }

                const receivesPointer = (x: number, y: number): boolean => {
                    let node: Element = element
                    for (;;) {
                        const root = node.getRootNode() as Document | ShadowRoot
                        const hit = root.elementFromPoint(x, y)
                        if (!hit || (hit !== node && !node.contains(hit))) return false
                        if (!(root instanceof ShadowRoot)) return true
                        node = root.host
                    }
                }

                const rectangles = [...element.getClientRects()]
                if (!rectangles.length) rectangles.push(box)
                let inViewport = false
                for (const rectangle of rectangles) {
                    const left = Math.max(0, rectangle.left)
                    const top = Math.max(0, rectangle.top)
                    const right = Math.min(innerWidth, rectangle.right)
                    const bottom = Math.min(innerHeight, rectangle.bottom)
                    if (right <= left || bottom <= top) continue
                    inViewport = true
                    for (const [xRatio, yRatio] of [
                        [0.5, 0.5],
                        [0.25, 0.25],
                        [0.75, 0.25],
                        [0.25, 0.75],
                        [0.75, 0.75]
                    ] as const) {
                        const x = left + (right - left) * xRatio
                        const y = top + (bottom - top) * yRatio
                        if (receivesPointer(x, y))
                            return {
                                reason: 'control ready',
                                box: { x, y, left: box.left, top: box.top, width: box.width, height: box.height }
                            }
                    }
                }
                return {
                    reason: inViewport ? 'control covered or not receiving pointer events' : 'control outside viewport',
                    box: null
                }
            },
            undefined,
            { timeout: remaining() }
        )

    type ClickBox = NonNullable<Awaited<ReturnType<typeof inspect>>['box']>
    const unchanged = (left: ClickBox, right: ClickBox | null): boolean =>
        right !== null &&
        (['x', 'y', 'left', 'top', 'width', 'height'] as const).every(key => Math.abs(left[key] - right[key]) < 0.5)
    let previous: ClickBox | null = null
    for (;;) {
        remaining()
        const count = await target.count()
        if (count > 1) throw new Error(`Ghostclick requires one control; found ${count} | ${target}`)
        if (count === 1) {
            if (options.scroll === 'direct') await target.scrollIntoViewIfNeeded({ timeout: remaining(), signal })
            else await humanScroll(page, { target }, { timeout: remaining(), signal })
            const state = await inspect()
            reason = state.reason
            const box = state.box
            if (box && unchanged(box, previous)) {
                await cursor.moveTo({ x: box.x, y: box.y })
                remaining()
                const afterMove = await inspect()
                if (unchanged(box, afterMove.box)) {
                    remaining()
                    await cursor.click(undefined, { hesitate: 0, waitForClick: 50, moveDelay: 0 })
                    return
                }
                reason = afterMove.box ? 'control moved while approaching it' : afterMove.reason
                previous = null
            } else {
                previous = box
                if (box) reason = 'waiting for control position to settle'
            }
        } else {
            previous = null
            reason = 'control not found'
        }
        await wait(Math.min(100, remaining()), undefined, { signal })
    }
}
