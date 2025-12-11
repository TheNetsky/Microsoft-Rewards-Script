// Google Trends
export type GoogleTrendsResponse = [string, [string, ...null[], [string, ...string[]]][]]

export interface GoogleSearch {
    topic: string
    related: string[]
}

// Bing Suggestions
export interface BingSuggestionResponse {
    _type: string
    instrumentation: BingInstrumentation
    queryContext: BingQueryContext
    suggestionGroups: BingSuggestionGroup[]
}

export interface BingInstrumentation {
    _type: string
    pingUrlBase: string
    pageLoadPingUrl: string
    llmPingUrlBase: string
    llmLogPingUrlBase: string
}

export interface BingQueryContext {
    originalQuery: string
}

export interface BingSuggestionGroup {
    name: string
    searchSuggestions: BingSearchSuggestion[]
}

export interface BingSearchSuggestion {
    url: string
    urlPingSuffix: string
    displayText: string
    query: string
    result?: BingResult[]
    searchKind?: string
}

export interface BingResult {
    id: string
    readLink: string
    readLinkPingSuffix: string
    webSearchUrl: string
    webSearchUrlPingSuffix: string
    name: string
    image: BingSuggestionImage
    description: string
    entityPresentationInfo: BingEntityPresentationInfo
    bingId: string
}

export interface BingEntityPresentationInfo {
    entityScenario: string
    entityTypeDisplayHint: string
    query: string
}

export interface BingSuggestionImage {
    thumbnailUrl: string
    hostPageUrl: string
    hostPageUrlPingSuffix: string
    width: number
    height: number
    sourceWidth: number
    sourceHeight: number
}

// Bing Tending Topics
export interface BingTrendingTopicsResponse {
    _type: string
    instrumentation: BingInstrumentation
    value: BingValue[]
}

export interface BingValue {
    webSearchUrl: string
    webSearchUrlPingSuffix: string
    name: string
    image: BingTrendingImage
    isBreakingNews: boolean
    query: BingTrendingQuery
    newsSearchUrl: string
    newsSearchUrlPingSuffix: string
}

export interface BingTrendingImage {
    url: string
}

export interface BingTrendingQuery {
    text: string
}
