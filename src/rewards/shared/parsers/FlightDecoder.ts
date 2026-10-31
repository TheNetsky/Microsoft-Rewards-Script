import type { ParserContext } from './ParserContext'

export class FlightDecoder {
    constructor(private readonly bot: ParserContext) {}

    concatFlightChunks(html: string | readonly string[]): string {
        try {
            const pushRe = /self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.)*)"\]\)/g
            const pages = typeof html === 'string' ? [html] : html
            const perPage: string[] = []
            let combined = ''
            let count = 0

            for (const page of pages) {
                let pageChunks = 0
                const before = combined.length

                for (const match of page.matchAll(pushRe)) {
                    try {
                        // Re-wrap in quotes so JSON.parse decodes
                        combined += JSON.parse(`"${match[1]}"`)
                        count++
                        pageChunks++
                    } catch (err) {
                        this.bot.logger.debug(
                            this.bot.isMobile,
                            'REACT-PARSE',
                            `Skipped undecodable flight chunk | error=${err instanceof Error ? err.message : String(err)}`
                        )
                    }
                }

                if (pageChunks === 0 && /^\s*(?:[0-9a-f]+:|:HL\[)/i.test(page)) {
                    combined += page + '\n'
                    count++
                    pageChunks++
                } else if (pageChunks > 0) combined += '\n'
                perPage.push(`${pageChunks}c/${combined.length - before}b`)
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'REACT-PARSE',
                `Concatenated flight chunks | pages=${pages.length} | chunks=${count} | length=${combined.length} | perSource=[${perPage.join(', ')}]`
            )

            if (count === 0) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'REACT-PARSE',
                    'No __next_f flight chunks found - page may not be an RSC render or markup changed'
                )
            }

            return combined
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'REACT-PARSE',
                `Failed concatenating flight chunks | error=${error instanceof Error ? error.message : String(error)}`
            )
            return ''
        }
    }

    // Find every object containing "anchor" and return them as parsed JSON
    extractObjects(combined: string, anchor: string): Record<string, unknown>[] {
        const out: Record<string, unknown>[] = []
        const anchorKey = anchor.replace(/^"|"$/g, '')
        let cursor = 0
        let failures = 0

        while (cursor < combined.length) {
            const anchorIndex = combined.indexOf(anchor, cursor)
            if (anchorIndex === -1) break

            cursor = anchorIndex + anchor.length
            let start = combined.lastIndexOf('{', anchorIndex)
            let extracted = false

            while (start !== -1) {
                let depth = 0
                let end = -1
                let inStr = false
                let esc = false

                for (let j = start; j < combined.length; j++) {
                    const c = combined[j]
                    if (esc) {
                        esc = false
                        continue
                    }
                    if (inStr && c === '\\') {
                        esc = true
                        continue
                    }
                    if (c === '"') {
                        inStr = !inStr
                        continue
                    }
                    if (inStr) continue
                    if (c === '{') depth++
                    else if (c === '}') {
                        depth--
                        if (depth === 0) {
                            end = j
                            break
                        }
                    }
                }

                if (end >= anchorIndex) {
                    const raw = combined.slice(start, end + 1)

                    try {
                        const parsed = JSON.parse(raw.replace(/"\$undefined"/g, 'null')) as Record<string, unknown>
                        if (Object.prototype.hasOwnProperty.call(parsed, anchorKey)) {
                            out.push(parsed)
                            cursor = Math.max(cursor, end + 1)
                            extracted = true
                            break
                        }
                    } catch {
                        //Ignore
                    }
                }

                start = combined.lastIndexOf('{', start - 1)
            }

            if (!extracted) failures++
        }

        if (failures > 0) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'REACT-PARSE',
                `extractObjects("${anchor}") had ${failures} unparseable matches`
            )
        }

        return out
    }
}
