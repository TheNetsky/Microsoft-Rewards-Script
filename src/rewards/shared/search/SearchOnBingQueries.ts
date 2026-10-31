import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { BotContext } from '../../../core/BotContext'
import { URLs } from '../../../constants/urls'
import { resolveQueryLocale } from '../query/QueryContext'
import type { BasePromotion } from '../../types/RewardsState'

interface ActivityQueries {
    id?: string
    title: string
    titles: string[]
    categories: string[]
    queries: Record<string, string[]>
}

type QueryContext = Pick<
    BotContext,
    'accountLocale' | 'config' | 'http' | 'isMobile' | 'logger' | 'signal' | 'userData' | 'utils'
>
type QuerySource = 'remote' | 'local' | 'local-fallback'
interface RemoteCatalogue {
    entries: ActivityQueries[]
    source: QuerySource
}

let bundled: ActivityQueries[] | undefined
const remoteCatalogues = new WeakMap<QueryContext, Promise<RemoteCatalogue>>()

/** Microsoft puts the search category before _exploreonbing, independently of the card title. */
export function searchOnBingCategory(value: BasePromotion | string): string | undefined {
    const values =
        typeof value === 'string'
            ? [value]
            : [value.offerId, value.name, value.attributes.offerid, value.attributes.offerId, value.destinationUrl]
    for (const candidate of values) {
        if (typeof candidate !== 'string') continue
        let decoded = candidate
        for (let depth = 0; depth < 3; depth++) {
            const match = decoded.match(/(?:^|_)([a-z0-9]+)_exploreonbing(?:_|$)/i)
            if (match) return match[1]!.toLowerCase()
            try {
                const next = decodeURIComponent(decoded)
                if (next === decoded) break
                decoded = next
            } catch {
                break
            }
        }
    }
    return undefined
}

function queryRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a query entry object')
    return value as Record<string, unknown>
}

function queryStrings(value: unknown): string[] {
    if (!Array.isArray(value) || value.some(entry => typeof entry !== 'string' || !entry.trim() || entry.length > 512))
        throw new Error('Expected a list of nonempty query strings')
    return [...new Set(value.map(entry => (entry as string).trim()))]
}

function parseCatalogue(value: unknown): ActivityQueries[] {
    if (!Array.isArray(value) || !value.length) throw new Error('Query catalogue must be a nonempty array')
    const categories = new Set<string>()
    return value.map(raw => {
        const entry = queryRecord(raw)
        const id = typeof entry.id === 'string' ? entry.id.trim().toLowerCase() : undefined
        if (id !== undefined && !/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(id)) throw new Error('Invalid query topic ID')
        if (typeof entry.title !== 'string' || !entry.title.trim()) throw new Error('Query topic title is missing')
        const queries: Record<string, string[]> = {}
        if (Array.isArray(entry.queries)) queries.en = queryStrings(entry.queries)
        else {
            if (!id) throw new Error('Multilingual query topics need an ID')
            for (const [language, values] of Object.entries(queryRecord(entry.queries))) {
                const locale = new Intl.Locale(language).baseName.toLowerCase()
                if (queries[locale]) throw new Error(`Duplicate query locale: ${language}`)
                queries[locale] = queryStrings(values)
            }
        }
        if (!Object.values(queries).some(values => values.length)) throw new Error('Query topic has no queries')
        const aliases =
            entry.categories === undefined ? [] : queryStrings(entry.categories).map(value => value.toLowerCase())
        for (const category of new Set([...(id ? [id] : []), ...aliases])) {
            if (categories.has(category)) throw new Error(`Duplicate search category: ${category}`)
            categories.add(category)
        }
        return {
            id,
            title: entry.title.trim(),
            titles: entry.titles === undefined ? [] : queryStrings(entry.titles),
            categories: aliases,
            queries
        }
    })
}

function readBundled(): ActivityQueries[] {
    return (bundled ??= parseCatalogue(
        JSON.parse(readFileSync(path.join(__dirname, '../../../data/bing-search-activity-queries.json'), 'utf8'))
    ))
}

async function readRemote(bot: QueryContext): Promise<RemoteCatalogue> {
    let pending = remoteCatalogues.get(bot)
    if (!pending) {
        pending = (async (): Promise<RemoteCatalogue> => {
            try {
                const response = await bot.http.request<unknown>({
                    method: 'GET',
                    url: URLs.github.searchOnBingQueries,
                    timeout: 10000,
                    retries: 0,
                    maxResponseBytes: 4 * 1024 * 1024,
                    signal: bot.signal
                })
                bot.signal.throwIfAborted()
                return { entries: parseCatalogue(response.data), source: 'remote' }
            } catch (error) {
                if (bot.signal.aborted) {
                    remoteCatalogues.delete(bot)
                    bot.signal.throwIfAborted()
                }
                bot.logger.warn(
                    bot.isMobile,
                    'SEARCH-ON-BING-QUERY',
                    `Remote query catalogue unavailable; using bundled queries | ${error instanceof Error ? error.message : String(error)}`
                )
                return { entries: [], source: 'local-fallback' }
            }
        })()
        remoteCatalogues.set(bot, pending)
    }
    return pending
}

function localeChoices(bot: QueryContext): string[] {
    const { language, country } = resolveQueryLocale(bot)
    const account = bot.accountLocale?.locale ? new Intl.Locale(bot.accountLocale.locale) : undefined
    const locale =
        account?.language === language
            ? new Intl.Locale(account.baseName, { region: country })
            : new Intl.Locale(language, { region: country })
    const script = locale.script ?? locale.maximize().script
    return [
        ...new Set([
            locale.baseName,
            ...(script ? [`${locale.language}-${script}-${country}`, `${locale.language}-${script}`] : []),
            locale.language,
            'en'
        ])
    ].map(value => value.toLowerCase())
}

export async function getSearchOnBingQueries(bot: QueryContext, promotion: BasePromotion): Promise<string[]> {
    bot.signal.throwIfAborted()
    const local = readBundled()
    const remote = bot.config.searchOnBingLocalQueries
        ? { entries: [], source: 'local' as const }
        : await readRemote(bot)
    bot.signal.throwIfAborted()
    const category = searchOnBingCategory(promotion)
    const title = bot.utils.normalizeTitle(promotion.title)
    const names = (entry: ActivityQueries): string[] =>
        [entry.title, ...entry.titles].map(value => bot.utils.normalizeTitle(value))
    const byCategory = (entries: ActivityQueries[]): ActivityQueries | undefined =>
        category ? entries.find(entry => entry.id === category || entry.categories.includes(category)) : undefined
    const byTitle = (entries: ActivityQueries[]): ActivityQueries | undefined => {
        const matches = title ? entries.filter(entry => names(entry).includes(title)) : []
        return matches.length === 1 ? matches[0] : undefined
    }
    const reference = byCategory(local) ?? byCategory(remote.entries) ?? byTitle(local) ?? byTitle(remote.entries)
    if (!reference) {
        bot.logger.warn(
            bot.isMobile,
            'SEARCH-ON-BING-QUERY',
            `No query topic matched; leaving activity unconfirmed | offerId=${promotion.offerId} | category=${category ?? 'unknown'} | title=${JSON.stringify(promotion.title)}`
        )
        return []
    }
    const ids = new Set([reference.id, ...reference.categories].filter(Boolean))
    const referenceNames = names(reference)
    const related = (entries: ActivityQueries[]): ActivityQueries | undefined =>
        entries.find(entry => (entry.id && ids.has(entry.id)) || entry.categories.some(value => ids.has(value))) ??
        entries.find(
            entry => (!entry.id || !reference.id) && names(entry).some(value => referenceNames.includes(value))
        )
    const sources: { entry: ActivityQueries | undefined; source: QuerySource }[] = [
        { entry: related(remote.entries), source: 'remote' },
        { entry: related(local), source: remote.source === 'local-fallback' ? 'local-fallback' : 'local' }
    ]
    const locales = localeChoices(bot)

    for (const locale of locales) {
        for (const { entry, source } of sources) {
            const queries = entry?.queries[locale]
            if (!queries?.length) continue
            if (locale === 'en' && !locales[0]!.startsWith('en'))
                bot.logger.info(
                    bot.isMobile,
                    'SEARCH-ON-BING-QUERY',
                    `Using English query fallback | topic=${reference.id ?? category ?? 'legacy'} | requestedLocale=${locales[0]}`
                )
            bot.logger.debug(
                bot.isMobile,
                'SEARCH-ON-BING-QUERY',
                `Selected activity queries | offerId=${promotion.offerId} | topic=${reference.id ?? category ?? 'legacy'}` +
                    ` | matchedBy=${byCategory(local) || byCategory(remote.entries) ? 'offer-category' : 'title'}` +
                    ` | requestedLocale=${locales[0]} | queryLocale=${locale} | source=${source} | queries=${queries.length}`
            )
            return bot.utils.shuffleArray([...queries])
        }
    }
    bot.logger.warn(
        bot.isMobile,
        'SEARCH-ON-BING-QUERY',
        `No queries available for topic | offerId=${promotion.offerId} | topic=${reference.id ?? category ?? 'legacy'} | requestedLocale=${locales[0]}`
    )
    return []
}
