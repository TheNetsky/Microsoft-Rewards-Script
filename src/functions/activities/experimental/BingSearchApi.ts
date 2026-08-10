import { randomBytes } from 'crypto'

import { URLs } from '../../../constants/urls'
import type { MicrosoftRewardsBot } from '../../../index'

export interface BingSearchReport {
    ig: string | null
    balance: number | null
    previousBalance: number | null
    gained: number | null
    searchPointsEarned: number | null
    searchPointsLimit: number | null
}

interface ParsedReport {
    balance: number | null
    previousBalance: number | null
    searchPointsEarned: number | null
    searchPointsLimit: number | null
}

export class BingSearchApi {
    private readonly cookieJar = new Map<string, string>()

    constructor(private readonly bot: MicrosoftRewardsBot) {
        const cookies = bot.isMobile ? bot.cookies.mobile : bot.cookies.desktop
        for (const cookie of cookies) {
            const domain = cookie.domain.replace(/^\./, '')
            if (domain === 'bing.com' || domain.endsWith('.bing.com')) {
                this.cookieJar.set(cookie.name, cookie.value)
            }
        }
    }

    public async report(query: string, options?: { cvid?: string; cg?: string }): Promise<BingSearchReport> {
        const cvid = options?.cvid ?? randomBytes(16).toString('hex')
        const searchUrl = URLs.bing.search(query, cvid)
        const headers = { ...(this.bot.fingerprint?.headers ?? {}) }
        delete headers['Cookie']
        delete headers['cookie']

        const searchResponse = await this.bot.http.request({
            url: searchUrl,
            method: 'GET',
            headers: {
                ...headers,
                Cookie: this.cookieHeader(),
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1'
            }
        })
        this.mergeCookies(searchResponse.headers?.['set-cookie'] as string[] | string | undefined)

        const ig = this.readIg(searchResponse.data)
        if (!ig) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'SEARCH-REPORT',
                `No IG for "${query}" - SERP not served as expected`
            )
            return { ig: null, ...this.emptyReport(), gained: null }
        }

        const params = new URLSearchParams({
            IG: ig,
            IID: 'SERP.5064',
            q: query,
            FORM: 'ANNTA1',
            cvid,
            ajaxreq: '1'
        })
        if (options?.cg) params.set('cg', options.cg)

        const reportResponse = await this.bot.http.request({
            url: `${URLs.bing.origin}/rewardsapp/reportActivity?${params.toString()}`,
            method: 'POST',
            headers: {
                ...headers,
                Cookie: this.cookieHeader(),
                Accept: '*/*',
                'Content-Type': 'application/x-www-form-urlencoded',
                Referer: searchUrl,
                Origin: URLs.bing.origin,
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                'X-Requested-With': 'XMLHttpRequest'
            },
            data: `url=${encodeURIComponent(searchUrl)}&V=web`
        })
        this.mergeCookies(reportResponse.headers?.['set-cookie'] as string[] | string | undefined)

        const parsed = this.parseReport(reportResponse.data)
        const gained =
            parsed.balance !== null && parsed.previousBalance !== null ? parsed.balance - parsed.previousBalance : null

        this.bot.logger.debug(
            this.bot.isMobile,
            'SEARCH-REPORT',
            `Reported "${query}" | ig=${ig} | pointsGained=${gained ?? 'n/a'}` +
                ` | currentBalance=${parsed.balance ?? 'n/a'}` +
                ` | searchPts=${parsed.searchPointsEarned ?? 'n/a'}/${parsed.searchPointsLimit ?? 'n/a'}`
        )

        return { ig, ...parsed, gained }
    }

    private readIg(data: unknown): string | null {
        if (typeof data !== 'string') return null
        return (data.match(/\bIG:"([A-F0-9]{32})"/i) ?? data.match(/[?&]IG=([A-F0-9]{32})\b/i))?.[1] ?? null
    }

    private mergeCookies(setCookie?: string[] | string): void {
        if (!setCookie) return

        for (const raw of Array.isArray(setCookie) ? setCookie : [setCookie]) {
            const pair = raw.split(';', 1)[0] ?? ''
            const separator = pair.indexOf('=')
            if (separator <= 0) continue

            const name = pair.slice(0, separator).trim()
            const value = pair.slice(separator + 1).trim()
            if (!name) continue

            const expired = /expires=Thu,\s*01\s*Jan\s*1970/i.test(raw) || /\bmax-age=0\b/i.test(raw)
            if (!value || expired) this.cookieJar.delete(name)
            else this.cookieJar.set(name, value)
        }
    }

    private cookieHeader(): string {
        return [...this.cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
    }

    private parseReport(data: unknown): ParsedReport {
        if (typeof data !== 'string') return this.emptyReport()

        const match = data.match(/ModernRewards\.ReportActivity\((\{[\s\S]*?\})\)\s*;/)
        if (!match) return this.emptyReport()

        try {
            const session = JSON.parse(match[1] ?? '{}').RewardsSessionData ?? {}
            const numberOrNull = (value: unknown): number | null => (typeof value === 'number' ? value : null)
            return {
                balance: numberOrNull(session.Balance),
                previousBalance: numberOrNull(session.PreviousBalance),
                searchPointsEarned: numberOrNull(session.DailySearchPointsEarned),
                searchPointsLimit: numberOrNull(session.DailySearchPointsLimit)
            }
        } catch {
            return this.emptyReport()
        }
    }

    private emptyReport(): ParsedReport {
        return {
            balance: null,
            previousBalance: null,
            searchPointsEarned: null,
            searchPointsLimit: null
        }
    }
}
