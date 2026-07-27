import type { HttpRequestConfig } from '../util/Http'
import * as fs from 'fs'
import path from 'path'
import { XMLParser } from 'fast-xml-parser'

import { URLs } from '../constants/urls'
import { RSS_FEEDS } from '../constants/rssFeeds'
import type {
    GoogleSearch,
    GoogleTrendsResponse,
    HackerNewsResponse,
    RedditListing,
    WikipediaRandomResponse,
    WikipediaTopResponse
} from '../interface/Search'
import type { QueryEngine, QueryEngineEntry } from '../interface/Config'
import type { MicrosoftRewardsBot } from '../index'

const GOOGLE_TRENDS_RPC_ID = 'i0OFE'
const MAX_CLUSTER_SUGGESTIONS = 8

interface QueryManagerOptions {
    shuffle?: boolean
    sourceOrder?: QueryEngineEntry[]
    langCode?: string
    geoLocale?: string
}

interface RssEntry {
    title?: unknown
}
interface RssDocument {
    rss?: { channel?: { item?: RssEntry | RssEntry[] } }
    'rdf:RDF'?: { item?: RssEntry | RssEntry[] }
    feed?: { entry?: RssEntry | RssEntry[] }
}

function toArray(value: RssEntry | RssEntry[] | undefined): RssEntry[] {
    if (!value) return []
    return Array.isArray(value) ? value : [value]
}

function readTitle(title: unknown): string {
    if (typeof title === 'string') return title
    if (typeof title === 'number') return String(title)
    if (title && typeof title === 'object' && '#text' in title) {
        const text = (title as { '#text'?: unknown })['#text']
        return typeof text === 'string' ? text : typeof text === 'number' ? String(text) : ''
    }
    return ''
}

function stripHtml(text: string): string {
    return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
}

export function normalizeQueryKey(query: string): string {
    return query.trim().replace(/\s+/g, ' ').toLowerCase()
}

export class QueryCore {
    constructor(private bot: MicrosoftRewardsBot) {}

    async queryManager(options: QueryManagerOptions = {}): Promise<string[]> {
        const {
            shuffle = false,
            sourceOrder = ['google', 'wikipedia', 'wikirandom', 'hackernews', 'reddit', 'local'],
            langCode = 'en',
            geoLocale = 'US'
        } = options

        try {
            this.bot.logger.debug(
                this.bot.isMobile,
                'QUERY-MANAGER',
                `Building main topic pool | sources=${sourceOrder.join(',')} | shuffle=${shuffle} | lang=${langCode} | geo=${geoLocale}`
            )

            const sourceHandlers: Record<QueryEngine, () => Promise<string[]> | string[]> = {
                google: () => this.getGoogleTrends(geoLocale.toUpperCase()).catch(() => []),
                wikipedia: () => this.getWikipediaTrending(langCode).catch(() => []),
                wikirandom: () => this.getWikipediaRandom(langCode).catch(() => []),
                hackernews: () => this.getHackerNewsTopics().catch(() => []),
                reddit: () => this.getRedditTopics().catch(() => []),
                local: () => this.getLocalQueryList()
            }

            const isRss = (source: string) => source === 'rss' || source.startsWith('rss.')
            const coreSources = sourceOrder.filter(source => !isRss(source)) as QueryEngine[]
            const rssSelectors = sourceOrder.filter(isRss)

            const topicLists: string[][] = []
            for (const source of coreSources) {
                const handler = sourceHandlers[source]
                if (!handler) continue

                const topics = await Promise.resolve(handler())
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'QUERY-MANAGER',
                    `Source "${source}" returned ${topics.length}`
                )
                if (topics.length) topicLists.push(topics)
            }

            if (rssSelectors.length) {
                const rssTopics = await this.getRssTopics(rssSelectors).catch(() => [])
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'QUERY-MANAGER',
                    `Source "rss" returned ${rssTopics.length} (${rssSelectors.length} selector(s))`
                )
                if (rssTopics.length) topicLists.push(rssTopics)
            }

            const rawTopics = topicLists.flat()
            const topics = this.normalizeAndDedupe(rawTopics)
            if (!topics.length) {
                this.bot.logger.warn(this.bot.isMobile, 'QUERY-MANAGER', 'No topics returned by any source')
                return []
            }

            if (shuffle) {
                this.bot.utils.shuffleArray(topics)
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'QUERY-MANAGER',
                    `Shuffled main topic pool | first="${topics[0] ?? ''}"`
                )
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'QUERY-MANAGER',
                `Built main topic pool | raw=${rawTopics.length} | unique=${topics.length} | duplicatesRemoved=${rawTopics.length - topics.length}`
            )
            return topics
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'QUERY-MANAGER',
                `Failed building main topic pool | ${error instanceof Error ? error.message : String(error)}`
            )
            return []
        }
    }

    async getConfiguredSearchTopics(): Promise<string[]> {
        return await this.queryManager({
            shuffle: true,
            langCode: (this.bot.userData.langCode ?? 'en').toLowerCase(),
            geoLocale: (this.bot.userData.geoLocale ?? 'US').toUpperCase(),
            sourceOrder: this.bot.config.searchSettings.queryEngines
        })
    }

    async getSearchCluster(mainTopic: string): Promise<string[]> {
        const normalizedMain = this.normalizeAndDedupe([mainTopic])[0]
        if (!normalizedMain) return []
        if (!this.bot.config.searchSettings.clusterSearch) {
            this.bot.logger.debug(this.bot.isMobile, 'QUERY-CLUSTER', `Clustering disabled | main="${normalizedMain}"`)
            return [normalizedMain]
        }

        const langCode = (this.bot.userData.langCode ?? 'en').toLowerCase()
        this.bot.logger.debug(
            this.bot.isMobile,
            'QUERY-CLUSTER',
            `Fetching related queries | main="${normalizedMain}" | lang=${langCode} | limit=${MAX_CLUSTER_SUGGESTIONS}`
        )

        const [suggestionsResult, relatedResult] = await Promise.allSettled([
            this.getBingSuggestions(normalizedMain, langCode),
            this.getBingRelatedTerms(normalizedMain)
        ])
        const rawSuggestions = suggestionsResult.status === 'fulfilled' ? suggestionsResult.value : []
        const rawRelated = relatedResult.status === 'fulfilled' ? relatedResult.value : []

        if (suggestionsResult.status === 'rejected') {
            this.bot.logger.debug(
                this.bot.isMobile,
                'QUERY-CLUSTER',
                `Related source unavailable | source=v7 | main="${normalizedMain}" | ${String(suggestionsResult.reason)}`
            )
        }
        if (relatedResult.status === 'rejected') {
            this.bot.logger.debug(
                this.bot.isMobile,
                'QUERY-CLUSTER',
                `Related source unavailable | source=osjson | main="${normalizedMain}" | ${String(relatedResult.reason)}`
            )
        }

        const suggestions = this.normalizeAndDedupe(rawSuggestions)
        const related = this.normalizeAndDedupe(rawRelated)

        this.bot.logger.debug(
            this.bot.isMobile,
            'QUERY-CLUSTER',
            `Related source ready | source=v7 | main="${normalizedMain}" | raw=${rawSuggestions.length} | unique=${suggestions.length} | queries=${JSON.stringify(suggestions)}`
        )

        this.bot.logger.debug(
            this.bot.isMobile,
            'QUERY-CLUSTER',
            `Related source ready | source=osjson | main="${normalizedMain}" | raw=${rawRelated.length} | unique=${related.length} | queries=${JSON.stringify(related)}`
        )

        const interleaved: string[] = []
        const sourceLength = Math.max(suggestions.length, related.length)
        for (let index = 0; index < sourceLength; index++) {
            const suggestion = suggestions[index]
            const relatedTerm = related[index]
            if (suggestion) interleaved.push(suggestion)
            if (relatedTerm) interleaved.push(relatedTerm)
        }

        const mainKey = normalizeQueryKey(normalizedMain)
        const merged = this.normalizeAndDedupe(interleaved).filter(query => normalizeQueryKey(query) !== mainKey)
        const selected = merged.slice(0, MAX_CLUSTER_SUGGESTIONS)

        this.bot.logger.debug(
            this.bot.isMobile,
            'QUERY-CLUSTER',
            `Related queries merged | main="${normalizedMain}" | availableSources=${Number(suggestions.length > 0) + Number(related.length > 0)} | unique=${merged.length} | selected=${selected.length} | queries=${JSON.stringify(selected)}`
        )

        const cluster = [normalizedMain, ...selected]
        this.bot.utils.shuffleArray(cluster)

        this.bot.logger.debug(
            this.bot.isMobile,
            'QUERY-CLUSTER',
            `Cluster ready | main="${normalizedMain}" | related=${Math.max(0, cluster.length - 1)} | total=${cluster.length} | order=${JSON.stringify(cluster)}`
        )
        return cluster
    }

    private normalizeAndDedupe(queries: string[]): string[] {
        const seen = new Set<string>()
        const out: string[] = []

        for (const query of queries) {
            const trimmed = query?.trim()
            if (!trimmed) continue

            const key = normalizeQueryKey(trimmed)
            if (seen.has(key)) continue

            seen.add(key)
            out.push(trimmed.replace(/\s+/g, ' '))
        }

        return out
    }

    async getGoogleTrends(geoLocale: string): Promise<string[]> {
        const queryTerms: GoogleSearch[] = []

        try {
            const request: HttpRequestConfig = {
                url: URLs.queryEngine.googleTrends,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                },
                data: `f.req=[[[${GOOGLE_TRENDS_RPC_ID},"[null, null, \\"${geoLocale.toUpperCase()}\\", 0, null, 48]"]]]`
            }

            const response = await this.bot.http.request<string>(request, this.bot.config.proxy.queryEngine)
            const trendsData = this.extractJsonFromResponse(response.data)
            if (!trendsData) {
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-GOOGLE-TRENDS', 'No trends data parsed from response')
                return []
            }

            const mapped = trendsData.map(q => [q[0], q[9]!.slice(1)])

            if (mapped.length < 90 && geoLocale !== 'US') {
                return this.getGoogleTrends('US')
            }

            for (const [topic, related] of mapped) {
                queryTerms.push({ topic: topic as string, related: related as string[] })
            }
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-GOOGLE-TRENDS',
                `Request failed | ${error instanceof Error ? error.message : String(error)}`
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
            const request: HttpRequestConfig = {
                url: URLs.queryEngine.bingSuggestions(query, langCode),
                method: 'GET',
                headers: { ...(this.bot.fingerprint?.headers ?? {}) }
            }

            const response = await this.bot.http.request<{
                suggestionGroups?: { searchSuggestions?: { query: string }[] }[]
            }>(request, this.bot.config.proxy.queryEngine)
            return response.data.suggestionGroups?.[0]?.searchSuggestions?.map((x: { query: string }) => x.query) ?? []
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-BING-SUGGESTIONS',
                `Request failed | query="${query}" | ${error instanceof Error ? error.message : String(error)}`
            )
            return []
        }
    }

    async getBingRelatedTerms(query: string): Promise<string[]> {
        try {
            const request: HttpRequestConfig = {
                url: URLs.queryEngine.bingRelated(query),
                method: 'GET',
                headers: { ...(this.bot.fingerprint?.headers ?? {}) }
            }

            const response = await this.bot.http.request<unknown[]>(request, this.bot.config.proxy.queryEngine)
            const related = response.data?.[1]
            return Array.isArray(related)
                ? related.filter((term): term is string => typeof term === 'string' && term.trim().length > 0)
                : []
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-BING-RELATED',
                `Request failed | query="${query}" | ${error instanceof Error ? error.message : String(error)}`
            )
            return []
        }
    }

    async getWikipediaTrending(langCode = 'en'): Promise<string[]> {
        try {
            const date = new Date(Date.now() - 24 * 60 * 60 * 1000)
            const year = date.getUTCFullYear()
            const month = String(date.getUTCMonth() + 1).padStart(2, '0')
            const day = String(date.getUTCDate()).padStart(2, '0')

            const request: HttpRequestConfig = {
                url: URLs.queryEngine.wikipediaTop(langCode, year, month, day),
                method: 'GET',
                headers: { ...(this.bot.fingerprint?.headers ?? {}) }
            }

            const response = await this.bot.http.request(request, this.bot.config.proxy.queryEngine)
            const articles = (response.data as WikipediaTopResponse).items?.[0]?.articles ?? []

            return articles.slice(0, 50).map(a => a.article.replace(/_/g, ' '))
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-WIKIPEDIA-TRENDING',
                `Request failed | lang=${langCode} | ${error instanceof Error ? error.message : String(error)}`
            )
            return []
        }
    }

    async getRedditTopics(subreddit = 'popular'): Promise<string[]> {
        const safe = subreddit.replace(/[^a-zA-Z0-9_+]/g, '')
        try {
            const request: HttpRequestConfig = {
                url: URLs.queryEngine.reddit(safe),
                method: 'GET',
                headers: { ...(this.bot.fingerprint?.headers ?? {}) }
            }

            const response = await this.bot.http.request(request, this.bot.config.proxy.queryEngine)
            const posts = (response.data as RedditListing).data?.children ?? []

            return posts.filter(p => !p.data.over_18).map(p => p.data.title)
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-REDDIT',
                `Request failed | subreddit=${safe} | ${error instanceof Error ? error.message : String(error)}`
            )
            return []
        }
    }

    async getHackerNewsTopics(): Promise<string[]> {
        try {
            const request: HttpRequestConfig = {
                url: URLs.queryEngine.hackerNews,
                method: 'GET',
                headers: { ...(this.bot.fingerprint?.headers ?? {}) }
            }

            const response = await this.bot.http.request<HackerNewsResponse>(request, this.bot.config.proxy.queryEngine)
            const hits = response.data?.hits ?? []

            return hits.map(h => (h.title ?? '').replace(/^(?:Show|Ask)\s+HN:\s*/i, '').trim()).filter(Boolean)
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-HACKERNEWS',
                `Request failed | ${error instanceof Error ? error.message : String(error)}`
            )
            return []
        }
    }

    async getWikipediaRandom(langCode = 'en'): Promise<string[]> {
        const lang = (langCode || 'en').split('-')[0] || 'en'
        try {
            const request: HttpRequestConfig = {
                url: URLs.queryEngine.wikipediaRandom(lang),
                method: 'GET',
                headers: { ...(this.bot.fingerprint?.headers ?? {}) }
            }

            const response = await this.bot.http.request<WikipediaRandomResponse>(
                request,
                this.bot.config.proxy.queryEngine
            )
            const pages = response.data?.query?.random ?? []

            return pages.map(p => p.title.trim()).filter(Boolean)
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-WIKIPEDIA-RANDOM',
                `Request failed | lang=${lang} | ${error instanceof Error ? error.message : String(error)}`
            )
            return []
        }
    }

    async getRssTopics(selectors: string[]): Promise<string[]> {
        const urls = this.resolveRssUrls(selectors)
        if (!urls.length) return []

        const lists = await Promise.all(urls.map(url => this.fetchRssTitles(url).catch(() => [])))
        return lists.flat()
    }

    private resolveRssUrls(selectors: string[]): string[] {
        const urls = new Set<string>()

        for (const selector of selectors) {
            const [, site, endpoint] = selector.split('.')

            if (!site) {
                for (const feeds of Object.values(RSS_FEEDS)) {
                    for (const url of Object.values(feeds)) urls.add(url)
                }
                continue
            }

            const feeds = RSS_FEEDS[site]
            if (!feeds) {
                this.bot.logger.warn(this.bot.isMobile, 'SEARCH-RSS', `Unknown RSS site "${site}" in "${selector}"`)
                continue
            }

            if (!endpoint) {
                for (const url of Object.values(feeds)) urls.add(url)
                continue
            }

            const url = feeds[endpoint]
            if (url) urls.add(url)
            else this.bot.logger.warn(this.bot.isMobile, 'SEARCH-RSS', `Unknown RSS feed "${site}.${endpoint}"`)
        }

        return [...urls]
    }

    async fetchRssTitles(url: string): Promise<string[]> {
        try {
            const request: HttpRequestConfig = {
                url,
                method: 'GET',
                headers: { ...(this.bot.fingerprint?.headers ?? {}) }
            }

            const response = await this.bot.http.request<string>(request, this.bot.config.proxy.queryEngine)
            const xml = typeof response.data === 'string' ? response.data : String(response.data ?? '')
            return this.parseRssTitles(xml)
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-RSS',
                `Feed failed | ${url} | ${error instanceof Error ? error.message : String(error)}`
            )
            return []
        }
    }

    private parseRssTitles(xml: string): string[] {
        if (!xml) return []

        let doc: RssDocument
        try {
            doc = new XMLParser({ ignoreAttributes: true, htmlEntities: true, parseTagValue: false }).parse(xml)
        } catch {
            return []
        }

        const entries = [
            ...toArray(doc?.rss?.channel?.item),
            ...toArray(doc?.['rdf:RDF']?.item),
            ...toArray(doc?.feed?.entry)
        ]

        return entries.map(entry => stripHtml(readTitle(entry?.title)).trim()).filter(Boolean)
    }

    getLocalQueryList(): string[] {
        try {
            const file = path.join(__dirname, './search-queries.json')
            const queries = JSON.parse(fs.readFileSync(file, 'utf8')) as string[]
            return Array.isArray(queries) ? queries : []
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-LOCAL-QUERY-LIST',
                `Failed reading search-queries.json | ${error instanceof Error ? error.message : String(error)}`
            )
            return []
        }
    }
}
