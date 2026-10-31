import { GhostCursor } from 'ghost-cursor-patchright'
import type { Page } from 'patchright'

const cursors = new WeakMap<Page, Promise<GhostCursor>>()

export async function getGhostCursor(page: Page): Promise<GhostCursor> {
    let cursor = cursors.get(page)
    if (!cursor) {
        cursor = GhostCursor.create(page, { performRandomMoves: false })
        cursors.set(page, cursor)
        page.once('close', () => cursors.delete(page))
    }
    return cursor.catch(error => {
        cursors.delete(page)
        throw error
    })
}
