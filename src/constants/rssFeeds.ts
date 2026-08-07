/**
 * 通过 `searchSettings.queryEngines` 中的点分隔路径在配置中选择：
 *   - "rss"                  -> 下方的全部订阅源
 *   - "rss.bbc"              -> 全部 BBC 订阅源
 *   - "rss.bbc.world"        -> 仅 BBC 国际新闻
 *
 * 如需添加自定义订阅源，请在此处新增一个 "site.endpoint": "url" 条目。
 *
 */
export const RSS_FEEDS: Record<string, Record<string, string>> = {
    // 热门搜索词
    googleTrends: {
        gb: 'https://trends.google.com/trending/rss?geo=GB',
        us: 'https://trends.google.com/trending/rss?geo=US'
    },

    // 聚合新闻标题
    googleNews: {
        gb: 'https://news.google.com/rss?hl=en-GB&gl=GB&ceid=GB:en',
        us: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en',
        world: 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en',
        technology: 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en',
        business: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en'
    },

    // BBC 新闻
    bbc: {
        top: 'https://feeds.bbci.co.uk/news/rss.xml',
        world: 'https://feeds.bbci.co.uk/news/world/rss.xml',
        technology: 'https://feeds.bbci.co.uk/news/technology/rss.xml',
        business: 'https://feeds.bbci.co.uk/news/business/rss.xml',
        science: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml'
    },

    // The Guardian
    guardian: {
        international: 'https://www.theguardian.com/international/rss',
        world: 'https://www.theguardian.com/world/rss',
        technology: 'https://www.theguardian.com/technology/rss'
    },

    // The Verge
    theVerge: {
        all: 'https://www.theverge.com/rss/index.xml'
    },

    // Ars Technica
    arsTechnica: {
        all: 'https://feeds.arstechnica.com/arstechnica/index'
    },

    // Reddit 列表订阅源
    reddit: {
        popular: 'https://www.reddit.com/r/popular/.rss',
        worldnews: 'https://www.reddit.com/r/worldnews/.rss',
        technology: 'https://www.reddit.com/r/technology/.rss'
    }
}
