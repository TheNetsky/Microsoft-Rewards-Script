import type { Page } from 'patchright'
import { browserTimeout } from '../../../browser/BrowserTiming'
import { isBrowserPageCrashed, isBrowserPageCrashError } from '../../../browser/BrowserPageHealth'
import { URLs } from '../../../constants/urls'
import { BaseActivity } from '../../shared/activities/BaseActivity'
import { bingSearchBox, humanPreFocusPauseMs, humanType, submitSearch } from './HumanTyping'

const MAX_QUERY_ATTEMPTS = 5

export class BingSearchPage extends BaseActivity {
    async submit(
        page: Page,
        query: string,
        context = 'SEARCH-BING',
        isMobile = this.bot.isMobile,
        maxAttempts = MAX_QUERY_ATTEMPTS,
        replaceCrashedPage?: () => Promise<Page>
    ): Promise<Page> {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            this.bot.signal.throwIfAborted()
            try {
                if (isBrowserPageCrashed(page)) {
                    if (!replaceCrashedPage) throw new Error('Bing search page crashed')
                    page = await replaceCrashedPage()
                }
                await this.prepare(page)
                await this.bot.utils.wait(humanPreFocusPauseMs())
                const searchBox = await humanType(page, query, browserTimeout(this.bot), this.bot.signal)
                await submitSearch(page, query, searchBox, browserTimeout(this.bot, 'navigation'), this.bot.signal)
                return page
            } catch (error) {
                this.bot.signal.throwIfAborted()
                const crashed = isBrowserPageCrashed(page) || isBrowserPageCrashError(error)
                const retry = attempt < maxAttempts && !page.isClosed() && (!crashed || Boolean(replaceCrashedPage))
                const message = (error instanceof Error ? error.message : String(error)).split(/\r?\n/)[0]
                const recovery = crashed ? 'replacing crashed Bing tab' : 'reloading Bing'
                this.bot.logger.warn(
                    isMobile,
                    context,
                    `Search attempt ${attempt}/${maxAttempts} failed${retry ? `; ${recovery} before retry` : ''}` +
                        ` | query=${JSON.stringify(query)} | ${message}`
                )
                this.bot.logger.debug(isMobile, 'SEARCH-DETAIL', error instanceof Error ? error : String(error))
                if (!retry) {
                    const failure = new Error(
                        `Bing search failed after ${attempt} attempt(s) | query=${JSON.stringify(query)} | ${message}`,
                        { cause: error }
                    )
                    if (error instanceof Error) failure.name = error.name
                    throw failure
                }

                if (crashed && replaceCrashedPage) page = await replaceCrashedPage()
                else
                    await this.recover(page).catch(recoveryError => {
                        this.bot.signal.throwIfAborted()
                        if (page.isClosed()) throw recoveryError
                        this.bot.logger.debug(
                            isMobile,
                            'SEARCH-DETAIL',
                            recoveryError instanceof Error ? recoveryError : String(recoveryError)
                        )
                    })
                await this.bot.utils.wait(2000)
            }
        }
        throw new Error('No Bing search attempt was available')
    }

    private async prepare(page: Page): Promise<void> {
        await page.bringToFront()
        const current = new URL(page.url())
        if (current.origin !== URLs.bing.origin || !['/', '/search'].includes(current.pathname)) {
            await this.open(page)
        }
        await this.bot.browser.utils.dismissMessages(page)
        await bingSearchBox(page).waitFor({ state: 'visible', timeout: browserTimeout(this.bot) })
    }

    private async recover(page: Page): Promise<void> {
        this.bot.signal.throwIfAborted()
        if (new URL(page.url()).origin !== URLs.bing.origin) {
            await this.open(page)
            return
        }
        try {
            await page.reload({ waitUntil: 'domcontentloaded', timeout: browserTimeout(this.bot, 'navigation') })
        } catch (error) {
            this.bot.signal.throwIfAborted()
            if (page.isClosed()) throw error
            this.bot.logger.debug(this.bot.isMobile, 'SEARCH-DETAIL', `Bing reload failed | ${String(error)}`)
            await this.open(page)
        }
    }

    async open(page: Page): Promise<void> {
        await page.goto(URLs.bing.origin, {
            waitUntil: 'domcontentloaded',
            timeout: browserTimeout(this.bot, 'navigation')
        })
    }
}
