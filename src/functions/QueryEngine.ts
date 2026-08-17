import type { HttpRequestConfig, HttpResponse } from '../util/Http'
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
const MAX_RSS_XML_BYTES = 2 * 1024 * 1024
const XML_DECLARATION_RE = /<!\s*(?:DOCTYPE|ENTITY)\b/i

/**
 * 中国热搜源触发了 gmya.net 免费档的频率限制。
 * 携带 rateLimited 标记，供 getChinaTrends 做退避决策。
 */
class ChinaApiRateLimitError extends Error {
    rateLimited = true
    constructor(source: string, detail: string) {
        super(`${source} 触发限流：${detail}（建议配置 searchSettings.chinaApi.appkey）`)
        this.name = 'ChinaApiRateLimitError'
    }
}

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

    // 兜底模式：主源（sourceOrder[0]）原始词累计达 FALLBACK_THRESHOLD 即停，
    // 不再请求后续源；不足则向后逐源补充，兜底源只取 FALLBACK_LOCAL_SAMPLE 个（随机抽样）。
    private static readonly FALLBACK_THRESHOLD = 20
    private static readonly FALLBACK_LOCAL_SAMPLE = 50

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
                china: () => this.getChinaTrends(geoLocale.toUpperCase()).catch(() => []),
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

            const primarySource = coreSources[0]
            const threshold = QueryCore.FALLBACK_THRESHOLD
            const collectedCount = () => topicLists.flat().length

            const topicLists: string[][] = []
            for (const source of coreSources) {
                // 已累计达标就停，不再请求后续源（主源或前序兜底源已够用）
                if (collectedCount() >= threshold) {
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'QUERY-MANAGER',
                        `兜底命中阈值，停止取后续源 | 已累计=${collectedCount()} | 阈值=${threshold} | 停在源=${source}`
                    )
                    break
                }

                const handler = sourceHandlers[source]
                if (!handler) continue

                const topics = await Promise.resolve(handler())
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'QUERY-MANAGER',
                    `Source "${source}" returned ${topics.length}`
                )
                if (!topics.length) continue

                // 主源全量纳入；后续源只随机抽样 FALLBACK_LOCAL_SAMPLE 个补充
                if (source !== primarySource) {
                    const sampled = this.bot.utils.shuffleArray([...topics]).slice(0, QueryCore.FALLBACK_LOCAL_SAMPLE)
                    topicLists.push(sampled)
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'QUERY-MANAGER',
                        `兜底补充 | 源=${source} | 原始=${topics.length} | 抽样=${sampled.length} | 累计=${collectedCount()}`
                    )
                } else {
                    topicLists.push(topics)
                }
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
        if (Buffer.byteLength(xml, 'utf8') > MAX_RSS_XML_BYTES || XML_DECLARATION_RE.test(xml)) return []

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

    /**
     * 获取中国地区的热门搜索词（百度、抖音、微博、头条、知乎等）。
     * 数据源：gmya.net 热门词 API。
     * 策略：
     *   - appkey 配置在 searchSettings.chinaApi.appkey；留空走免费档。
     *   - 随机选取若干源聚合结果，分散 API 负载、增加搜索词多样性。
     *   - 免费档（无 appkey）有激进的频率限制：源与源之间插入随机退避，
     *     命中限流（403）后对后续源做指数退避；有 appkey 则不退避。
     *   - 某个源失败时自动 fallback 到剩余源，确保至少拿到 1 个源的数据。
     *
     * @param geoLocale - 地理区域代码，默认为'CN'
     * @returns 热搜标题字符串数组
     */
    async getChinaTrends(geoLocale: string = 'CN'): Promise<string[]> {
        const allSources = ['BaiduHot', 'TouTiaoHot', 'DouYinHot', 'WeiBoHot', 'ZhiHuHot']
        const baseUrl = 'https://api.gmya.net/Api/'
        // appkey 来自配置；留空走免费档（有频率限制），填入则解除限流
        const appkey = this.bot.config.searchSettings.chinaApi?.appkey?.trim() ?? ''
        const hasAppkey = appkey.length > 0
        // 免费档容易被限流：减少首选源数量以降低触发面；有 appkey 则保持 2 个兼顾多样性
        const pickedCount = hasAppkey ? 2 : 1
        // 免费档源间退避参数（毫秒）；有 appkey 不需要退避
        const backoffMin = 1200
        const backoffMax = 2500

        // 随机打乱源顺序，取前 pickedCount 个作为首选；其余作为 fallback 备用
        const shuffled = this.bot.utils.shuffleArray([...allSources])
        const picked = shuffled.slice(0, pickedCount)
        const fallback = shuffled.slice(pickedCount)

        this.bot.logger.info(
            this.bot.isMobile,
            'SEARCH-CHINA-TRENDS',
            `正在获取中国热搜 | 地区=${geoLocale} | appkey=${hasAppkey ? '已配置' : '免费档'} | 首选源=${picked.join(', ')} | 备用源=${fallback.length}个`
        )

        /**
         * 免费档在源与源之间插入随机退避，降低连续请求触发 403 限流的概率。
         * 命中限流后对后续源做指数退避（multiplier 递增）。
         * @param multiplier 基础退避倍数，限流后递增
         */
        const maybeBackoff = async (multiplier: number): Promise<void> => {
            if (hasAppkey) return
            await this.bot.utils.wait(this.bot.utils.randomDelay(backoffMin * multiplier, backoffMax * multiplier))
        }

        const titles = new Set<string>()
        const failedSources: string[] = []
        let backoffMultiplier = 1 // 限流命中后递增

        // 先依次尝试首选源
        for (let i = 0; i < picked.length; i++) {
            if (i > 0) await maybeBackoff(backoffMultiplier)
            const source = picked[i]!
            try {
                const result = await this.fetchChinaHotWords(this.buildChinaApiUrl(baseUrl, source, appkey), source)
                if (result.length) {
                    result.forEach(t => titles.add(t))
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'SEARCH-CHINA-TRENDS',
                        `获取 ${source} 成功 | 数量=${result.length} | 累计=${titles.size}`
                    )
                } else {
                    this.bot.logger.warn(this.bot.isMobile, 'SEARCH-CHINA-TRENDS', `${source} 返回空列表`)
                    failedSources.push(source)
                }
            } catch (error) {
                failedSources.push(source)
                if (error instanceof ChinaApiRateLimitError) backoffMultiplier *= 1.5
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'SEARCH-CHINA-TRENDS',
                    `${source} 请求失败 | 错误=${error instanceof Error ? error.message : String(error)}`
                )
            }
        }

        // 如果首选源全部失败，逐个 fallback 直到拿到数据
        if (titles.size === 0 && fallback.length) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'SEARCH-CHINA-TRENDS',
                `首选源全部失败（${failedSources.join(', ')}），尝试备用源 ${fallback.join(', ')}`
            )
            for (let i = 0; i < fallback.length; i++) {
                await maybeBackoff(backoffMultiplier)
                const source = fallback[i]!
                try {
                    const result = await this.fetchChinaHotWords(
                        this.buildChinaApiUrl(baseUrl, source, appkey),
                        source
                    )
                    if (result.length) {
                        result.forEach(t => titles.add(t))
                        this.bot.logger.info(
                            this.bot.isMobile,
                            'SEARCH-CHINA-TRENDS',
                            `备用源 ${source} 成功 | 数量=${result.length} | 累计=${titles.size}`
                        )
                        break // 拿到数据就停
                    }
                } catch (error) {
                    if (error instanceof ChinaApiRateLimitError) backoffMultiplier *= 1.5
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'SEARCH-CHINA-TRENDS',
                        `备用源 ${source} 也失败 | 错误=${error instanceof Error ? error.message : String(error)}`
                    )
                }
            }
        }

        if (titles.size === 0) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'SEARCH-CHINA-TRENDS',
                `所有 ${allSources.length} 个热搜源均失败，将仅依赖其他查询源`
            )
        } else {
            this.bot.logger.info(
                this.bot.isMobile,
                'SEARCH-CHINA-TRENDS',
                `中国热搜获取完成 | 最终词数=${titles.size} | 成功源=${picked.filter(s => !failedSources.includes(s)).join(',') || fallback.filter(() => titles.size > 0).join(',')}`,
                'green'
            )
        }

        return Array.from(titles)
    }

    /**
     * 构造 gmya.net 热搜 API 的请求 URL。
     */
    private buildChinaApiUrl(baseUrl: string, source: string, appkey: string): string {
        return appkey ? `${baseUrl}${source}?format=json&appkey=${appkey}` : `${baseUrl}${source}`
    }

    /**
     * 请求单个中国热搜源并解析标题。
     * 走 bot.http（统一代理、错误诊断、fingerprint headers），带 10s 超时。
     *
     * 诊断策略：正常就 return；任何异常都把"原始返回值"打到日志里，让看日志的人直接判断
     * 是限流、HTML 拦截页、维护 JSON 还是接口结构变更——比预先贴标签更有用。
     * 唯一例外是限流：上层退避需要它做控制流，所以用 ChinaApiRateLimitError 单独标记，
     * 但错误信息同样带上原始响应。
     *
     * 注：HttpClient（Impit）原生解压 gzip/br/zstd，fingerprint 注入的 accept-encoding
     * 无需像 axios 版本那样手动覆盖。
     */
    private async fetchChinaHotWords(url: string, source: string): Promise<string[]> {
        const request: HttpRequestConfig = {
            url,
            method: 'GET',
            headers: { ...(this.bot.fingerprint?.headers ?? {}) },
            timeout: 10000
        }

        // 请求失败（HTTP 非 2xx / 超时 / 网络错误）：直接吐原始返回，不再预先贴标签
        let response: HttpResponse<unknown>
        try {
            response = await this.bot.http.request(request, this.bot.config.proxy.queryEngine)
        } catch (error) {
            const { rateLimited, text } = this.describeFetchError(error)
            if (rateLimited) throw new ChinaApiRateLimitError(source, text)
            throw new Error(`${source} 失败 | 原始响应=${text}`)
        }

        const data = response.data

        // 限流：上层退避需要这个标记；信息里仍带原始响应
        if (this.isChinaRateLimited(response)) {
            throw new ChinaApiRateLimitError(source, `原始响应=${this.summarizeBody(data)}`)
        }

        // 正常结构：{ data: [{ title: string }, ...] }
        if (data && Array.isArray((data as { data?: unknown }).data)) {
            return ((data as { data: unknown[] }).data as { title?: unknown }[])
                .filter(item => item && typeof item.title === 'string')
                .map(item => item.title as string)
                .filter((title: string) => title.trim().length > 0)
        }

        // 结构非预期：直接吐原始返回，由人判断（HTML 拦截页 / 维护 JSON / 结构变更）
        throw new Error(`${source} 失败 | 原始响应=${this.summarizeBody(data)}`)
    }

    /**
     * 判断响应是否为 gmya.net 免费档限流。
     * 免费档限流响应：{ code: "403", msg: "您请求过于频繁，未使用账号appkey请求将限制请求频率" }
     * 没有 data 数组，需和真正的格式异常区分，否则会误导排查方向。
     */
    private isChinaRateLimited(response: HttpResponse<unknown>): boolean {
        const status = response.status
        const data = response.data as { code?: unknown; msg?: unknown } | null | undefined
        const code = data?.code
        const msg = typeof data?.msg === 'string' ? data.msg : ''
        return (
            status === 403 ||
            status === 429 ||
            code === '403' ||
            code === 403 ||
            code === '429' ||
            msg.includes('请求过于频繁') ||
            msg.includes('appkey')
        )
    }

    /**
     * 把响应体序列化为可读字符串，诊断失败时用。
     * - 对象走 JSON.stringify
     * - 字符串原样返回（可能是 HTML 拦截/维护页）
     * - undefined/空记为 <无响应体>
     * - 非 UTF-8 响应体（gzip 压缩流 / GBK HTML 错误页 / CDN 二进制拦截页）：
     *   默认按 UTF-8 解码，非法字节被替换成 U+FFFD(�)，原始字节已丢失。
     *   原样写日志会产生乱码，且二进制流里的 0x0A(换行字节) 会把一条日志拆成
     *   多行、污染日志结构。这里检测到高密度替换符时改写为可读的诊断摘要。
     * 兜底截断到 1000 字符，防止上游误返回超大 HTML 污染日志。
     */
    private summarizeBody(body: unknown): string {
        if (body === undefined || body === null || body === '') return '<无响应体>'
        const text = typeof body === 'string' ? body : JSON.stringify(body)
        // 检测损坏的非 UTF-8 内容：替换符 U+FFFD 占比 >= 5% 即判定为二进制/非文本响应体
        const replacementCount = (text.match(/\uFFFD/g) ?? []).length
        if (replacementCount > 0 && replacementCount / Math.max(text.length, 1) >= 0.05) {
            // hex 指纹便于人工判断内容类型（gzip=1F8B、HTML=3C68746D6C、GBK错误页 等）
            const hex = Buffer.from(text, 'utf8').subarray(0, 32).toString('hex')
            return `<非UTF-8响应体 | 长度=${text.length} | 替换符=${replacementCount} | 疑似gzip/二进制/GBK错误页 | hex前32=${hex}>`
        }
        return text.length > 1000 ? `${text.slice(0, 1000)}...(+${text.length - 1000}字符)` : text
    }

    /**
     * 描述 HttpClient 抛出的错误，返回可读文本 + 是否为限流。
     * - 带 status/response（HTTP 非 2xx，重试耗尽后抛出）：吐原始响应体，
     *   限流标记由 HTTP 状态码 403/429 判定
     * - 无 status/response（超时/断网/DNS）：吐错误 message
     */
    private describeFetchError(error: unknown): { rateLimited: boolean; text: string } {
        const status = (error as { status?: number } | null)?.status
        const response = (error as { response?: { data?: unknown } } | null)?.response
        if (status !== undefined || response) {
            return {
                rateLimited: status === 403 || status === 429,
                text: this.summarizeBody(response?.data ?? '<无响应体>')
            }
        }
        return {
            rateLimited: false,
            text: `<无响应体> | ${error instanceof Error ? error.message : String(error)}`
        }
    }
}
