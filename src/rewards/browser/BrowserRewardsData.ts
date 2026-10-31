import { useRenderedDailySet } from './parsers/RenderedDailySet'
import { browserTimeout } from '../../browser/BrowserTiming'
import { HttpError, isTerminalHttpError } from '../../network/HttpError'
import type { TaskDataSource } from '../types/DataSource'
import type { BrowserContext, Page } from 'patchright'

import { URLs } from '../../constants/urls'
import { BrowserTaskPage } from '../../browser/BrowserTaskPage'
import type { RewardsState } from '../types/RewardsState'
import type { BotContext } from '../../core/BotContext'
import { mapFlyoutToDashboard, type RewardsFlyoutData } from '../shared/data/FlyoutMapper'
import { readRewardCards } from './parsers/RewardCardParser'
import { extractFlyoutViewModel } from './parsers/FlyoutPageParser'
import { browserTaskPass } from './BrowserTaskPass'
import { BrowserRewardNavigator } from './actions/BrowserRewardNavigator'

export class BrowserRewardsData implements TaskDataSource {
    constructor(
        private readonly bot: BotContext,
        private readonly getActivePage: () => Page | null
    ) {}

    private pending = new WeakMap<BrowserContext, Promise<RewardsState>>()

    reset(): void {
        this.pending = new WeakMap()
    }

    async bootstrap(): Promise<void> {
        this.bot.nextActions = {}
        this.bot.nextRouterStateTree = ''
        this.bot.logger.debug(this.bot.isMobile, 'BOOTSTRAP', 'Browser context ready | userDataSource=rewards-api')
    }

    async getTaskData(): Promise<RewardsState> {
        const pass = browserTaskPass.getStore()
        if (pass?.surface === 'earn' && pass.readEarn) return pass.readEarn()
        const sourcePage = this.getActivePage()
        if (!sourcePage) throw new Error('Browser mode requires an open browser page')

        const context = sourcePage.context()
        const pending = this.pending.get(context)
        if (pending) return pending
        const request = this.readFlyoutTasks(sourcePage)
        this.pending.set(context, request)
        try {
            return await request
        } finally {
            this.pending.delete(context)
        }
    }

    private async readFlyoutTasks(source: Page): Promise<RewardsState> {
        const account = await this.bot.rewards.getDashboardData()
        const pass = browserTaskPass.getStore()
        const passPage = pass?.surface === 'flyout' ? pass.page : undefined
        const task = passPage ? undefined : await BrowserTaskPage.create(source)
        const page = passPage ?? task!.page
        try {
            const navigator = new BrowserRewardNavigator(this.bot)
            await navigator.openFlyout(page, true)

            const payload: RewardsFlyoutData = extractFlyoutViewModel(await page.content())
            let dashboard = mapFlyoutToDashboard(payload, account)
            const expectedDailyCards = Math.max(
                0,
                ...Object.values(dashboard.dashboard.dailySetPromotions).map(items => items.length)
            )
            if (expectedDailyCards || (await page.locator('#daily_set_card').count())) {
                if (expectedDailyCards) {
                    await page
                        .waitForFunction(
                            expected => document.querySelectorAll('#daily_set_card a[href]').length >= expected,
                            expectedDailyCards,
                            { timeout: browserTimeout(this.bot, 'optional'), polling: 100 }
                        )
                        .catch(error => {
                            this.bot.signal.throwIfAborted()
                            this.bot.logger.debug(
                                this.bot.isMobile,
                                'DAILY-SET',
                                `Rendered Daily Set readiness unavailable; using displayed cards only | expectedCards=${expectedDailyCards} | ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`
                            )
                        })
                }
                const cards = await readRewardCards(page, page.locator('#daily_set_card a[href]'))
                const today = this.bot.utils.formatDate(Date.now(), this.bot.userData.timezone)
                const modelDates = Object.keys(dashboard.dashboard.dailySetPromotions)
                dashboard = useRenderedDailySet(dashboard, cards, today)
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'DAILY-SET',
                    `Using rendered Daily Set | localDate=${today} | modelDates=${modelDates.join(',')} | renderedCards=${cards.filter(card => card.visible).length} | offerIds=${dashboard.dashboard.dailySetPromotions[today]!.map(item => item.offerId).join(',')}`
                )
            }
            const dailySetCount = Object.values(dashboard.dashboard.dailySetPromotions ?? {}).flat().length
            const moreCount = dashboard.dashboard.morePromotions?.length ?? 0
            const metadata = dashboard.sourceInfo?.metadata
            this.bot.logger.debug(
                this.bot.isMobile,
                'BROWSER-MODE',
                `Read rendered Bing Rewards flyout | dailySet=${dailySetCount} | more=${moreCount}` +
                    ` | sections=${metadata?.parsedSections.length ?? 0}` +
                    ` | promotionSections=${metadata?.promotionSections.length ?? 0}` +
                    ` | catalogItems=${metadata?.catalogItemCount ?? 0}` +
                    ` | orders=${metadata?.orderCount ?? 0}` +
                    ` | suggestions=${metadata?.suggestedSearchCount ?? 0}`
            )
            return dashboard
        } finally {
            await task?.close()
        }
    }

    async getPageHtml(url: string, route: string): Promise<string | null> {
        const source = this.getActivePage()
        if (!source) return null
        const pass = browserTaskPass.getStore()
        const passPage = route === '/earn' && pass?.surface === 'earn' && !pass.page?.isClosed() ? pass.page : undefined
        const task = passPage
            ? undefined
            : await (new URL(url).origin === URLs.rewards.origin
                  ? BrowserTaskPage.createRewards(source)
                  : BrowserTaskPage.create(source))
        const page = passPage ?? task!.page

        try {
            if (route === '/earn') {
                await new BrowserRewardNavigator(this.bot).openEarn(page, true)
            } else {
                const response = await page.goto(url, {
                    waitUntil: 'domcontentloaded',
                    timeout: browserTimeout(this.bot, 'navigation')
                })
                if (!response?.ok()) {
                    const status = response?.status() ?? 0
                    throw new HttpError(
                        status,
                        { status, headers: response?.headers() ?? {} },
                        `Rendered Rewards page returned status ${status}`
                    )
                }
                await this.bot.browser.utils.dismissMessages(page)
            }
            return await page.content()
        } catch (error) {
            this.bot.signal.throwIfAborted()
            if (isTerminalHttpError(error)) throw error
            this.bot.logger.warn(
                this.bot.isMobile,
                'BROWSER-MODE',
                `Page read failed | route=${route} | ${error instanceof Error ? error.message : String(error)}`
            )
            return null
        } finally {
            await task?.close()
        }
    }
}
