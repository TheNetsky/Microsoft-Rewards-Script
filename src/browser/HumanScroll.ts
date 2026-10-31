import { setTimeout as wait } from 'node:timers/promises'
import type { Locator, Page } from 'patchright'
import { getGhostCursor } from './GhostCursor'

type ScrollRequest =
    { distance: number; container?: Locator } | { random: true; container?: Locator } | { target: Locator }

interface ScrollOptions {
    timeout?: number
    signal?: AbortSignal
}

interface ScrollState {
    deltaX: number
    deltaY: number
    point: { x: number; y: number }
    position: { x: number; y: number }
    container: number
}

function inspectScroll(element: Element, destination: { x: number; y: number } | null): ScrollState | null {
    const root = document.scrollingElement ?? document.documentElement
    const parentOf = (node: Element): Element | null => {
        if (node.assignedSlot) return node.assignedSlot
        if (node.parentElement) return node.parentElement
        const tree = node.getRootNode()
        return tree instanceof ShadowRoot ? tree.host : null
    }
    const canScroll = (node: Element, axis: 'x' | 'y'): boolean => {
        const style = getComputedStyle(node)
        const overflow = axis === 'x' ? style.overflowX : style.overflowY
        if (node === root) return !['hidden', 'clip'].includes(overflow)
        return /^(auto|scroll|overlay)$/.test(overflow)
    }
    const clampDelta = (delta: number, position: number, maximum: number): number =>
        Math.max(-position, Math.min(delta, maximum - position))
    const box = element.getBoundingClientRect()
    const containers: Element[] = []

    if (destination) {
        containers.push(element === document.documentElement ? root : element)
    } else {
        const style = getComputedStyle(element)
        if (
            !element.isConnected ||
            style.display === 'none' ||
            style.visibility !== 'visible' ||
            !box.width ||
            !box.height ||
            element.matches(':disabled') ||
            element.closest('[aria-disabled="true"], [inert], [data-disabled]')
        )
            return null
        for (let node = parentOf(element); node; node = parentOf(node)) containers.push(node)
        if (!containers.includes(root)) containers.push(root)
    }

    for (let index = 0; index < containers.length; index++) {
        const container = containers[index]!
        const rectangle = container.getBoundingClientRect()
        const view =
            container === root
                ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
                : {
                      left: rectangle.left + container.clientLeft,
                      top: rectangle.top + container.clientTop,
                      right: rectangle.left + container.clientLeft + container.clientWidth,
                      bottom: rectangle.top + container.clientTop + container.clientHeight
                  }

        view.left = Math.max(0, view.left)
        view.top = Math.max(0, view.top)
        view.right = Math.min(innerWidth, view.right)
        view.bottom = Math.min(innerHeight, view.bottom)
        for (let outer = parentOf(container); outer && container !== root; outer = parentOf(outer)) {
            if (outer === root) continue
            const bounds = outer.getBoundingClientRect()
            const style = getComputedStyle(outer)
            if (style.overflowX !== 'visible') {
                view.left = Math.max(view.left, bounds.left + outer.clientLeft)
                view.right = Math.min(view.right, bounds.left + outer.clientLeft + outer.clientWidth)
            }
            if (style.overflowY !== 'visible') {
                view.top = Math.max(view.top, bounds.top + outer.clientTop)
                view.bottom = Math.min(view.bottom, bounds.top + outer.clientTop + outer.clientHeight)
            }
        }
        if (view.right <= view.left || view.bottom <= view.top) continue

        const desiredX = destination
            ? destination.x - container.scrollLeft
            : box.left < view.left || box.right > view.right
              ? (box.left + box.right - view.left - view.right) / 2
              : 0
        const desiredY = destination
            ? destination.y - container.scrollTop
            : box.top < view.top || box.bottom > view.bottom
              ? (box.top + box.bottom - view.top - view.bottom) / 2
              : 0
        const deltaX = canScroll(container, 'x')
            ? clampDelta(desiredX, container.scrollLeft, Math.max(0, container.scrollWidth - container.clientWidth))
            : 0
        const deltaY = canScroll(container, 'y')
            ? clampDelta(desiredY, container.scrollTop, Math.max(0, container.scrollHeight - container.clientHeight))
            : 0
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 1) continue

        for (const [xRatio, yRatio] of [
            [0.5, 0.5],
            [0.8, 0.6],
            [0.2, 0.6],
            [0.5, 0.25],
            [0.5, 0.8]
        ] as const) {
            const x = view.left + (view.right - view.left) * xRatio
            const y = view.top + (view.bottom - view.top) * yRatio
            let hit = document.elementFromPoint(x, y)
            while (hit?.shadowRoot) {
                const inner = hit.shadowRoot.elementFromPoint(x, y)
                if (!inner || inner === hit) break
                hit = inner
            }
            for (let node = hit; node; node = parentOf(node)) {
                if (node === container)
                    return {
                        deltaX,
                        deltaY,
                        point: { x, y },
                        position: { x: container.scrollLeft, y: container.scrollTop },
                        container: index
                    }

                const style = getComputedStyle(node)
                const intercepts = (axis: 'x' | 'y', delta: number): boolean => {
                    if (!delta || !canScroll(node, axis)) return false
                    const position = axis === 'x' ? node.scrollLeft : node.scrollTop
                    const maximum =
                        axis === 'x' ? node.scrollWidth - node.clientWidth : node.scrollHeight - node.clientHeight
                    const overscroll = axis === 'x' ? style.overscrollBehaviorX : style.overscrollBehaviorY
                    return maximum > 0 && (clampDelta(delta, position, maximum) !== 0 || overscroll !== 'auto')
                }
                if (intercepts('x', deltaX) || intercepts('y', deltaY)) break
            }
        }
    }
    return null
}

const randomBetween = (min: number, max: number): number => Math.round(min + Math.random() * (max - min))

export async function humanScroll(
    page: Page,
    request: ScrollRequest,
    { timeout = 30000, signal }: ScrollOptions = {}
): Promise<void> {
    const deadline = Date.now() + timeout
    const remaining = (): number => {
        signal?.throwIfAborted()
        if (page.isClosed()) throw new Error('Scroll page closed')
        const milliseconds = deadline - Date.now()
        if (milliseconds <= 0) throw new Error(`Scrolling timed out after ${timeout}ms`)
        return milliseconds
    }
    const pause = (milliseconds: number): Promise<void> =>
        wait(Math.min(milliseconds, remaining()), undefined, { signal })

    remaining()
    if ('distance' in request && !Number.isFinite(request.distance)) throw new Error('Scroll distance must be finite')
    await page.bringToFront()
    const subject = 'target' in request ? request.target : (request.container ?? page.locator('html'))
    let destination: { x: number; y: number } | null = null
    if (!('target' in request)) {
        const position = await subject.evaluate(
            element => {
                const root =
                    element === document.documentElement
                        ? (document.scrollingElement ?? document.documentElement)
                        : element
                return {
                    x: root.scrollLeft,
                    y: root.scrollTop,
                    maximum: Math.max(0, root.scrollHeight - root.clientHeight)
                }
            },
            undefined,
            { timeout: remaining() }
        )
        destination = {
            x: position.x,
            y: Math.max(
                0,
                Math.min(
                    position.maximum,
                    'distance' in request ? position.y + request.distance : Math.random() * position.maximum
                )
            )
        }
    }

    let previous: ScrollState | undefined
    let stalled = 0
    let burst = randomBetween(3, 5)
    for (;;) {
        const state = await subject.evaluate(inspectScroll, destination, { timeout: remaining() })
        if (!state) return
        if (
            previous?.container === state.container &&
            Math.abs(previous.position.x - state.position.x) < 0.5 &&
            Math.abs(previous.position.y - state.position.y) < 0.5
        ) {
            if (++stalled >= 3)
                throw new Error('Scrolling did not move; the page or panel may be blocking mouse-wheel input')
        } else stalled = 0

        const cursor = await getGhostCursor(page)
        const location = cursor.getLocation()
        if (Math.hypot(location.x - state.point.x, location.y - state.point.y) > 8) await cursor.moveTo(state.point)
        remaining()

        const pointer = cursor.getLocation()
        await page.mouse.move(pointer.x, pointer.y)
        const distance = Math.max(Math.abs(state.deltaX), Math.abs(state.deltaY))
        const scale = Math.min(distance, randomBetween(70, 160)) / distance
        await page.mouse.wheel(state.deltaX * scale, state.deltaY * scale)
        previous = state
        await pause(randomBetween(85, 160))
        if (--burst === 0) {
            await pause(randomBetween(180, 350))
            burst = randomBetween(3, 5)
        }
    }
}
