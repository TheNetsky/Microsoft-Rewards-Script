import type { Page } from 'patchright'
import * as fs from 'fs'
import path from 'path'

import { Workers } from '../../Workers'
import { QueryCore } from '../../QueryEngine'

import type { BasePromotion } from '../../../interface/DashboardData'

export class SearchOnBing extends Workers {
    private bingHome = 'https://bing.com'

    private cookieHeader: string = ''

    private fingerprintHeader: { [x: string]: string } = {}

    private gainedPoints: number = 0

    private success: boolean = false
    private gainedAnyPoints: boolean = false

    private oldBalance: number = this.bot.userData.currentPoints

    private toAttributeMap(attributes: unknown): Record<string, unknown> {
        if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
            return {}
        }
        return attributes as Record<string, unknown>
    }

    private getAttrValue(attributes: Record<string, unknown>, key: string): unknown {
        const direct = attributes[key]
        if (direct !== undefined) return direct
        const lowerKey = key.toLowerCase()
        const found = Object.entries(attributes).find(([k]) => k.toLowerCase() === lowerKey)
        return found?.[1]
    }

    constructor(bot: any) {
        super(bot)
    }

    public async doSearchOnBing(promotion: BasePromotion, page: Page) {
        const offerId = promotion.offerId
        this.oldBalance = Number(this.bot.userData.currentPoints ?? 0)
        this.success = false
        this.gainedAnyPoints = false

        // Respect search worker config: skip Bing searches on mobile/desktop if disabled
        if (this.bot.isMobile && !this.bot.config.workers.doMobileSearch) {
            this.bot.logger.info(
                this.bot.isMobile,
                'SEARCH-ON-BING',
                `Skipping SearchOnBing (mobile search disabled in config) | offerId=${offerId} | title="${promotion.title}"`
            )
            return
        }
        if (!this.bot.isMobile && !this.bot.config.workers.doDesktopSearch) {
            this.bot.logger.info(
                this.bot.isMobile,
                'SEARCH-ON-BING',
                `Skipping SearchOnBing (desktop search disabled in config) | offerId=${offerId} | title="${promotion.title}"`
            )
            return
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'SEARCH-ON-BING',
            `Starting SearchOnBing | offerId=${offerId} | title="${promotion.title}" | currentPoints=${this.oldBalance}`
        )

        try {
            this.cookieHeader = this.bot.browser.func.buildCookieHeader(
                this.bot.isMobile ? this.bot.cookies.mobile : this.bot.cookies.desktop,
                ['bing.com', 'live.com', 'microsoftonline.com']
            )

            const fingerprintHeaders = { ...this.bot.fingerprint.headers }
            delete fingerprintHeaders['Cookie']
            delete fingerprintHeaders['cookie']
            this.fingerprintHeader = fingerprintHeaders

            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-ON-BING',
                `Prepared headers for SearchOnBing | offerId=${offerId} | cookieLength=${this.cookieHeader.length} | fingerprintHeaderKeys=${Object.keys(this.fingerprintHeader).length}`
            )

            const attributes = this.toAttributeMap(promotion.attributes)
            const attrProgress = Number(this.getAttrValue(attributes, 'progress') ?? 0)
            const attrMax = Number(this.getAttrValue(attributes, 'max') ?? 0)
            const attrCompleteRaw = this.getAttrValue(attributes, 'complete')
            const attrComplete =
                typeof attrCompleteRaw === 'string' ? attrCompleteRaw.toLowerCase() === 'true' : Boolean(attrCompleteRaw)

            const initialProgress = Number(promotion.pointProgress ?? attrProgress ?? 0)
            const initialProgressMax = Number(promotion.pointProgressMax ?? attrMax ?? 0)
            const initiallyComplete =
                Boolean(promotion.complete) ||
                attrComplete ||
                (initialProgressMax > 0 && initialProgress >= initialProgressMax)

            const preSearchCompletion = initiallyComplete
                ? { complete: true, pointProgress: initialProgress, pointProgressMax: initialProgressMax }
                : await this.checkActivityCompletionFromDashboard(offerId, initialProgressMax)

            if (preSearchCompletion.complete) {
                this.success = true
                this.bot.logger.info(
                    this.bot.isMobile,
                    'SEARCH-ON-BING',
                    `Extra Search Activity Completed | offerId=${offerId} | progress=${preSearchCompletion.pointProgress}/${preSearchCompletion.pointProgressMax}`
                )
                return
            }

            // Do the bing search here
            const queries = await this.getSearchQueries(promotion)

            // Run through the queries
            await this.searchBing(page, queries, promotion)

            if (this.success) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'SEARCH-ON-BING',
                    `Completed SearchOnBing | offerId=${offerId} | startBalance=${this.oldBalance} | finalBalance=${this.bot.userData.currentPoints}`
                )
            } else if (this.gainedAnyPoints) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'SEARCH-ON-BING',
                    `SearchOnBing gained points but activity is still incomplete | offerId=${offerId} | startBalance=${this.oldBalance} | finalBalance=${this.bot.userData.currentPoints}`
                )
            } else {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'SEARCH-ON-BING',
                    `Failed SearchOnBing | offerId=${offerId} | startBalance=${this.oldBalance} | finalBalance=${this.bot.userData.currentPoints}`
                )
            }
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'SEARCH-ON-BING',
                `Error in doSearchOnBing | offerId=${promotion.offerId} | message=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async searchBing(page: Page, queries: string[], promotion: BasePromotion) {
        queries = [...new Set(queries)]
        let lastBalance = this.oldBalance
        let localProgress = Number(promotion.pointProgress ?? 0)
        const localProgressMax = Number(promotion.pointProgressMax ?? 0)
        const markComplete = (completion: { pointProgress: number; pointProgressMax: number }) => {
            this.success = true
            this.bot.logger.info(
                this.bot.isMobile,
                'SEARCH-ON-BING-SEARCH',
                `Extra Search Activity Completed | offerId=${promotion.offerId} | progress=${completion.pointProgress}/${completion.pointProgressMax}`
            )
        }

        this.bot.logger.debug(
            this.bot.isMobile,
            'SEARCH-ON-BING-SEARCH',
            `Starting search loop | queriesCount=${queries.length} | startBalance=${this.oldBalance}`
        )

        let i = 0
        for (const query of queries) {
            try {
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-ON-BING-SEARCH', `Processing query | query="${query}"`)

                // Use the page passed to this method (mobile or desktop execution context).
                await page.goto(this.bingHome)

                // Wait until page loaded
                await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})

                await this.bot.browser.utils.tryDismissAllMessages(page)

                const searchBar = '#sb_form_q'

                const searchBox = page.locator(searchBar)
                await searchBox.waitFor({ state: 'attached', timeout: 15000 })

                await this.bot.utils.wait(500)
                await this.bot.browser.utils.ghostClick(page, searchBar, { clickCount: 3 })
                await searchBox.fill('')

                await page.keyboard.type(query, { delay: 50 })
                await page.keyboard.press('Enter')

                await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 7000))

                // Check for point updates
                const newBalance = await this.bot.browser.func.getCurrentPoints()
                this.gainedPoints = newBalance - lastBalance

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SEARCH-ON-BING-SEARCH',
                    `Balance check after query | query="${query}" | previousBalance=${lastBalance} | newBalance=${newBalance} | gainedPoints=${this.gainedPoints}`
                )
                lastBalance = newBalance

                if (this.gainedPoints > 0) {
                    this.gainedAnyPoints = true
                    this.bot.userData.currentPoints = newBalance
                    this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + this.gainedPoints
                    localProgress += this.gainedPoints

                    const completion = await this.checkActivityCompletionFromDashboard(
                        promotion.offerId,
                        Number(promotion.pointProgressMax ?? 0)
                    )
                    const displayProgress = Math.max(completion.pointProgress, localProgress)
                    const displayProgressMax = completion.pointProgressMax > 0 ? completion.pointProgressMax : localProgressMax

                    this.bot.logger.info(
                        this.bot.isMobile,
                        'SEARCH-ON-BING-SEARCH',
                        `SearchOnBing query completed | query="${query}" | gainedPoints=${this.gainedPoints} | previousBalance=${newBalance - this.gainedPoints} | newBalance=${newBalance} | progress=${displayProgress}/${displayProgressMax}`,
                        'green'
                    )
                    if (
                        completion.complete ||
                        (displayProgressMax > 0 && displayProgress >= displayProgressMax)
                    ) {
                        markComplete({ pointProgress: displayProgress, pointProgressMax: displayProgressMax })
                        return
                    }

                } else {
                    const completion = await this.checkActivityCompletionFromDashboard(
                        promotion.offerId,
                        Number(promotion.pointProgressMax ?? 0)
                    )
                    if (completion.complete) {
                        markComplete(completion)
                        return
                    }

                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'SEARCH-ON-BING-SEARCH',
                        `${++i}/${queries.length} | noPoints=1 | query="${query}"`
                    )
                }
            } catch (error) {
                this.bot.logger.error(
                    this.bot.isMobile,
                    'SEARCH-ON-BING-SEARCH',
                    `Error during search loop | query="${query}" | message=${error instanceof Error ? error.message : String(error)}`
                )
            } finally {
                await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 15000))
            }
        }

        this.bot.logger.warn(
            this.bot.isMobile,
            'SEARCH-ON-BING-SEARCH',
            `Finished all queries without completing activity | queriesTried=${queries.length} | startBalance=${this.oldBalance} | finalBalance=${this.bot.userData.currentPoints}`
        )
    }

    private async checkActivityCompletionFromDashboard(
        offerId: string,
        fallbackPointProgressMax: number
    ): Promise<{ complete: boolean; pointProgress: number; pointProgressMax: number }> {
        try {
            const toCompletion = (promotion: {
                complete?: unknown
                pointProgress?: unknown
                pointProgressMax?: unknown
                attributes?: unknown
                offerId?: unknown
            }) => {
                const attributes = this.toAttributeMap(promotion.attributes)
                const attrProgress = Number(this.getAttrValue(attributes, 'progress') ?? 0)
                const attrMax = Number(this.getAttrValue(attributes, 'max') ?? 0)
                const pointProgress = Number(promotion.pointProgress ?? attrProgress ?? 0)
                const pointProgressMax = Number(promotion.pointProgressMax ?? attrMax ?? fallbackPointProgressMax ?? 0)
                const attrCompleteRaw = this.getAttrValue(attributes, 'complete')
                const attrComplete =
                    typeof attrCompleteRaw === 'string' ? attrCompleteRaw.toLowerCase() === 'true' : Boolean(attrCompleteRaw)
                const complete =
                    Boolean(promotion.complete) || attrComplete || (pointProgressMax > 0 && pointProgress >= pointProgressMax)

                return { complete, pointProgress, pointProgressMax, matchedOfferId: String(promotion.offerId ?? '') }
            }

            const findMatchingPromotion = (
                promotions: Array<{ offerId?: unknown; attributes?: unknown; destinationUrl?: unknown }>,
                offerKey: string
            ) => {
                const matched = promotions.find(x => {
                    const topLevelOfferId = String(x.offerId ?? '').toLowerCase()
                    const attrs = this.toAttributeMap(x.attributes)
                    const attrOfferId = String(
                        this.getAttrValue(attrs, 'offerid') ?? this.getAttrValue(attrs, 'offerId') ?? ''
                    ).toLowerCase()
                    return topLevelOfferId === offerKey || attrOfferId === offerKey
                })
                return matched ?? null
            }

            const data = await this.bot.browser.func.getDashboardData()
            const offerKey = offerId.toLowerCase()
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-ON-BING-SEARCH',
                `Dashboard completion check fetched data | offerId=${offerId}`
            )

            const dailySetPromotions = Object.values(data.dailySetPromotions ?? {}).flat()
            const punchCardPromotions = (data.punchCards ?? []).flatMap(x => [
                ...(x.childPromotions ?? []),
                ...(x.parentPromotion ? [x.parentPromotion] : [])
            ])

            const allPromotions = [
                ...(data.morePromotions ?? []),
                ...(data.morePromotionsWithoutPromotionalItems ?? []),
                ...(data.promotionalItems ?? []),
                ...dailySetPromotions,
                ...punchCardPromotions
            ]

            let matched = findMatchingPromotion(allPromotions, offerKey)
            if (!matched) {
                const sampleOfferIds = allPromotions
                    .slice(0, 8)
                    .map(x => String(x.offerId ?? this.getAttrValue(this.toAttributeMap(x.attributes), 'offerid') ?? ''))
                    .filter(Boolean)
                    .join(', ')
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SEARCH-ON-BING-SEARCH',
                    `Dashboard completion check no match | offerId=${offerId} | sampleOffers=[${sampleOfferIds}]`
                )
                return { complete: false, pointProgress: 0, pointProgressMax: fallbackPointProgressMax }
            }

            const { complete, pointProgress, pointProgressMax, matchedOfferId } = toCompletion(matched)
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-ON-BING-SEARCH',
                `Dashboard completion check matched | offerId=${offerId} | matchedOfferId=${matchedOfferId} | progress=${pointProgress}/${pointProgressMax} | complete=${complete}`
            )

            return { complete, pointProgress, pointProgressMax }
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-ON-BING-SEARCH',
                `Dashboard completion check failed | offerId=${offerId} | error=${error instanceof Error ? error.message : String(error)}`
            )
            return { complete: false, pointProgress: 0, pointProgressMax: fallbackPointProgressMax }
        }
    }

    private async getSearchQueries(promotion: BasePromotion): Promise<string[]> {
        interface Queries {
            title: string
            queries: string[]
        }

        let queries: Queries[] = []
        const queryCore = new QueryCore(this.bot)
        const locale = (this.bot.userData.geoLocale ?? 'US').toUpperCase()
        const langCode = (this.bot.userData.langCode ?? 'en').toLowerCase()
        const configuredSources = this.bot.config.searchSettings.queryEngines ?? []
        const sourceOrder = (configuredSources as ('google' | 'wikipedia' | 'reddit' | 'local')[]).filter(
            (source, index, arr) => arr.indexOf(source) === index
        )

        try {
            const generateMainQueries = () =>
                queryCore.queryManager({ shuffle: true, related: false, langCode, geoLocale: locale, sourceOrder })
            const offerIdLower = String(promotion.offerId ?? '').toLowerCase()

            if (offerIdLower === 'ww_rewards_banner_search_april_202604') {
                const mainQueries = await generateMainQueries()
                if (mainQueries.length) {
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'SEARCH-ON-BING-QUERY',
                        `Special activity detected, using main QueryCore | offerId=${promotion.offerId} | count=${mainQueries.length}`
                    )
                    return mainQueries
                }
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'SEARCH-ON-BING-QUERY',
                    `Special activity detected, but QueryCore returned 0 queries | offerId=${promotion.offerId}`
                )
            }

            // Gemini disabled — skipping activity-seeded query generation

            if (this.bot.config.searchOnBingLocalQueries) {
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-ON-BING-QUERY', 'Using local queries config file')

                const data = fs.readFileSync(path.join(__dirname, '../bing-search-activity-queries.json'), 'utf8')
                queries = JSON.parse(data)

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SEARCH-ON-BING-QUERY',
                    `Loaded queries config | source=local | entries=${queries.length}`
                )
            } else {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SEARCH-ON-BING-QUERY',
                    'Fetching queries config from remote repository'
                )

                // Fetch from the repo directly so the user doesn't need to redownload the script for the new activities
                const response = await this.bot.axios.request({
                    method: 'GET',
                    url: 'https://raw.githubusercontent.com/TheNetsky/Microsoft-Rewards-Script/refs/heads/v3/src/functions/bing-search-activity-queries.json'
                })
                queries = response.data

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SEARCH-ON-BING-QUERY',
                    `Loaded queries config | source=remote | entries=${queries.length}`
                )
            }

            const answers = queries.find(
                x => this.bot.utils.normalizeString(x.title) === this.bot.utils.normalizeString(promotion.title)
            )

            if (answers && answers.queries.length > 0) {
                const answer = this.bot.utils.shuffleArray(answers.queries)

                this.bot.logger.info(
                    this.bot.isMobile,
                    'SEARCH-ON-BING-QUERY',
                    `Found answers for activity title | source=${this.bot.config.searchOnBingLocalQueries ? 'local' : 'remote'} | title="${promotion.title}" | answersCount=${answer.length} | firstQuery="${answer[0]}"`
                )

                return answer
            } else {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'SEARCH-ON-BING-QUERY',
                    `No matching title in queries config | source=${this.bot.config.searchOnBingLocalQueries ? 'local' : 'remote'} | title="${promotion.title}"`
                )

                const promotionDescription = String(promotion.description ?? '').toLowerCase().trim()
                const queryDescription = promotionDescription.replace('search on bing', '').trim()

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SEARCH-ON-BING-QUERY',
                    `Requesting Bing suggestions | queryDescription="${queryDescription}"`
                )

                const bingSuggestions = await queryCore.getBingSuggestions(queryDescription)

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SEARCH-ON-BING-QUERY',
                    `Bing suggestions result | count=${bingSuggestions.length} | title="${promotion.title}"`
                )

                // If no suggestions found, use the main QueryCore generation flow.
                if (!bingSuggestions.length) {
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'SEARCH-ON-BING-QUERY',
                        `No suggestions found, generating via QueryCore main flow | title="${promotion.title}"`
                    )

                    try {
                        const mainQueries = await queryCore.queryManager({
                            shuffle: true,
                            related: false,
                            langCode,
                            geoLocale: locale,
                            sourceOrder
                        })
                        if (mainQueries.length > 0) {
                            this.bot.logger.info(
                                this.bot.isMobile,
                                'SEARCH-ON-BING-QUERY',
                                `Using QueryCore-generated queries | count=${mainQueries.length} | title="${promotion.title}"`
                            )
                            return mainQueries
                        }
                    } catch (queryError) {
                        this.bot.logger.warn(
                            this.bot.isMobile,
                            'SEARCH-ON-BING-QUERY',
                            `QueryCore generation failed, falling back to activity title | title="${promotion.title}" | error=${queryError instanceof Error ? queryError.message : String(queryError)}`
                        )
                    }

                    // Final fallback to activity title
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'SEARCH-ON-BING-QUERY',
                        `Using activity title as final fallback | title="${promotion.title}"`
                    )
                    return [promotion.title]
                } else {
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'SEARCH-ON-BING-QUERY',
                        `Using Bing suggestions as search queries | count=${bingSuggestions.length} | title="${promotion.title}"`
                    )
                    return bingSuggestions
                }
            }
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'SEARCH-ON-BING-QUERY',
                `Error while resolving search queries | title="${promotion.title}" | message=${error instanceof Error ? error.message : String(error)} | fallback=promotionTitle`
            )
            return [promotion.title]
        }
    }
}
