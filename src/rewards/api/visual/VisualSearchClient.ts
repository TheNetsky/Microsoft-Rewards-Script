import { URLs } from '../../../constants/urls'
import type { BotContext } from '../../../core/BotContext'
import { isTerminalHttpError } from '../../../network/HttpError'
import type { BingSearchReport } from '../../shared/search/BingSearchReport'
import type { VisualSearchCandidate } from '../../types/VisualSearchTypes'
import { parseVisualSearchCandidate } from '../../shared/visual/VisualSearchCandidate'
import { BingClient } from '../../shared/http/BingClient'
import { BingSearchApi } from '../search/BingSearchApi'

const STATIC_SEED_URL = 'https://th.bing.com/th?id=OMR.VisualSearch.VNext.BackgroundImage.png&pid=Rewards'
const ARCHIVE_SIZE = 8

export class VisualSearchClient {
    private readonly client: BingClient
    private readonly search: BingSearchApi

    constructor(private readonly bot: BotContext) {
        this.client = new BingClient(bot)
        this.search = new BingSearchApi(bot)
    }

    report(candidate: VisualSearchCandidate): Promise<BingSearchReport> {
        return this.search.reportVisual(candidate)
    }

    async acquire(imageUrl?: string): Promise<VisualSearchCandidate | null> {
        try {
            const seed = imageUrl ?? (await this.getSeedUrls())[0] ?? STATIC_SEED_URL
            const url = new URL('/images/kblob', URLs.bing.origin)
            url.search = new URLSearchParams({
                iss: 'sbi',
                form: 'SBIHMP',
                sbisrc: 'UrlPaste',
                vsimg: seed,
                imgurl: seed
            }).toString()
            const form = new FormData()
            form.append('cbir', 'sbi')
            form.append('imageBin', '')
            form.append('imgurl', '')
            const encoded = new Request(url, { method: 'POST', body: form })
            const response = await this.client.request({
                url: url.toString(),
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': encoded.headers.get('content-type')!,
                    Origin: URLs.bing.origin,
                    Referer: URLs.bing.images
                },
                data: new Uint8Array(await encoded.arrayBuffer()),
                retries: 0
            })
            const redirectUrl = this.parseRedirect(response.data)
            if (!redirectUrl) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'VISUAL-SEARCH-BCID',
                    `kblob returned no redirectUrl | status=${response.status} | transport=node-http`
                )
                return null
            }

            const candidate = parseVisualSearchCandidate(redirectUrl)
            if (!candidate) {
                const redirect = new URL(redirectUrl, URLs.bing.origin)
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'VISUAL-SEARCH-BCID',
                    `kblob returned an invalid Bing Visual Search URL | status=${response.status}` +
                        ` | origin=${redirect.origin} | path=${redirect.pathname}` +
                        ` | hasBcid=${Boolean(redirect.searchParams.get('bcid'))}`
                )
                return null
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'VISUAL-SEARCH-BCID',
                `Acquired bcid=${candidate.bcid.slice(0, 14)} | q="${candidate.query}" | status=${response.status}` +
                    ` | path=${new URL(candidate.serpUrl).pathname}` +
                    ` | seed=${seed.slice(0, 80)} | transport=node-http`
            )
            return candidate
        } catch (error) {
            this.bot.signal.throwIfAborted()
            if (isTerminalHttpError(error)) throw error
            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH-BCID',
                `Failed to acquire visual search | ${error instanceof Error ? error.message : String(error)}`
            )
            return null
        }
    }

    async getSeedUrls(): Promise<string[]> {
        try {
            const url = new URL('/HPImageArchive.aspx', URLs.bing.origin)
            url.search = new URLSearchParams({
                format: 'js',
                idx: '0',
                n: String(ARCHIVE_SIZE),
                mkt: this.bot.accountLocale.locale
            }).toString()
            const response = await this.client.request<{ images?: { url?: unknown }[] }>({
                url: url.toString(),
                method: 'GET',
                headers: { Accept: 'application/json', Referer: URLs.bing.images }
            })
            const images = Array.isArray(response.data?.images) ? response.data.images : []
            const seeds = images.flatMap(image => {
                if (typeof image?.url !== 'string' || !image.url) return []
                try {
                    const seed = new URL(image.url, URLs.bing.origin)
                    return seed.protocol === 'https:' ? [seed.toString()] : []
                } catch {
                    return []
                }
            })
            const uniqueSeeds = [...new Set(seeds)]
            if (uniqueSeeds.length) {
                this.bot.utils.shuffleArray(uniqueSeeds)
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'VISUAL-SEARCH-BCID',
                    `Prepared ${uniqueSeeds.length} randomized Bing wallpaper seed(s) | transport=node-http`
                )
                return uniqueSeeds
            }
            this.bot.logger.debug(
                this.bot.isMobile,
                'VISUAL-SEARCH-BCID',
                `HPImageArchive returned no usable urls | status=${response.status} - using the static seed`
            )
        } catch (error) {
            this.bot.signal.throwIfAborted()
            if (isTerminalHttpError(error)) throw error
            this.bot.logger.debug(
                this.bot.isMobile,
                'VISUAL-SEARCH-BCID',
                `HPImageArchive lookup failed | ${error instanceof Error ? error.message : String(error)}` +
                    ' - using the static seed'
            )
        }

        return [STATIC_SEED_URL]
    }

    private parseRedirect(data: unknown): string | null {
        try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data
            const url = (parsed as { redirectUrl?: unknown })?.redirectUrl
            if (typeof url === 'string' && url.trim()) return url
        } catch {
            // Ignore
        }

        if (typeof data !== 'string') return null
        const raw = data.match(/"redirectUrl"\s*:\s*"((?:\\.|[^"\\])*)"/)?.[1]
        if (!raw) return null
        try {
            const url: unknown = JSON.parse(`"${raw}"`)
            return typeof url === 'string' && url.trim() ? url : null
        } catch {
            return null
        }
    }
}
