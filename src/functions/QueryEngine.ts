import type { AxiosRequestConfig } from 'axios'
import type { GoogleSearch, GoogleTrendsResponse, RedditListing, WikipediaTopResponse } from '../interface/Search'
import type { MicrosoftRewardsBot } from '../index'
import { QueryEngine } from '../interface/Config'

export class QueryCore {
    constructor(private bot: MicrosoftRewardsBot) {}

    async queryManager(
        options: {
            shuffle?: boolean
            sourceOrder?: QueryEngine[]
            related?: boolean
            langCode?: string
            geoLocale?: string
        } = {}
    ): Promise<string[]> {
        const {
            shuffle = false,
            sourceOrder = ['google', 'wikipedia', 'reddit'],
            related = true,
            langCode = 'en',
            geoLocale = 'US'
        } = options

        try {
            this.bot.logger.debug(
                this.bot.isMobile,
                'QUERY-MANAGER',
                `start | shuffle=${shuffle}, related=${related}, lang=${langCode}, geo=${geoLocale}, sources=${sourceOrder.join(',')}`
            )

            const topicLists: string[][] = []

            const sourceHandlers: Record<
                'google' | 'wikipedia' | 'reddit',
                (() => Promise<string[]>) | (() => string[])
            > = {
                google: async () => {
                    const topics = await this.getGoogleTrends(geoLocale.toUpperCase()).catch(() => [])
                    this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `google: ${topics.length}`)
                    return topics
                },
                wikipedia: async () => {
                    const topics = await this.getWikipediaTrending(langCode).catch(() => [])
                    this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `wikipedia: ${topics.length}`)
                    return topics
                },
                reddit: async () => {
                    const topics = await this.getRedditTopics().catch(() => [])
                    this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `reddit: ${topics.length}`)
                    return topics
                }
            }

            for (const source of sourceOrder) {
                const handler = sourceHandlers[source]
                if (!handler) continue

                const topics = await Promise.resolve(handler())
                if (topics.length) topicLists.push(topics)
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'QUERY-MANAGER',
                `sources combined | rawTotal=${topicLists.flat().length}`
            )

            const baseTopics = this.normalizeAndDedupe(topicLists.flat())

            if (!baseTopics.length) {
                this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', 'No base topics found (all sources empty)')
                return []
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'QUERY-MANAGER',
                `baseTopics dedupe | before=${topicLists.flat().length} | after=${baseTopics.length}`
            )
            this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `baseTopics: ${baseTopics.length}`)

            const clusters = related ? await this.buildRelatedClusters(baseTopics, langCode) : baseTopics.map(t => [t])

            this.bot.utils.shuffleArray(clusters)
            this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', 'clusters shuffled')

            let finalQueries = clusters.flat()
            this.bot.logger.debug(
                this.bot.isMobile,
                'QUERY-MANAGER',
                `clusters flattened | total=${finalQueries.length}`
            )

            // Do not cluster searches and shuffle
            if (shuffle) {
                this.bot.utils.shuffleArray(finalQueries)
                this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', 'finalQueries shuffled')
            }

            finalQueries = this.normalizeAndDedupe(finalQueries)
            this.bot.logger.debug(
                this.bot.isMobile,
                'QUERY-MANAGER',
                `finalQueries dedupe | after=${finalQueries.length}`
            )

            if (!finalQueries.length) {
                this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', 'finalQueries deduped to 0')
                return []
            }

            this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `final queries: ${finalQueries.length}`)

            return finalQueries
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'QUERY-MANAGER',
                `error: ${error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error)}`
            )
            return []
        }
    }

    private async buildRelatedClusters(baseTopics: string[], langCode: string): Promise<string[][]> {
        const clusters: string[][] = []

        const LIMIT = 50
        const head = baseTopics.slice(0, LIMIT)
        const tail = baseTopics.slice(LIMIT)

        this.bot.logger.debug(
            this.bot.isMobile,
            'QUERY-MANAGER',
            `related enabled | baseTopics=${baseTopics.length} | expand=${head.length} | passthrough=${tail.length} | lang=${langCode}`
        )
        this.bot.logger.debug(
            this.bot.isMobile,
            'QUERY-MANAGER',
            `bing expansion enabled | limit=${LIMIT} | totalCalls=${head.length * 2}`
        )

        for (const topic of head) {
            const suggestions = await this.getBingSuggestions(topic, langCode).catch(() => [])
            const relatedTerms = await this.getBingRelatedTerms(topic).catch(() => [])

            const usedSuggestions = suggestions.slice(0, 6)
            const usedRelated = relatedTerms.slice(0, 3)

            const cluster = this.normalizeAndDedupe([topic, ...usedSuggestions, ...usedRelated])

            this.bot.logger.debug(
                this.bot.isMobile,
                'QUERY-MANAGER',
                `cluster expanded | topic="${topic}" | suggestions=${suggestions.length}->${usedSuggestions.length} | related=${relatedTerms.length}->${usedRelated.length} | clusterSize=${cluster.length}`
            )

            clusters.push(cluster)
        }

        if (tail.length) {
            this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `cluster passthrough | topics=${tail.length}`)

            for (const topic of tail) {
                clusters.push([topic])
            }
        }

        return clusters
    }

    private normalizeAndDedupe(queries: string[]): string[] {
        const seen = new Set<string>()
        const out: string[] = []

        for (const q of queries) {
            if (!q) continue
            const trimmed = q.trim()
            if (!trimmed) continue

            const norm = trimmed.replace(/\s+/g, ' ').toLowerCase()
            if (seen.has(norm)) continue

            seen.add(norm)
            out.push(trimmed)
        }

        return out
    }

    async getGoogleTrends(geoLocale: string): Promise<string[]> {
        const queryTerms: GoogleSearch[] = []

        try {
            const request: AxiosRequestConfig = {
                url: 'https://trends.google.com/_/TrendsUi/data/batchexecute',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                },
                data: `f.req=[[[i0OFE,"[null, null, \\"${geoLocale.toUpperCase()}\\", 0, null, 48]"]]]`
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const trendsData = this.extractJsonFromResponse(response.data)
            if (!trendsData) {
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-GOOGLE-TRENDS', 'No trendsData parsed from response')
                return []
            }

            const mapped = trendsData.map(q => [q[0], q[9]!.slice(1)])

            if (mapped.length < 90 && geoLocale !== 'US') {
                return this.getGoogleTrends('US')
            }

            for (const [topic, related] of mapped) {
                queryTerms.push({
                    topic: topic as string,
                    related: related as string[]
                })
            }
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-GOOGLE-TRENDS',
                `request failed: ${
                    error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error)
                }`
            )
            return []
        }

        return queryTerms.flatMap(x => [x.topic, ...x.related])
    }

    private extractJsonFromResponse(text: string): GoogleTrendsResponse[1] | null {
        for (const line of text.split('\n')) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('[')) continue
            try {
                return JSON.parse(JSON.parse(trimmed)[0][2])[1]
            } catch {}
        }
        return null
    }

    async getBingSuggestions(query = '', langCode = 'en'): Promise<string[]> {
        try {
            const request: AxiosRequestConfig = {
                url: `https://www.bingapis.com/api/v7/suggestions?q=${encodeURIComponent(
                    query
                )}&appid=6D0A9B8C5100E9ECC7E11A104ADD76C10219804B&cc=xl&setlang=${langCode}`,
                method: 'POST',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {}),
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const suggestions =
                response.data.suggestionGroups?.[0]?.searchSuggestions?.map((x: { query: any }) => x.query) ?? []

            if (!suggestions.length) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SEARCH-BING-SUGGESTIONS',
                    `empty suggestions | query="${query}" | lang=${langCode}`
                )
            }

            return suggestions
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-BING-SUGGESTIONS',
                `request failed | query="${query}" | lang=${langCode} | error=${
                    error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error)
                }`
            )
            return []
        }
    }

    async getBingRelatedTerms(query: string): Promise<string[]> {
        try {
            const request: AxiosRequestConfig = {
                url: `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(query)}`,
                method: 'GET',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {})
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const related = response.data?.[1]
            const out = Array.isArray(related) ? related : []

            if (!out.length) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SEARCH-BING-RELATED',
                    `empty related terms | query="${query}"`
                )
            }

            return out
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-BING-RELATED',
                `request failed | query="${query}" | error=${
                    error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error)
                }`
            )
            return []
        }
    }

    async getBingTrendingTopics(langCode = 'en'): Promise<string[]> {
        try {
            const request: AxiosRequestConfig = {
                url: `https://www.bing.com/api/v7/news/trendingtopics?appid=91B36E34F9D1B900E54E85A77CF11FB3BE5279E6&cc=xl&setlang=${langCode}`,
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${this.bot.accessToken}`,
                    'User-Agent':
                        'Bing/32.5.431027001 (com.microsoft.bing; build:431027001; iOS 17.6.1) Alamofire/5.10.2',
                    'Content-Type': 'application/json',
                    'X-Rewards-Country': this.bot.userData.geoLocale,
                    'X-Rewards-Language': 'en',
                    'X-Rewards-ismobile': 'true'
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const topics =
                response.data.value?.map(
                    (x: { query: { text: string }; name: string }) => x.query?.text?.trim() || x.name.trim()
                ) ?? []

            if (!topics.length) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SEARCH-BING-TRENDING',
                    `empty trending topics | lang=${langCode}`
                )
            }

            return topics
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-BING-TRENDING',
                `request failed | lang=${langCode} | error=${
                    error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error)
                }`
            )
            return []
        }
    }

    async getWikipediaTrending(langCode = 'en'): Promise<string[]> {
        try {
            const date = new Date(Date.now() - 24 * 60 * 60 * 1000)
            const yyyy = date.getUTCFullYear()
            const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
            const dd = String(date.getUTCDate()).padStart(2, '0')

            const request: AxiosRequestConfig = {
                url: `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${langCode}.wikipedia/all-access/${yyyy}/${mm}/${dd}`,
                method: 'GET',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {})
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const articles = (response.data as WikipediaTopResponse).items?.[0]?.articles ?? []

            const out = articles.slice(0, 50).map(a => a.article.replace(/_/g, ' '))

            if (!out.length) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SEARCH-WIKIPEDIA-TRENDING',
                    `empty wikipedia top | lang=${langCode}`
                )
            }

            return out
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-WIKIPEDIA-TRENDING',
                `request failed | lang=${langCode} | error=${
                    error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error)
                }`
            )
            return []
        }
    }

    async getRedditTopics(subreddit = 'popular'): Promise<string[]> {
        try {
            const safe = subreddit.replace(/[^a-zA-Z0-9_+]/g, '')
            const request: AxiosRequestConfig = {
                url: `https://www.reddit.com/r/${safe}.json?limit=50`,
                method: 'GET',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {})
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const posts = (response.data as RedditListing).data?.children ?? []

            const out = posts.filter(p => !p.data.over_18).map(p => p.data.title)

            if (!out.length) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SEARCH-REDDIT-TRENDING',
                    `empty reddit listing | subreddit=${safe}`
                )
            }

            return out
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-REDDIT',
                `request failed | subreddit=${subreddit} | error=${
                    error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error)
                }`
            )
            return []
        }
    }

}
