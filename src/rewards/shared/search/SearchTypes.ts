export interface SearchTracker {
    readonly context: string
    readonly maxSearches: number
    readonly stagnantLimit: number
    readonly pointsGained: number | null

    prepare(): Promise<boolean>

    measure(): Promise<number | null>
    done(): boolean
    progress(): string
}

export interface WikipediaTopResponse {
    items: Array<{
        articles: Array<{
            article: string
            views: number
        }>
    }>
}

export interface RedditListing {
    data: {
        children: Array<{
            data: {
                title: string
                over_18: boolean
                stickied?: boolean
                created_utc?: number
            }
        }>
    }
}

export interface HackerNewsResponse {
    hits: Array<{
        title: string | null
        created_at_i?: number
    }>
}

export interface WikipediaRandomResponse {
    query?: {
        random?: Array<{
            id: number
            ns: number
            title: string
        }>
    }
}
