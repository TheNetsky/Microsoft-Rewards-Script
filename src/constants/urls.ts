const REWARDS = 'https://rewards.bing.com'
const PLATFORM = 'https://prod.rewardsplatform.microsoft.com'
const BING = 'https://www.bing.com'
const LOGIN_LIVE = 'https://login.live.com'
const LOGIN_MS = 'https://login.microsoftonline.com'

// Query-engine
const GOOGLE_TRENDS = 'https://trends.google.com'
const BING_API = 'https://api.bing.com'
const BING_APIS = 'https://www.bingapis.com'
const WIKIMEDIA = 'https://wikimedia.org'
const REDDIT = 'https://www.reddit.com'
const HACKER_NEWS = 'https://hn.algolia.com'

// Public Bing API app id, gotten from mitm, but bound to change?
const BING_SUGGESTIONS_APPID = '6D0A9B8C5100E9ECC7E11A104ADD76C10219804B'

export const URLs = {
    github: {
        searchOnBingQueries:
            'https://raw.githubusercontent.com/TheNetsky/Microsoft-Rewards-Script/refs/heads/v5/src/data/bing-search-activity-queries.json'
    },
    rewards: {
        origin: REWARDS,
        referer: `${REWARDS}/`,
        // Legacy, avoid!
        userInfoApi: `${REWARDS}/api/getuserinfo`,
        // Offers page
        earn: `${REWARDS}/earn`,
        dashboard: `${REWARDS}/dashboard`,
        userLogin: `${REWARDS}/auth/login`,
        quest: (parentOfferId: string) => `${REWARDS}/earn/quest/${parentOfferId}`,
        path: (path: string) => `${REWARDS}${path}`
    },
    platform: {
        origin: PLATFORM,
        me: (channel: string) => `${PLATFORM}/dapi/me?channel=${channel}&options=613`,
        edgeProfile: `${PLATFORM}/dapi/me?channel=edge&options=Profile,Promotions`,
        activities: `${PLATFORM}/dapi/me/activities`
    },
    auth: {
        bingSignIn: `${BING}/fd/auth/signin?action=interactive&provider=windows_live_id&return_url=https%3A%2F%2Fwww.bing.com%2F`,
        loginLive: `${LOGIN_LIVE}/`,
        oauthAuthorize: `${LOGIN_LIVE}/oauth20_authorize.srf`,
        oauthRedirect: `${LOGIN_LIVE}/oauth20_desktop.srf`,
        oauthToken: `${LOGIN_MS}/consumers/oauth2/v2.0/token`
    },
    bing: {
        origin: BING,
        images: `${BING}/images`,
        rewardsFlyoutPage: `${BING}/rewards/panelflyout?channel=bingflyout&partnerId=BingRewards&isDarkMode=0&ru=${encodeURIComponent(`${BING}/`)}`,
        rewardsFlyoutUserInfo: `${BING}/rewards/panelflyout/getuserinfo?channel=BingFlyout&partnerId=BingRewards`,
        rewardsFlyoutReportActivity: `${BING}/msrewards/api/v1/reportactivity`,
        search: (query: string, cvid: string) =>
            `${BING}/search?q=${encodeURIComponent(query)}&PC=U531&FORM=ANNTA1&cvid=${cvid}`
    },
    queryEngine: {
        googleTrends: (country: string) => `${GOOGLE_TRENDS}/trending/rss?geo=${encodeURIComponent(country)}`,
        googleNews: (language: string, country: string, topic?: string) =>
            `https://news.google.com/rss${topic ? `/headlines/section/topic/${topic.toUpperCase()}` : ''}?hl=${encodeURIComponent(language)}&gl=${encodeURIComponent(country)}&ceid=${encodeURIComponent(`${country}:${language.split('-')[0]}`)}`,
        bingSuggestions: (query: string, langCode: string, country = 'US') =>
            `${BING_APIS}/api/v7/suggestions?q=${encodeURIComponent(query)}&appid=${BING_SUGGESTIONS_APPID}&cc=${encodeURIComponent(country)}&setlang=${encodeURIComponent(langCode)}`,
        bingRelated: (query: string, langCode = 'en', country = 'US') =>
            `${BING_API}/osjson.aspx?query=${encodeURIComponent(query)}&cc=${encodeURIComponent(country)}&setlang=${encodeURIComponent(langCode)}`,
        wikipediaTop: (langCode: string, year: number, month: string, day: string) =>
            `${WIKIMEDIA}/api/rest_v1/metrics/pageviews/top/${langCode}.wikipedia/all-access/${year}/${month}/${day}`,
        wikipediaRandom: (langCode: string) =>
            `https://${langCode}.wikipedia.org/w/api.php?action=query&format=json&list=random&rnnamespace=0&rnlimit=20`,
        hackerNews: `${HACKER_NEWS}/api/v1/search?tags=front_page&hitsPerPage=50`,
        reddit: (subreddit: string) => `${REDDIT}/r/${subreddit}.json?limit=50`
    }
} as const

export const REWARDS_BASE_URL = URLs.rewards.origin
