import type { Page } from 'patchright'
import type { BotContext } from '../../../core/BotContext'
import { URLs } from '../../../constants/urls'
import { browserTimeout } from '../../../browser/BrowserTiming'
import { HttpError, isTerminalHttpError } from '../../../network/HttpError'

const MAX_CHUNKS = 96
const MAX_BYTES = 16 * 1024 * 1024
const CHUNK_BYTES = 4 * 1024 * 1024
const CONCURRENCY = 4
const cache = new Map<string, { actions: Record<string, string>; complete: boolean }>()

export class ActionDiscovery {
    constructor(
        private readonly bot: Pick<
            BotContext,
            'signal' | 'pageParser' | 'requestClient' | 'mode' | 'config' | 'utils' | 'logger' | 'isMobile'
        >
    ) {}

    invalidate(buildId: string): void {
        cache.delete(buildId)
    }

    async resolve(
        page: Page | undefined,
        htmls: string[],
        required?: string | readonly string[]
    ): Promise<Record<string, string>> {
        const names = typeof required === 'string' ? [required] : (required ?? [])
        const hasRequired = (actions: Record<string, string>) => names.some(name => Boolean(actions[name]))
        const build = htmls.map(html => this.bot.pageParser.buildId(html)).find(Boolean) ?? ''
        const cached = build ? cache.get(build) : undefined
        if (cached && (required ? hasRequired(cached.actions) : cached.complete)) return { ...cached.actions }
        const result = { ...cached?.actions }
        const queue = new Set<string>()
        const chunks = /(?:\/_next\/)?(static\/(?:chunks|immutable|media)\/[\w\-./()]+?\.js)/g
        for (const html of htmls) for (const match of html.matchAll(chunks)) queue.add('/_next/' + match[1]!)
        const visited = new Set<string>()
        let bytes = 0
        let reserved = 0
        const deadline = Date.now() + browserTimeout(this.bot)
        let bounded = false
        let unavailable = 0
        for (let depth = 0; depth <= (required ? 3 : 1) && queue.size; depth++) {
            const paths = [...queue]
            queue.clear()
            let cursor = 0
            const worker = async (): Promise<void> => {
                while (cursor < paths.length && !(required && hasRequired(result))) {
                    this.bot.signal.throwIfAborted()
                    if (visited.size >= MAX_CHUNKS || bytes >= MAX_BYTES || Date.now() >= deadline) {
                        bounded = true
                        return
                    }
                    const path = paths[cursor++]!
                    if (visited.has(path)) continue
                    visited.add(path)
                    const allowance = Math.min(CHUNK_BYTES, MAX_BYTES - bytes - reserved)
                    if (allowance <= 0) {
                        bounded = true
                        return
                    }
                    reserved += allowance
                    try {
                        const response = await this.bot.requestClient.request<string>(
                            {
                                url: URLs.rewards.path(path),
                                method: 'GET',
                                headers: {},
                                responseType: 'text',
                                allowNodeFallback: this.bot.mode.allowClosedBrowserHttp,
                                timeout: Math.max(1, deadline - Date.now()),
                                maxResponseBytes: allowance
                            },
                            page
                        )
                        if (response.status < 200 || response.status >= 300)
                            throw new HttpError(response.status, response)
                        bytes += Buffer.byteLength(response.data)
                        if (bytes > MAX_BYTES) {
                            bounded = true
                            return
                        }
                        Object.assign(result, this.bot.pageParser.extractActionIds(response.data).byName)
                        for (const child of this.dynamicPaths(response.data)) if (!visited.has(child)) queue.add(child)
                    } catch (error) {
                        this.bot.signal.throwIfAborted()
                        if (isTerminalHttpError(error)) throw error
                        unavailable++
                        this.bot.logger.debug(
                            this.bot.isMobile,
                            'ACTION-DISCOVERY',
                            `Chunk unavailable | path=${path} | ${error instanceof Error ? error.message : String(error)}`
                        )
                    } finally {
                        reserved -= allowance
                    }
                }
            }
            const workers = await Promise.allSettled(
                Array.from({ length: Math.min(CONCURRENCY, paths.length) }, worker)
            )
            const failure = workers.find(item => item.status === 'rejected')
            if (failure?.status === 'rejected') throw failure.reason
            if (bounded || (required && hasRequired(result))) break
        }
        const complete = !required && !bounded && unavailable === 0 && ![...queue].some(path => !visited.has(path))
        if (build && Object.keys(result).length) {
            cache.delete(build)
            cache.set(build, { actions: { ...result }, complete })
            if (cache.size > 8) cache.delete(cache.keys().next().value!)
        }
        this.bot.logger.debug(
            this.bot.isMobile,
            'ACTION-DISCOVERY',
            `Discovery finished | build=${build || 'unknown'} | chunks=${visited.size} | bytes=${bytes}` +
                ` | bounded=${bounded} | unavailable=${unavailable} | complete=${complete} | actions=${Object.keys(result).length}`
        )
        return result
    }

    private dynamicPaths(js: string): string[] {
        const paths = new Set<string>()
        const builder = /static\/chunks\/"\s*\+\s*\w+\s*\+\s*"([-.])"\s*\+\s*\{([\s\S]*?)\}\s*\[/g
        for (const match of js.matchAll(builder))
            for (const [, id, hash] of match[2]!.matchAll(/(\d+)\s*:\s*"([a-f0-9]+)"/g))
                paths.add(`/_next/static/chunks/${id}${match[1]}${hash}.js`)
        for (const [, id, hash] of js.matchAll(/\b(\d{2,6}):"([a-f0-9]{12,})"/g)) {
            paths.add(`/_next/static/chunks/${id}-${hash}.js`)
            paths.add(`/_next/static/chunks/${id}.${hash}.js`)
        }
        for (const match of js.matchAll(/(?:\/_next\/)?(static\/(?:immutable|chunks|media)\/[\w\-./()]+?\.js)/g))
            paths.add(`/_next/${match[1]}`)
        return [...paths]
    }
}
