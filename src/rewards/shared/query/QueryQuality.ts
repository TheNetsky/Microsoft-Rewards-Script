import type { QueryKind, QueryTopic } from './QueryContext'

const SOURCE_PRIORITY: Record<QueryKind, number> = {
    trend: 100,
    evergreen: 80,
    encyclopedia: 65,
    headline: 45,
    random: 15
}
const COMMON_WORDS = new Set(
    'a an the and or of for to in on with at by is are was be how what when why best latest new'.split(' ')
)
const WORD_SEGMENTER = new Intl.Segmenter('en', { granularity: 'word' })

function normalizeQueryKey(query: string): string {
    return query.normalize('NFKC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function cleanQuery(text: string, headline = false, publisher?: string): string | null {
    let query = text
        .normalize('NFKC')
        .replace(/<[^>]*>/g, ' ')
        .replace(/[\u200B\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    if (headline) {
        const separator = /\s+(?:[-–—|])\s+/
        const parts = query.split(separator)
        const suffix = parts.at(-1) ?? ''
        if (
            parts.length > 1 &&
            (normalizeQueryKey(suffix) === normalizeQueryKey(publisher ?? '') ||
                /^(?:BBC(?: News)?|The Guardian|Reuters|Associated Press|The Verge|Ars Technica)$/i.test(suffix))
        ) {
            parts.pop()
            query = parts.join(' - ')
        }
        query = query
            .replace(/^(?:(?:show|ask) HN|breaking(?: news)?|live updates?|explained|watch):\s*/i, '')
            .replace(/\s*[[(](?:video|photos?|gallery|pdf|updated)[\])]$/i, '')
            .trim()
        if (/\b(?:you won['’]t believe|click here|read more|megathread|upvote|unpopular opinion)\b/i.test(query))
            return null
    }

    if (query.length < 2 || query.length > 120 || query.split(/\s+/).length > 18 || !/[\p{L}\p{N}]/u.test(query))
        return null
    if (/https?:\/\/|www\.|\p{Cc}/iu.test(query)) return null
    return query
}

function queryWords(query: string): string[] {
    const tokens = normalizeQueryKey(query).match(/[.#]?[\p{L}\p{N}]+(?:[+#]+|\.[\p{L}\p{N}]+)*/gu) ?? []
    return tokens.flatMap(token =>
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u.test(token)
            ? [...WORD_SEGMENTER.segment(token)].filter(part => part.isWordLike).map(part => part.segment)
            : [token]
    )
}

export function queryFingerprint(query: string): string {
    return queryWords(query).join(' ')
}

export function isRelevantSuggestion(topic: string, suggestion: string): boolean {
    const anchors = [...new Set(queryWords(topic).filter(word => !COMMON_WORDS.has(word)))]
    if (!anchors.length) return false
    const words = new Set(queryWords(suggestion))
    const matches = anchors.filter(word => words.has(word)).length
    return matches >= Math.max(1, Math.ceil((anchors.length * 2) / 3))
}

function topicScore(topic: QueryTopic, language: string, country: string, now = Date.now()): number {
    let score = SOURCE_PRIORITY[topic.kind] - Math.min(topic.sourceRank, 50) / 10
    if (topic.language) score += topic.language.split('-')[0] === language.split('-')[0] ? 10 : -60
    if (topic.country) score += topic.country === country ? 10 : -20
    if (topic.publishedAt !== undefined) {
        const ageDays = Math.max(0, now - topic.publishedAt) / 86400000
        score += ageDays <= 1 ? 10 : ageDays <= 3 ? 5 : ageDays > 7 ? -30 : 0
    }
    return score
}

export function prepareTopics(topics: QueryTopic[], language: string, country: string): QueryTopic[] {
    const unique = new Map<string, QueryTopic>()
    const now = Date.now()
    for (const topic of topics) {
        const text = cleanQuery(topic.text, topic.kind === 'headline')
        if (!text) continue
        const candidate = { ...topic, text }
        const key = queryFingerprint(text)
        if (!key) continue
        const previous = unique.get(key)
        if (!previous || topicScore(candidate, language, country, now) > topicScore(previous, language, country, now))
            unique.set(key, candidate)
    }
    return [...unique.values()]
}

export function orderTopics(topics: QueryTopic[], language: string, country: string, shuffle: boolean): QueryTopic[] {
    const groups = new Map<QueryKind, QueryTopic[]>()
    const now = Date.now()
    const ranked = topics
        .map(topic => ({
            topic,
            score: topicScore(topic, language, country, now) + (shuffle ? Math.random() * 10 : 0)
        }))
        .sort((a, b) => b.score - a.score)
    for (const { topic } of ranked) {
        const group = groups.get(topic.kind) ?? []
        group.push(topic)
        groups.set(topic.kind, group)
    }

    const rotation: QueryKind[] = [
        'trend',
        'evergreen',
        'trend',
        'encyclopedia',
        'evergreen',
        'trend',
        'headline',
        'random'
    ]
    const positions = new Map<QueryKind, number>()
    const ordered: QueryTopic[] = []
    while (ordered.length < ranked.length) {
        for (const kind of rotation) {
            const position = positions.get(kind) ?? 0
            const topic = groups.get(kind)?.[position]
            if (!topic) continue
            ordered.push(topic)
            positions.set(kind, position + 1)
        }
    }
    return ordered
}
