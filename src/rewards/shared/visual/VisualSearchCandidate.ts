import { URLs } from '../../../constants/urls'
import type { VisualSearchCandidate } from '../../types/VisualSearchTypes'

export function parseVisualSearchCandidate(raw: string): VisualSearchCandidate | null {
    try {
        const url = new URL(raw, URLs.bing.origin)
        if (
            url.origin !== URLs.bing.origin ||
            url.username ||
            url.password ||
            !['/search', '/images/search'].includes(url.pathname.replace(/\/$/, ''))
        )
            return null

        const bcid = url.searchParams.get('bcid')
        if (!bcid?.trim()) return null

        return { bcid, query: url.searchParams.get('q') ?? '', serpUrl: url.toString() }
    } catch {
        return null
    }
}
