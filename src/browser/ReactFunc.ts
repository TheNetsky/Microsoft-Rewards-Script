import type { MicrosoftRewardsBot } from '../index'

export interface ParsedOffer {
    offerId: string
    hash: string | null
    title: string
    description: string
    points: number
    promotionSubtype: string | null
    destination: string
    isCompleted: boolean
    isPromotional: boolean
    isLocked: boolean
    unlockCriteria: string | null
    date: string | null
    activityType: number | null
    reportable: boolean
}

export interface QuestChild {
    offerId: string
    hash: string | null
    points: number
    isCompleted: boolean
    isLocked: boolean
    isDisabled: boolean
    reportable: boolean
}

export interface ParentQuest {
    offerId: string
    title: string
    pointProgressMax: number
    complete: boolean
}

export interface StreakState {
    partner: string
    activitiesCompleted: number
    activitiesTotal: number
    completedDays: number
    currentDay: number
    totalDays: number
    isCurrentDayCompleted: boolean
    isEnabled: boolean
    dailyPoints: number[]
    activationOfferId: string | null
    activationHash: string | null
    activationActivityType: number | null
    destinationUrl: string | null
}

export interface StreakProtectionState {
    isProtectionOn: boolean
    remainingDays: number | null
    streakCounter: number | null
}

export interface AccountState {
    level: number | null
    pointsProgress: number | null
    pointsRemaining: number | null
    lifetimeEarn: number | null
    availablePoints: number | null
}

export interface PageSnapshot {
    offers: ParsedOffer[]
    reportable: ParsedOffer[]
    streaks: StreakState[]
    streakProtection: StreakProtectionState | null
    account: AccountState
}

export default class ReactFunc {
    private bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    // Parse all available data from the provided pages into one snapshot
    public snapshotPage(html: string | readonly string[]): PageSnapshot {
        const combined = this.concatFlightChunks(html)

        const offers = this.parseOffers(combined)
        const streaks = this.parseStreaks(combined)
        const streakProtection = this.parseStreakProtection(combined)
        const account = this.parseAccountData(combined)
        const accountEmail = this.bot.currentAccountEmail

        this.bot.logger.info(
            this.bot.isMobile,
            'REACT-PARSE',
            `快照完成 | offers=${offers.length} | 可上报=${offers.filter(o => o.reportable).length} | streaks=${streaks.length} | 连续保护已启用=${streakProtection?.isProtectionOn ?? 'null'} | 连续保护剩余天数=${streakProtection?.remainingDays ?? 'null'} | 连续计数=${streakProtection?.streakCounter ?? 'null'} | 等级=${account.level} | 账户=${accountEmail ?? 'null'}`
        )

        return {
            offers,
            reportable: offers.filter(o => o.reportable),
            streaks,
            streakProtection,
            account
        }
    }
    public getStreakProtection(html: string): StreakProtectionState | null {
        return this.parseStreakProtection(this.concatFlightChunks(html))
    }

    public buildId(html: string): string | null {
        const combined = this.concatFlightChunks(html)
        return (
            html.match(/[?&](?:amp;)?dpl=([A-Za-z0-9._-]+)/i)?.[1] ??
            combined.match(/[?&](?:amp;)?dpl=([A-Za-z0-9._-]+)/i)?.[1] ??
            combined.match(/"buildId":"([A-Za-z0-9._-]+)"/)?.[1] ??
            combined.match(/"b":"([A-Za-z0-9._-]{8,})"/)?.[1] ??
            html.match(/\/_next\/static\/([A-Za-z0-9._-]+)\//)?.[1] ??
            null
        )
    }

    public availablePointsFromPayload(payload: unknown): number | null {
        if (typeof payload !== 'string') return null

        const normalized = payload.replace(/\\"/g, '"')
        const matches = [...normalized.matchAll(/"availablePoints"\s*:\s*(\d+)/g)]
        const value = Number(matches.at(-1)?.[1])

        return Number.isSafeInteger(value) && value >= 0 ? value : null
    }

    private concatFlightChunks(html: string | readonly string[]): string {
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
                            `跳过无法解码的 flight 代码块 | 错误=${err instanceof Error ? err.message : String(err)}`
                        )
                    }
                }

                if (pageChunks > 0) combined += '\n'
                perPage.push(`${pageChunks}c/${combined.length - before}b`)
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'REACT-PARSE',
                `已拼接 flight 代码块 | 页面数=${pages.length} | 代码块=${count} | 长度=${combined.length} | 每来源=[${perPage.join(', ')}]`
            )

            if (count === 0) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'REACT-PARSE',
                    '未找到 __next_f flight 代码块 - 页面可能不是 RSC 渲染或标记已变化'
                )
            }

            return combined
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'REACT-PARSE',
                `拼接 flight 代码块失败 | 错误=${error instanceof Error ? error.message : String(error)}`
            )
            return ''
        }
    }

    // Find every object containing "anchor" and return them as parsed JSON
    private extractObjects(combined: string, anchor: string): Record<string, unknown>[] {
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
                    } catch {}
                }

                start = combined.lastIndexOf('{', start - 1)
            }

            if (!extracted) failures++
        }

        if (failures > 0) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'REACT-PARSE',
                `extractObjects("${anchor}") 有 ${failures} 个无法解析的匹配`
            )
        }

        return out
    }

    // Section parsers
    private parseOffers(combined: string): ParsedOffer[] {
        try {
            const today = this.todayStamp()
            const offers = new Map<string, ParsedOffer>()

            for (const obj of this.extractObjects(combined, '"offerId"')) {
                const offerId = obj.offerId as string | undefined
                if (!offerId) continue

                const hash = (obj.hash as string | null) ?? null
                const isCompleted = ((obj.isCompleted ?? obj.complete) as boolean | undefined) === true
                const isLocked = (obj.isLocked as boolean | undefined) === true
                const date = this.normaliseDate(obj.date as string | undefined)
                const attributes =
                    obj.attributes && typeof obj.attributes === 'object'
                        ? (obj.attributes as Record<string, unknown>)
                        : null
                const activityTypeValue =
                    obj.activityType ?? obj.activity_type ?? attributes?.activityType ?? attributes?.activity_type
                const parsedActivityType = Number(activityTypeValue)
                const promotionalValue = obj.isPromotional ?? attributes?.promotional
                const isPromotional =
                    promotionalValue === true ||
                    (typeof promotionalValue === 'string' && promotionalValue.toLowerCase() === 'true')

                // Never try future-dated offers, lol
                const reportable = !!hash && !isCompleted && !isLocked && (date === null || date <= today)

                const candidate: ParsedOffer = {
                    offerId,
                    hash,
                    title: (obj.title as string) ?? '',
                    description: (obj.description as string) ?? '',
                    points: (obj.points as number) ?? (obj.pointProgressMax as number) ?? 0,
                    promotionSubtype: (obj.promotionSubtype as string | null) ?? null,
                    destination: (obj.destination as string) ?? (obj.destinationUrl as string) ?? '',
                    isCompleted,
                    isPromotional,
                    isLocked,
                    unlockCriteria: (obj.unlockCriteria as string | null) ?? null,
                    date,
                    activityType:
                        Number.isInteger(parsedActivityType) && parsedActivityType > 0 ? parsedActivityType : null,
                    reportable
                }

                const existing = offers.get(offerId)
                if (!existing) {
                    offers.set(offerId, candidate)
                    continue
                }

                existing.hash ??= candidate.hash
                existing.title ||= candidate.title
                existing.description ||= candidate.description
                existing.points ||= candidate.points
                existing.promotionSubtype ??= candidate.promotionSubtype
                existing.destination ||= candidate.destination
                existing.isCompleted ||= candidate.isCompleted
                existing.isPromotional ||= candidate.isPromotional
                existing.isLocked ||= candidate.isLocked
                existing.unlockCriteria ??= candidate.unlockCriteria
                existing.date ??= candidate.date
                existing.activityType ??= candidate.activityType
                existing.reportable =
                    !!existing.hash &&
                    !existing.isCompleted &&
                    !existing.isLocked &&
                    (existing.date === null || existing.date <= today)
            }

            const unique = [...offers.values()]

            this.bot.logger.debug(
                this.bot.isMobile,
                'REACT-PARSE',
                `已解析 offers | 总数=${unique.length} | 可上报=${unique.filter(o => o.reportable).length}`
            )
            this.bot.logger.debug(
                this.bot.isMobile,
                'REACT-PARSE',
                `已解析 offer id | ${unique.map(o => `${o.offerId}${o.reportable ? '' : '(跳过)'}`).join(', ') || '无'}`
            )

            return unique
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'REACT-PARSE',
                `解析 offers 失败 | 错误=${error instanceof Error ? error.message : String(error)}`
            )
            return []
        }
    }

    private parseStreaks(combined: string): StreakState[] {
        try {
            const streaks = this.extractObjects(combined, '"dailyPoints"')
                .filter(o => typeof o.partner === 'string' && Array.isArray(o.dailyPoints))
                .map<StreakState>(o => ({
                    partner: o.partner as string,
                    activitiesCompleted: (o.activitiesCompleted as number) ?? 0,
                    activitiesTotal: (o.activitiesTotal as number) ?? 0,
                    completedDays: (o.completedDays as number) ?? 0,
                    currentDay: (o.currentDay as number) ?? 0,
                    totalDays: (o.totalDays as number) ?? 0,
                    isCurrentDayCompleted: (o.isCurrentDayCompleted as boolean | undefined) === true,
                    isEnabled: (o.isEnabled as boolean | undefined) === true,
                    dailyPoints: o.dailyPoints as number[],
                    activationOfferId:
                        typeof o.activationOfferId === 'string' && o.activationOfferId !== '$undefined'
                            ? o.activationOfferId
                            : null,
                    activationHash:
                        typeof o.activationHash === 'string' && o.activationHash !== '$undefined'
                            ? o.activationHash
                            : null,
                    activationActivityType: (() => {
                        const parsed = Number(o.activationActivityType)
                        return Number.isInteger(parsed) && parsed > 0 ? parsed : null
                    })(),
                    destinationUrl:
                        typeof o.destinationUrl === 'string' && o.destinationUrl !== '$undefined'
                            ? o.destinationUrl
                            : null
                }))

            // de-dupe on partner
            const byPartner = new Map(streaks.map(s => [s.partner, s]))
            const unique = [...byPartner.values()]

            this.bot.logger.debug(
                this.bot.isMobile,
                'REACT-PARSE',
                `已解析 streaks | ${unique.map(s => `${s.partner}:${s.completedDays}/${s.totalDays}`).join(', ') || '无'}`
            )

            return unique
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'REACT-PARSE',
                `解析 streaks 失败 | 错误=${error instanceof Error ? error.message : String(error)}`
            )
            return []
        }
    }

    private parseStreakProtection(combined: string): StreakProtectionState | null {
        try {
            const carriers = this.extractObjects(combined, '"isProtectionOn"').filter(o => 'isProtectionOn' in o)
            if (!carriers.length) return null

            // The flag and remainingDays
            const withDays = carriers.find(o => 'remainingDays' in o && typeof o.remainingDays === 'number')
            const withFlag = carriers.find(o => typeof o.isProtectionOn === 'boolean')
            const withStreakCounter = carriers.find(o => 'streakCounter' in o && typeof o.streakCounter === 'number')

            const state: StreakProtectionState = {
                isProtectionOn: (withDays?.isProtectionOn ?? withFlag?.isProtectionOn) === true,
                remainingDays: withDays ? (withDays.remainingDays as number) : null,
                streakCounter: withStreakCounter ? (withStreakCounter.streakCounter as number) : null
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'REACT-PARSE',
                `已解析连续保护 | 已启用=${state.isProtectionOn} | 剩余天数=${state.remainingDays ?? 'null'} | 连续计数=${state.streakCounter}`
            )

            return state
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'REACT-PARSE',
                `解析连续保护失败 | 错误=${error instanceof Error ? error.message : String(error)}`
            )
            return null
        }
    }

    private parseAccountData(combined: string): AccountState {
        const empty: AccountState = {
            level: null,
            pointsProgress: null,
            pointsRemaining: null,
            lifetimeEarn: null,
            availablePoints: null
        }

        try {
            const membership =
                this.extractObjects(combined, '"pointsProgress"').find(
                    o => 'pointsRemaining' in o || 'lifetimeEarn' in o
                ) ?? {}

            // availablePoints renders in a separate header object
            const header = this.extractObjects(combined, '"availablePoints"').find(o => 'availablePoints' in o) ?? {}

            const account: AccountState = {
                level: (membership.level as number) ?? null,
                pointsProgress: (membership.pointsProgress as number) ?? null,
                pointsRemaining: (membership.pointsRemaining as number) ?? null,
                lifetimeEarn: (membership.lifetimeEarn as number) ?? null,
                availablePoints: (header.availablePoints as number) ?? (membership.availablePoints as number) ?? null
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'REACT-PARSE',
                `已解析账户 | 等级=${account.level} | 可用积分=${account.availablePoints} | 还差=${account.pointsRemaining} | 累计=${account.lifetimeEarn}`
            )

            if (account.level === null && account.availablePoints === null) {
                // Common error! Keep however for debugging!
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'REACT-PARSE',
                    '账户状态为空 - 载荷中未找到 membership/header 对象'
                )
            }

            return account
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'REACT-PARSE',
                `解析账户失败 | 错误=${error instanceof Error ? error.message : String(error)}`
            )
            return empty
        }
    }

    public routerStateTree(segment: string): string {
        const refreshFlag = 4096
        const tree = [
            '',
            {
                children: [
                    '(nav)',
                    {
                        children: [
                            segment,
                            { children: ['PAGE', {}, null, null, refreshFlag] },
                            null,
                            null,
                            refreshFlag
                        ]
                    },
                    null,
                    null,
                    refreshFlag
                ]
            },
            null,
            null,
            refreshFlag + 16
        ]
        return encodeURIComponent(JSON.stringify(tree))
    }

    public questRouterStateTree(questId: string): string {
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
    public extractActionIds(jsText: string): {
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
                `已提取 action id | 具名=${Object.keys(byName).length} | 总数=${all.size}`
            )
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'REACT-PARSE',
                `提取 action id 失败 | 错误=${error instanceof Error ? error.message : String(error)}`
            )
        }

        return { byName, all: [...all] }
    }

    // Quest pages (punchcards)
    public snapshotQuestPage(html: string): QuestChild[] {
        try {
            const combined = this.concatFlightChunks(html)
            const children = this.parseQuestOffers(combined)

            this.bot.logger.info(
                this.bot.isMobile,
                'REACT-PARSE',
                `任务快照 | 子项=${children.length} | 可上报=${children.filter(c => c.reportable).length}`
            )

            return children
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'REACT-PARSE',
                `解析任务页失败 | 错误=${error instanceof Error ? error.message : String(error)}`
            )
            return []
        }
    }

    private parseQuestOffers(combined: string): QuestChild[] {
        const out: QuestChild[] = []
        const seen = new Set<string>()

        for (const obj of this.extractObjects(combined, '"offerId"')) {
            const offerId = obj.offerId as string | undefined
            if (!offerId || !offerId.includes('pcchild') || seen.has(offerId)) continue
            seen.add(offerId)

            const hash = (obj.hash as string | null) ?? null
            const points = (obj.points as number) ?? (obj.pointProgressMax as number) ?? 0
            const isCompleted = ((obj.isCompleted ?? obj.complete) as boolean | undefined) === true
            const isLocked = (obj.isLocked as boolean | undefined) === true
            const isDisabled = (obj.isDisabled as boolean | undefined) === true

            const reportable = !!hash && !isCompleted && !isLocked && !isDisabled

            out.push({
                offerId,
                hash,
                points,
                isCompleted,
                isLocked,
                isDisabled,
                reportable
            })
        }

        this.bot.logger.debug(
            this.bot.isMobile,
            'REACT-PARSE',
            `已解析任务子项 | 总数=${out.length} | 可上报=${out.filter(c => c.reportable).length}`
        )

        return out
    }

    public snapshotQuestList(...htmls: string[]): ParentQuest[] {
        try {
            const combined = htmls.map(h => this.concatFlightChunks(h)).join('')

            const anchors: { id: string; at: number }[] = []
            for (const match of combined.matchAll(/\/earn\/quest\/([A-Za-z0-9_]+)/g)) {
                anchors.push({ id: match[1] as string, at: match.index ?? 0 })
            }
            for (const match of combined.matchAll(/"id":"quest_([A-Za-z0-9_]+)"/g)) {
                anchors.push({ id: match[1] as string, at: match.index ?? 0 })
            }
            for (const match of combined.matchAll(/[A-Za-z0-9_]*pcparent[A-Za-z0-9_]*/gi)) {
                anchors.push({ id: match[0] as string, at: match.index ?? 0 })
            }
            anchors.sort((a, b) => a.at - b.at)

            const byId = new Map<string, ParentQuest>()
            for (let k = 0; k < anchors.length; k++) {
                const { id, at } = anchors[k]!
                if (!this.isParentQuestId(id)) continue

                const next = anchors[k + 1]?.at ?? combined.length
                const region = combined.slice(at, Math.min(next, at + 3000))

                const title =
                    region.match(/"alt":"((?:[^"\\]|\\.)*)"/)?.[1] ??
                    region.match(/"title":"((?:[^"\\]|\\.)*)"/)?.[1] ??
                    ''

                const pointsMatch = region.match(/\["\+","([\d,]+)"\]/)
                const points = pointsMatch ? Number(pointsMatch[1]!.replace(/,/g, '')) : 0
                const taskM = region.match(/(\d+)\s*\/\s*(\d+)\s*tasks/)
                const complete = !!taskM && Number(taskM[1]) >= Number(taskM[2]!) && Number(taskM[2]) > 0

                // First wins for title/points
                const prev = byId.get(id)
                byId.set(id, {
                    offerId: id,
                    title: prev?.title || title,
                    pointProgressMax: prev?.pointProgressMax || points,
                    complete: prev?.complete || complete
                })
            }

            const out = [...byId.values()]
            this.bot.logger.info(
                this.bot.isMobile,
                'REACT-PARSE',
                `任务列表 | 父任务=${out.length} | 未完成=${out.filter(q => !q.complete).length}`
            )
            this.bot.logger.debug(
                this.bot.isMobile,
                'REACT-PARSE',
                `任务积分 | ${out.map(q => `${q.title || q.offerId}=${q.pointProgressMax}`).join(' | ') || '无'}`
            )
            if (!out.length) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'REACT-PARSE',
                    '未解析到父任务 - 抓取的 HTML 可能缺少 QuestSection 代码块（Suspense/流式渲染或登录重定向）'
                )
            }
            return out
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'REACT-PARSE',
                `解析任务列表失败 | 错误=${error instanceof Error ? error.message : String(error)}`
            )
            return []
        }
    }

    // <campaign>_pcparent_<name>_punchcard
    private isParentQuestId(offerId: string): boolean {
        const id = offerId.toLowerCase()
        if (id.includes('pcchild')) return false
        return id.includes('pcparent') || id.includes('punchcard')
    }

    // Utils
    private todayStamp(): string {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }

    private normaliseDate(rawDate: string | undefined): string | null {
        if (!rawDate) return null
        const m = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
        if (!m) return null
        return `${m[3]}-${m[1]}-${m[2]}`
    }
}
