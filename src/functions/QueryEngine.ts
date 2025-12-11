import type { AxiosRequestConfig } from 'axios'
import type {
    BingSuggestionResponse,
    BingTrendingTopicsResponse,
    GoogleSearch,
    GoogleTrendsResponse
} from '../interface/Search'
import type { MicrosoftRewardsBot } from '../index'

export class QueryCore {
    constructor(private bot: MicrosoftRewardsBot) {}

    async getGoogleTrends(geoLocale: string): Promise<string[]> {
        const queryTerms: GoogleSearch[] = []
        this.bot.logger.info(
            this.bot.isMobile,
            'SEARCH-GOOGLE-TRENDS',
            `Generating search queries, can take a while! | GeoLocale: ${geoLocale}`
        )

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
            const rawData = response.data

            const trendsData = this.extractJsonFromResponse(rawData)
            if (!trendsData) {
                throw this.bot.logger.error(
                    this.bot.isMobile,
                    'SEARCH-GOOGLE-TRENDS',
                    'Failed to parse Google Trends response'
                )
            }

            const mappedTrendsData = trendsData.map(query => [query[0], query[9]!.slice(1)])
            if (mappedTrendsData.length < 90) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'SEARCH-GOOGLE-TRENDS',
                    'Insufficient search queries, falling back to US'
                )
                return this.getGoogleTrends(geoLocale)
            }

            for (const [topic, relatedQueries] of mappedTrendsData) {
                queryTerms.push({
                    topic: topic as string,
                    related: relatedQueries as string[]
                })
            }
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'SEARCH-GOOGLE-TRENDS',
                `An error occurred: ${error instanceof Error ? error.message : String(error)}`
            )
        }

        const queries = queryTerms.flatMap(x => [x.topic, ...x.related])

        return queries
    }

    private extractJsonFromResponse(text: string): GoogleTrendsResponse[1] | null {
        const lines = text.split('\n')
        for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                try {
                    return JSON.parse(JSON.parse(trimmed)[0][2])[1]
                } catch {
                    continue
                }
            }
        }

        return null
    }

    async getBingSuggestions(query: string = '', langCode: string = 'en'): Promise<string[]> {
        this.bot.logger.info(
            this.bot.isMobile,
            'SEARCH-BING-SUGGESTIONS',
            `Generating bing suggestions! | LangCode: ${langCode}`
        )

        try {
            const request: AxiosRequestConfig = {
                url: `https://www.bingapis.com/api/v7/suggestions?q=${encodeURIComponent(query)}&appid=6D0A9B8C5100E9ECC7E11A104ADD76C10219804B&cc=xl&setlang=${langCode}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const rawData: BingSuggestionResponse = response.data

            const searchSuggestions = rawData.suggestionGroups[0]?.searchSuggestions

            if (!searchSuggestions?.length) {
                this.bot.logger.warn(this.bot.isMobile, 'SEARCH-BING-SUGGESTIONS', 'API returned no results')
                return []
            }

            return searchSuggestions.map(x => x.query)
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'SEARCH-GOOGLE-TRENDS',
                `An error occurred: ${error instanceof Error ? error.message : String(error)}`
            )
        }

        return []
    }

    async getBingRelatedTerms(term: string): Promise<string[]> {
        try {
            const request = {
                url: `https://api.bing.com/osjson.aspx?query=${term}`,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const rawData = response.data

            const relatedTerms = rawData[1]

            if (!relatedTerms?.length) {
                this.bot.logger.warn(this.bot.isMobile, 'SEARCH-BING-RELATED', 'API returned no results')
                return []
            }

            return relatedTerms
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'SEARCH-BING-RELATED',
                `An error occurred: ${error instanceof Error ? error.message : String(error)}`
            )
        }

        return []
    }

    async getBingTendingTopics(langCode: string = 'en'): Promise<string[]> {
        try {
            const request = {
                url: `https://www.bing.com/api/v7/news/trendingtopics?appid=91B36E34F9D1B900E54E85A77CF11FB3BE5279E6&cc=xl&setlang=${langCode}`,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const rawData: BingTrendingTopicsResponse = response.data

            const trendingTopics = rawData.value

            if (!trendingTopics?.length) {
                this.bot.logger.warn(this.bot.isMobile, 'SEARCH-BING-TRENDING', 'API returned no results')
                return []
            }

            const queries = trendingTopics.map(x => x.query?.text?.trim() || x.name.trim())

            return queries
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'SEARCH-BING-TRENDING',
                `An error occurred: ${error instanceof Error ? error.message : String(error)}`
            )
        }

        return []
    }
}
