import axios from 'axios'

export interface QuerySource {
  name: string
  weight: number // 0-1, probability of selection
  fetchQueries: () => Promise<string[]>
}

export interface QueryDiversityConfig {
  sources: Array<'google-trends' | 'reddit' | 'news' | 'wikipedia' | 'local-fallback'>
  deduplicate: boolean
  mixStrategies: boolean // Mix different source types in same session
  maxQueriesPerSource: number
  cacheMinutes: number
}

/**
 * QueryDiversityEngine fetches search queries from multiple sources to avoid patterns.
 * Supports Google Trends, Reddit, News APIs, Wikipedia, and local fallbacks.
 */
export class QueryDiversityEngine {
  private config: QueryDiversityConfig
  private cache: Map<string, { queries: string[]; expires: number }> = new Map()

  constructor(config?: Partial<QueryDiversityConfig>) {
    this.config = {
      sources: config?.sources || ['google-trends', 'reddit', 'local-fallback'],
      deduplicate: config?.deduplicate !== false,
      mixStrategies: config?.mixStrategies !== false,
      maxQueriesPerSource: config?.maxQueriesPerSource || 10,
      cacheMinutes: config?.cacheMinutes || 30
    }
  }

  /**
   * Fetch diverse queries from configured sources
   */
  async fetchQueries(count: number): Promise<string[]> {
    const allQueries: string[] = []

    for (const sourceName of this.config.sources) {
      try {
        const queries = await this.getFromSource(sourceName)
        allQueries.push(...queries.slice(0, this.config.maxQueriesPerSource))
      } catch (error) {
        // Silently fail and try other sources
      }
    }

    // Deduplicate
    let final = this.config.deduplicate ? Array.from(new Set(allQueries)) : allQueries

    // Mix strategies: interleave queries from different sources
    if (this.config.mixStrategies && this.config.sources.length > 1) {
      final = this.interleaveQueries(final, count)
    }

    // Shuffle and limit to requested count
    final = this.shuffleArray(final).slice(0, count)

    return final.length > 0 ? final : this.getLocalFallback(count)
  }

  /**
   * Fetch from a specific source with caching
   */
  private async getFromSource(source: string): Promise<string[]> {
    const cached = this.cache.get(source)
    if (cached && Date.now() < cached.expires) {
      return cached.queries
    }

    let queries: string[] = []

    switch (source) {
      case 'google-trends':
        queries = await this.fetchGoogleTrends()
        break
      case 'reddit':
        queries = await this.fetchReddit()
        break
      case 'news':
        queries = await this.fetchNews()
        break
      case 'wikipedia':
        queries = await this.fetchWikipedia()
        break
      case 'local-fallback':
        queries = this.getLocalFallback(20)
        break
      default:
        // Unknown source, skip silently
        break
    }

    this.cache.set(source, {
      queries,
      expires: Date.now() + (this.config.cacheMinutes * 60000)
    })

    return queries
  }

  /**
   * Fetch from Google Trends (existing logic can be reused)
   */
  private async fetchGoogleTrends(): Promise<string[]> {
    try {
      const response = await axios.get('https://trends.google.com/trends/api/dailytrends?geo=US', {
        timeout: 10000
      })

      const data = response.data.toString().replace(')]}\',', '')
      const parsed = JSON.parse(data)

      const queries: string[] = []
      for (const item of parsed.default.trendingSearchesDays || []) {
        for (const search of item.trendingSearches || []) {
          if (search.title?.query) {
            queries.push(search.title.query)
          }
        }
      }

      return queries.slice(0, 20)
    } catch {
      return []
    }
  }

  /**
   * Fetch from Reddit (top posts from popular subreddits)
   */
  private async fetchReddit(): Promise<string[]> {
    try {
      const subreddits = ['news', 'worldnews', 'todayilearned', 'askreddit', 'technology']
      const randomSub = subreddits[Math.floor(Math.random() * subreddits.length)]

      const response = await axios.get(`https://www.reddit.com/r/${randomSub}/hot.json?limit=15`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })

      const posts = response.data.data.children || []
      const queries: string[] = []

      for (const post of posts) {
        const title = post.data?.title
        if (title && title.length > 10 && title.length < 100) {
          queries.push(title)
        }
      }

      return queries
    } catch {
      return []
    }
  }

  /**
   * Fetch from News API (requires API key - fallback to headlines scraping)
   */
  private async fetchNews(): Promise<string[]> {
    try {
      // Using NewsAPI.org free tier (limited requests)
      const apiKey = process.env.NEWS_API_KEY
      if (!apiKey) {
        return this.fetchNewsFallback()
      }

      const response = await axios.get('https://newsapi.org/v2/top-headlines', {
        params: {
          country: 'us',
          pageSize: 15,
          apiKey
        },
        timeout: 10000
      })

      const articles = response.data.articles || []
      return articles.map((a: { title?: string }) => a.title).filter((t: string | undefined) => t && t.length > 10)
    } catch {
      return this.fetchNewsFallback()
    }
  }

  /**
   * Fallback news scraper (BBC/CNN headlines)
   */
  private async fetchNewsFallback(): Promise<string[]> {
    try {
      const response = await axios.get('https://www.bbc.com/news', {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })

      const html = response.data
      const regex = /<h3[^>]*>(.*?)<\/h3>/gi
      const matches: RegExpMatchArray[] = []
      let match
      while ((match = regex.exec(html)) !== null) {
        matches.push(match)
      }

      return matches
        .map(m => m[1]?.replace(/<[^>]+>/g, '').trim())
        .filter((t: string | undefined) => t && t.length > 10 && t.length < 100)
        .slice(0, 10) as string[]
    } catch {
      return []
    }
  }

  /**
   * Fetch from Wikipedia (featured articles / trending topics)
   */
  private async fetchWikipedia(): Promise<string[]> {
    try {
      const response = await axios.get('https://en.wikipedia.org/w/api.php', {
        params: {
          action: 'query',
          list: 'random',
          rnnamespace: 0,
          rnlimit: 15,
          format: 'json'
        },
        timeout: 10000
      })

      const pages = response.data.query?.random || []
      return pages.map((p: { title?: string }) => p.title).filter((t: string | undefined) => t && t.length > 3)
    } catch {
      return []
    }
  }

  /**
   * Local fallback queries (curated list)
   */
  private getLocalFallback(count: number): string[] {
    const fallback = [
      'weather forecast',
      'news today',
      'stock market',
      'sports scores',
      'movie reviews',
      'recipes',
      'travel destinations',
      'health tips',
      'technology news',
      'best restaurants near me',
      'how to cook pasta',
      'python tutorial',
      'world events',
      'climate change',
      'electric vehicles',
      'space exploration',
      'artificial intelligence',
      'cryptocurrency',
      'gaming news',
      'fashion trends',
      'fitness workout',
      'home improvement',
      'gardening tips',
      'pet care',
      'book recommendations',
      'music charts',
      'streaming shows',
      'historical events',
      'science discoveries',
      'education resources'
    ]

    return this.shuffleArray(fallback).slice(0, count)
  }

  /**
   * Interleave queries from different sources for diversity
   */
  private interleaveQueries(queries: string[], targetCount: number): string[] {
    const result: string[] = []
    const sourceMap = new Map<string, string[]>()

    // Group queries by estimated source (simple heuristic)
    for (const q of queries) {
      const source = this.guessSource(q)
      if (!sourceMap.has(source)) {
        sourceMap.set(source, [])
      }
      sourceMap.get(source)?.push(q)
    }

    const sources = Array.from(sourceMap.values())
    let index = 0

    while (result.length < targetCount && sources.some(s => s.length > 0)) {
      const source = sources[index % sources.length]
      if (source && source.length > 0) {
        const q = source.shift()
        if (q) result.push(q)
      }
      index++
    }

    return result
  }

  /**
   * Guess which source a query came from (basic heuristic)
   */
  private guessSource(query: string): string {
    if (/^[A-Z]/.test(query) && query.includes(' ')) return 'news'
    if (query.length > 80) return 'reddit'
    if (/how to|what is|why/i.test(query)) return 'local'
    return 'trends'
  }

  /**
   * Shuffle array (Fisher-Yates)
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
    }
    return shuffled
  }

  /**
   * Clear cache (call between runs)
   */
  clearCache(): void {
    this.cache.clear()
  }
}
