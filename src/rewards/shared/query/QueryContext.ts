import type { BotContext } from '../../../core/BotContext'
import { normalizeCountry } from '../../../util/Locale'

export interface QueryLocale {
    mode: 'account' | 'english'
    language: string
    country: string
}

export interface QueryOrigin {
    source: string
    sourceUrl: string
    language?: string
    country?: string
}

export interface SourcedQuery extends QueryOrigin {
    text: string
}

export type QueryKind = 'trend' | 'evergreen' | 'encyclopedia' | 'headline' | 'random'

export interface QueryTopic extends SourcedQuery {
    kind: QueryKind
    publishedAt?: number
    sourceRank: number
}

export interface SearchQuery extends SourcedQuery {
    topic: QueryTopic
    locale: QueryLocale
}

export function formatSearchQuery(query: SearchQuery): string {
    return `query=${JSON.stringify(query.text)} | language=${query.language ?? 'unknown'} | source=${query.source}`
}

export function resolveQueryLocale(bot: Pick<BotContext, 'config' | 'userData' | 'accountLocale'>): QueryLocale {
    if (bot.config.searchSettings.useAccountLocale === false) return { mode: 'english', language: 'en', country: 'US' }
    const country = normalizeCountry(bot.userData.geoLocale) ?? normalizeCountry(bot.accountLocale.country) ?? 'US'

    const language = new Intl.Locale('und', { region: country }).maximize().language
    return {
        mode: 'account',
        language,
        country
    }
}

export function querySourceLocation(sourceUrl: string | undefined): string {
    if (!sourceUrl) return 'unknown'
    if (sourceUrl === 'src/data/search-queries.json') return sourceUrl
    try {
        const url = new URL(sourceUrl)
        return `${url.origin}${url.pathname}`
    } catch {
        return 'unknown'
    }
}

export function formatQueryOrigin(origin: QueryOrigin): string {
    return (
        `source=${origin.source} | fetchedFrom=${JSON.stringify(querySourceLocation(origin.sourceUrl))}` +
        ` | sourceLanguage=${origin.language ?? 'unknown'} | sourceCountry=${origin.country ?? 'any'}`
    )
}
