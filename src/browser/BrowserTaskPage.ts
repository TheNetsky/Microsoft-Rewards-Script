import type { Page } from 'patchright'
import { createRewardsTaskContext, synchronizeRewardsCookies } from './RewardsBrowserContext'
import { closeBrowserPage } from './BrowserPageRequests'

const popupGuards = new WeakMap<Page, () => void>()

export class BrowserTaskPage {
    private readonly pages = new Set<Page>()
    private closePromise?: Promise<void>
    private closing = false

    private readonly track = (page: Page): void => {
        if (page === this.source || this.pages.has(page)) return
        this.pages.add(page)
        page.on('popup', this.track)
        if (this.closing) {
            void closeBrowserPage(page)
                .catch(() => undefined)
                .finally(() => {
                    page.off('popup', this.track)
                    this.pages.delete(page)
                })
        }
    }

    private constructor(
        readonly page: Page,
        private readonly source: Page
    ) {
        popupGuards.get(page)?.()
        if (page !== source) this.pages.add(page)
        page.on('popup', this.track)
    }

    static async create(source: Page, reuseSource = false): Promise<BrowserTaskPage> {
        const task = new BrowserTaskPage(reuseSource ? source : await source.context().newPage(), source)
        try {
            await task.page.bringToFront()
            return task
        } catch (error) {
            await task.close()
            throw error
        }
    }

    static async createRewards(source: Page, reuseSource = false): Promise<BrowserTaskPage> {
        const context = await createRewardsTaskContext(source.context())
        if (!context) return this.create(source, reuseSource)
        let task: BrowserTaskPage | undefined
        try {
            task = new BrowserTaskPage(await context.newPage(), source)
            await task.page.bringToFront()
            return task
        } catch (error) {
            await task?.close().catch(() => undefined)
            throw error
        }
    }

    close(): Promise<void> {
        return (this.closePromise ??= this.closeOwnedPages())
    }

    private async closeOwnedPages(): Promise<void> {
        this.closing = true
        try {
            while (this.pages.size) {
                const batch = [...this.pages]
                await Promise.allSettled(batch.map(closeBrowserPage))
                for (const page of batch) {
                    page.off('popup', this.track)
                    this.pages.delete(page)
                }
            }
            await synchronizeRewardsCookies(this.page.context())
        } finally {
            if (this.page === this.source && !this.page.isClosed()) {
                popupGuards.get(this.page)?.()
                const stop = (): void => {
                    this.page.off('popup', this.track)
                    this.page.off('close', stop)
                    if (popupGuards.get(this.page) === stop) popupGuards.delete(this.page)
                }
                popupGuards.set(this.page, stop)
                this.page.once('close', stop)
            } else this.page.off('popup', this.track)
            if (!this.source.isClosed()) await this.source.bringToFront().catch(() => undefined)
        }
    }
}
