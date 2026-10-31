import type { ParserContext } from './ParserContext'

export class ActionMetadata {
    constructor(private readonly bot: ParserContext) {}

    routerStateTree(segment: string): string {
        const tree = [
            '',
            {
                children: [
                    '(nav)',
                    {
                        children: [segment, { children: ['__PAGE__', {}, null, null, 0] }, null, null, 0]
                    },
                    null,
                    null,
                    0
                ]
            },
            null,
            null,
            16
        ]
        return encodeURIComponent(JSON.stringify(tree))
    }

    questRouterStateTree(questId: string): string {
        const tree = [
            '',
            {
                children: [
                    '(nav)',
                    {
                        children: [
                            'earn',
                            {
                                children: [
                                    'quest',
                                    {
                                        children: [
                                            ['questId', questId, 'd', null],
                                            { children: ['__PAGE__', {}, null, null, 0] },
                                            null,
                                            null,
                                            0
                                        ]
                                    },
                                    null,
                                    null,
                                    0
                                ]
                            },
                            null,
                            null,
                            0
                        ]
                    },
                    null,
                    null,
                    0
                ]
            },
            null,
            null,
            16
        ]
        return encodeURIComponent(JSON.stringify(tree))
    }

    // Pull server-action ids out of a JS chunk
    extractActionIds(jsText: string): {
        byName: Record<string, string>
        all: string[]
    } {
        const byName: Record<string, string> = {}
        const all = new Set<string>()

        // SHA-1 today (40 hex), allow growth to SHA-256 (64 hex)
        const HEX = '[a-f0-9]{40,64}'

        // Framework args that share the call shape but aren't the action name
        const KNOWN_NON_NAMES = new Set(['callServer', 'findSourceMapURL', 'encodeFormAction', 'default'])

        try {
            // Support for both formats: (createServerReference)(id) and createServerReference(id)
            // The argument search window has been expanded to 800 characters for Turbopack
            const createRegex = new RegExp(
                `createServerReference\\s*\\)?\\s*\\(\\s*"(${HEX})"([\\s\\S]{0,800}?)\\)`,
                'g'
            )
            const registerRegex = new RegExp(
                `registerServerReference\\s*\\)?\\s*\\([^,]+,\\s*"(${HEX})"([\\s\\S]{0,800}?)\\)`,
                'g'
            )

            const strLitRe = /"([A-Za-z_$][\w$]*)"/g

            const processMatches = (matches: IterableIterator<RegExpMatchArray>) => {
                for (const m of matches) {
                    const id = m[1]!
                    const argsBlock = m[2] ?? ''
                    all.add(id)

                    const candidates = [...argsBlock.matchAll(strLitRe)]
                        .map(x => x[1]!)
                        .filter(n => !KNOWN_NON_NAMES.has(n) && n.length > 3)

                    if (candidates.length) {
                        byName[candidates[candidates.length - 1]!] = id
                    }
                }
            }

            processMatches(jsText.matchAll(createRegex))
            processMatches(jsText.matchAll(registerRegex))

            const bareCreateRegex = new RegExp(`createServerReference\\s*\\)?\\s*\\(\\s*"(${HEX})"`, 'g')
            const bareRegisterRegex = new RegExp(`registerServerReference\\s*\\)?\\s*\\([^,]+,\\s*"(${HEX})"`, 'g')

            for (const m of jsText.matchAll(bareCreateRegex)) all.add(m[1]!)
            for (const m of jsText.matchAll(bareRegisterRegex)) all.add(m[1]!)

            const actionIdRe = new RegExp(`\\$ACTION_ID_(${HEX})`, 'g')
            for (const m of jsText.matchAll(actionIdRe)) all.add(m[1]!)

            this.bot.logger.debug(
                this.bot.isMobile,
                'REACT-PARSE',
                `Extracted action ids | named=${Object.keys(byName).length} | total=${all.size}`
            )
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'REACT-PARSE',
                `Failed extracting action ids | error=${error instanceof Error ? error.message : String(error)}`
            )
        }

        return { byName, all: [...all] }
    }
}
