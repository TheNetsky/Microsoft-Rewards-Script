/**
 * Selected in config via a dotted path in `searchSettings.queryEngines`:
 *   - "rss"                  -> regional Google feeds plus the other feeds below
 *   - "rss.googleTrends"     -> account country (explicit .gb/.us still supported)
 *   - "rss.googleNews"       -> account language and country
 *   - "rss.bbc"              -> every BBC feed
 *   - "rss.bbc.world"        -> just BBC world
 *
 * Add your own by dropping a new "site.endpoint": "url" entry here
 *
 */
export const RSS_FEEDS: Record<string, Record<string, string>> = {
    // Trending search terms
    googleTrends: {
        gb: 'https://trends.google.com/trending/rss?geo=GB',
        us: 'https://trends.google.com/trending/rss?geo=US'
    },

    // Aggregated headlines
    googleNews: {
        gb: 'https://news.google.com/rss?hl=en-GB&gl=GB&ceid=GB:en',
        us: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en',
        world: 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en',
        technology: 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en',
        business: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en'
    },

    // BBC News
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

    // Reddit listing feeds
    reddit: {
        popular: 'https://www.reddit.com/r/popular/.rss',
        worldnews: 'https://www.reddit.com/r/worldnews/.rss',
        technology: 'https://www.reddit.com/r/technology/.rss'
    }
}
