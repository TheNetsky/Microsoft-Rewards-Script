import { randomBytes } from 'node:crypto'

import { URLs } from '../../../constants/urls'
import type { BotContext } from '../../../core/BotContext'
import { BingClient } from '../../shared/http/BingClient'
import type { VisualSearchCandidate } from '../../types/VisualSearchTypes'
import { parseBingSearchReport, type BingSearchReport } from '../../shared/search/BingSearchReport'
import { parseVisualSearchCandidate } from '../../shared/visual/VisualSearchCandidate'

export class BingSearchApi {
    private readonly client: BingClient

    constructor(private readonly bot: BotContext) {
        this.client = new BingClient(bot)
    }

    async report(query: string, options?: { cvid?: string; cg?: string; retries?: number }): Promise<BingSearchReport> {
        const cvid = options?.cvid ?? randomBytes(16).toString('hex')
        const searchUrl = URLs.bing.search(query, cvid)
        return this.reportSearch(query, searchUrl, { ...options, cvid })
    }

    reportVisual(candidate: VisualSearchCandidate): Promise<BingSearchReport> {
        const resolved = parseVisualSearchCandidate(candidate.serpUrl)
        if (!resolved || resolved.bcid !== candidate.bcid) throw new Error('Invalid Bing Visual Search result URL')
        const url = new URL(resolved.serpUrl)
        return this.reportSearch(resolved.query, resolved.serpUrl, {
            bcid: resolved.bcid,
            cvid: url.searchParams.get('cvid') ?? undefined
        })
    }

    private async reportSearch(
        query: string,
        searchUrl: string,
        options: { cvid?: string; cg?: string; bcid?: string; retries?: number }
    ): Promise<BingSearchReport> {
        const context = options.bcid ? 'VISUAL-SEARCH-REPORT' : 'SEARCH-REPORT'
        const searchResponse = await this.client.request<string>({
            url: searchUrl,
            method: 'GET',
            headers: {
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            responseType: 'text',
            retries: options.retries
        })

        const ig = this.readIg(searchResponse.data)
        if (!ig) {
            this.bot.logger.warn(this.bot.isMobile, context, `No IG for "${query}" - SERP not served as expected`)
            return parseBingSearchReport(null)
        }

        const params = new URLSearchParams({
            IG: ig,
            IID: 'SERP.5064',
            q: query,
            FORM: options.bcid
                ? (new URL(searchUrl).searchParams.get('FORM') ??
                  new URL(searchUrl).searchParams.get('form') ??
                  'SBIHMP')
                : 'ANNTA1',
            ajaxreq: '1'
        })
        if (options.cvid) params.set('cvid', options.cvid)
        if (options.cg) params.set('cg', options.cg)
        if (options.bcid) params.set('bcid', options.bcid)

        const reportUrl = `${URLs.bing.origin}/rewardsapp/reportActivity?${params.toString()}`
        const reportResponse = await this.client.request<string>({
            url: reportUrl,
            method: 'POST',
            headers: {
                Accept: '*/*',
                'Content-Type': 'application/x-www-form-urlencoded',
                Referer: searchUrl,
                Origin: URLs.bing.origin,
                'X-Requested-With': 'XMLHttpRequest'
            },
            data: new URLSearchParams({ url: searchUrl, V: 'web' }).toString(),
            responseType: 'text',
            retries: 0
        })

        const report = parseBingSearchReport(reportResponse.data, true, ig)

        this.bot.logger.debug(
            this.bot.isMobile,
            context,
            `Reported "${query}" | transport=node-http | ig=${ig} | sessionBalanceDelta=${report.sessionBalanceDelta ?? 'unknown'}` +
                (options.bcid ? ` | bcid=${options.bcid.slice(0, 12)}` : '') +
                ` | currentBalance=${report.balance ?? 'n/a'}` +
                ` | searchPts=${report.searchPointsEarned ?? 'n/a'}/${report.searchPointsLimit ?? 'n/a'}`
        )

        return report
    }

    private readIg(data: unknown): string | null {
        if (typeof data !== 'string') return null
        return (
            (data.match(/\b["']?IG["']?\s*:\s*["']([A-F0-9]{32})["']/i) ??
                data.match(/[?&]IG=([A-F0-9]{32})\b/i))?.[1] ?? null
        )
    }
}
