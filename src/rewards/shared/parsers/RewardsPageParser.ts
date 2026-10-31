import { isStreakCompleteToday, streakLabel } from '../Streaks'
import { pointValue } from '../PointAccounting'
import { accountReset } from '../AccountReset'
import type { ParserContext } from './ParserContext'
import { FlightDecoder } from './FlightDecoder'
import { ActionMetadata } from './ActionMetadata'
import { mergeAccountInfo, normalizeAccountInfo } from './NormalizeRewards'
import type { AccountInfo } from '../../types/RewardsState'
import { observePunchCard } from '../PunchCardProgress'

export interface ParsedOffer {
    offerId: string
    hash: string | null
    title: string
    description: string
    points: number
    pointProgress?: number | null
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
    title: string
    destination: string
    points: number
    pointProgress?: number | null
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
    completedSteps?: number | null
    totalSteps?: number | null
    pointProgress?: number | null
    pointProgressKnown?: boolean
    pointProgressMaxKnown?: boolean
}

export interface StreakState {
    partner: string
    resetAt: string | null
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

export type { AccountInfo as AccountState } from '../../types/RewardsState'

export interface PageSnapshot {
    offers: ParsedOffer[]
    reportable: ParsedOffer[]
    streaks: StreakState[]
    streakProtection: StreakProtectionState | null
    account: AccountInfo
}

export default class RewardsPageParser {
    private readonly flight: FlightDecoder
    private readonly actions: ActionMetadata

    constructor(private readonly bot: ParserContext) {
        this.flight = new FlightDecoder(bot)
        this.actions = new ActionMetadata(bot)
    }

    routerStateTree(segment: string): string {
        return this.actions.routerStateTree(segment)
    }

    questRouterStateTree(id: string): string {
        return this.actions.questRouterStateTree(id)
    }

    extractActionIds(js: string) {
        return this.actions.extractActionIds(js)
    }

    // Parse all available data from the provided pages into one snapshot
    snapshotPage(html: string | readonly string[]): PageSnapshot {
        const combined = this.flight.concatFlightChunks(html)

        const offers = this.parseOffers(combined)
        const reportable = offers.filter(offer => offer.reportable)
        const streaks = this.parseStreaks(combined)
        const streakProtection = this.parseStreakProtection(combined)
        const account = this.parseAccountData(combined)
        const accountEmail = this.bot.currentAccountEmail
        this.bot.observeStreaks?.(streaks)

        this.bot.logger.event(
            this.bot.isMobile,
            'REACT-PARSE',
            `Snapshot complete | offers=${offers.length} | reportable=${reportable.length} | streaks=${streaks.length}` +
                ` | streakProtectionEnabled=${streakProtection?.isProtectionOn ?? 'null'}` +
                ` | streakProtectionRemainingDays=${streakProtection?.remainingDays ?? 'null'}` +
                ` | streakCounter=${streakProtection?.streakCounter ?? 'null'} | level=${account.level}` +
                ` | account=${accountEmail ?? 'null'}`,
            {
                kind: 'account-info',
                ...account,
                ...accountReset(streaks, this.bot.userData?.timezone),
                streakProtection,
                streaks: streaks.map(streak => ({
                    partner: streak.partner,
                    label: streakLabel(streak),
                    completedToday: isStreakCompleteToday(streak),
                    completedDays: streak.completedDays,
                    currentDay: streak.currentDay,
                    totalDays: streak.totalDays,
                    isEnabled: streak.isEnabled,
                    dailyPoints: streak.dailyPoints,
                    activitiesCompleted: streak.activitiesCompleted,
                    activitiesTotal: streak.activitiesTotal,
                    resetAt: streak.resetAt
                }))
            }
        )

        return {
            offers,
            reportable,
            streaks,
            streakProtection,
            account
        }
    }

    getStreakProtection(html: string): StreakProtectionState | null {
        return this.parseStreakProtection(this.flight.concatFlightChunks(html))
    }

    buildId(html: string): string | null {
        const combined = this.flight.concatFlightChunks(html)
        return (
            html.match(/[?&](?:amp;)?dpl=([A-Za-z0-9._-]+)/i)?.[1] ??
            combined.match(/[?&](?:amp;)?dpl=([A-Za-z0-9._-]+)/i)?.[1] ??
            combined.match(/"buildId":"([A-Za-z0-9._-]+)"/)?.[1] ??
            combined.match(/"b":"([A-Za-z0-9._-]{8,})"/)?.[1] ??
            html.match(/\/_next\/static\/(?!chunks\/|css\/|media\/)([A-Za-z0-9._-]+)\//)?.[1] ??
            null
        )
    }

    availablePointsFromPayload(payload: unknown): number | null {
        if (typeof payload !== 'string') return null

        const normalized = payload.replace(/\\"/g, '"')
        const matches = [...normalized.matchAll(/"availablePoints"\s*:\s*(?:"(\d+)"|(\d+))(?=\s*[,}])/g)]
        const match = matches.at(-1)
        const value = Number(match?.[1] ?? match?.[2])

        return Number.isSafeInteger(value) && value >= 0 ? value : null
    }

    claimablePointsFromPayload(payload: string): number | null {
        const combined = payload.includes('self.__next_f.push') ? this.flight.concatFlightChunks(payload) : payload
        const amounts = this.flight.extractObjects(combined, '"pointClaim"').flatMap(carrier => {
            const claim = carrier.pointClaim as Record<string, unknown> | null
            const points = pointValue(claim?.points)
            return points !== null && Number.isSafeInteger(points) ? [points] : []
        })
        return amounts.at(-1) ?? null
    }

    // Section parsers
    private parseOffers(combined: string): ParsedOffer[] {
        try {
            const today = this.todayStamp()
            const offers = new Map<string, ParsedOffer>()

            for (const obj of this.flight.extractObjects(combined, '"offerId"')) {
                const offerId = obj.offerId as string | undefined
                if (!offerId) continue

                const hash = (obj.hash as string | null) ?? null
                const isCompleted = ((obj.isCompleted ?? obj.complete) as boolean | undefined) === true
                const date = this.normaliseDate(obj.date as string | undefined)
                const attributes =
                    obj.attributes && typeof obj.attributes === 'object'
                        ? (obj.attributes as Record<string, unknown>)
                        : null
                const isLocked = (obj.isLocked as boolean | undefined) === true
                const activityTypeValue =
                    obj.activityType ?? obj.activity_type ?? attributes?.activityType ?? attributes?.activity_type
                const parsedActivityType = Number(activityTypeValue)
                const promotionalValue = obj.isPromotional ?? attributes?.promotional
                const isPromotional =
                    promotionalValue === true ||
                    (typeof promotionalValue === 'string' && promotionalValue.toLowerCase() === 'true')

                const reportable = !!hash && !isCompleted && !isLocked && (date === null || date <= today)

                const candidate: ParsedOffer = {
                    offerId,
                    hash,
                    title: (obj.title as string) ?? '',
                    description: (obj.description as string) ?? '',
                    points: pointValue(obj.points ?? obj.pointProgressMax) ?? 0,
                    pointProgress: pointValue(obj.pointProgress ?? attributes?.pointprogress),
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
                existing.pointProgress ??= candidate.pointProgress
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
                `Parsed offers | total=${unique.length} | reportable=${unique.filter(o => o.reportable).length}`
            )
            this.bot.logger.debug(
                this.bot.isMobile,
                'REACT-PARSE',
                `Parsed offer ids | ${unique.map(o => `${o.offerId}${o.reportable ? '' : '(skip)'}`).join(', ') || 'none'}`
            )

            return unique
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'REACT-PARSE',
                `Failed parsing offers | error=${error instanceof Error ? error.message : String(error)}`
            )
            return []
        }
    }

    private parseStreaks(combined: string): StreakState[] {
        try {
            const resetTimes = new Map<string, string>()
            for (const carrier of this.flight.extractObjects(combined, '"expiresAt"')) {
                const streak = carrier.streak as Record<string, unknown> | undefined
                if (typeof streak?.partner !== 'string' || typeof carrier.expiresAt !== 'string') continue
                const timestamp = Date.parse(carrier.expiresAt.replace(/^\$D/, ''))
                if (Number.isFinite(timestamp)) resetTimes.set(streak.partner, new Date(timestamp).toISOString())
            }
            const streaks = this.flight
                .extractObjects(combined, '"dailyPoints"')
                .filter(o => typeof o.partner === 'string' && Array.isArray(o.dailyPoints))
                .map<StreakState>(o => ({
                    partner: o.partner as string,
                    resetAt: resetTimes.get(o.partner as string) ?? null,
                    activitiesCompleted: pointValue(o.activitiesCompleted) ?? 0,
                    activitiesTotal: pointValue(o.activitiesTotal) ?? 0,
                    completedDays: pointValue(o.completedDays) ?? 0,
                    currentDay: pointValue(o.currentDay) ?? 0,
                    totalDays: pointValue(o.totalDays) ?? 0,
                    isCurrentDayCompleted: (o.isCurrentDayCompleted as boolean | undefined) === true,
                    isEnabled: (o.isEnabled as boolean | undefined) === true,
                    dailyPoints: (o.dailyPoints as unknown[]).map(value => pointValue(value) ?? 0),
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
                `Parsed streaks | ${unique.map(s => `${s.partner}:${s.completedDays}/${s.totalDays}`).join(', ') || 'none'}`
            )

            return unique
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'REACT-PARSE',
                `Failed parsing streaks | error=${error instanceof Error ? error.message : String(error)}`
            )
            return []
        }
    }

    private parseStreakProtection(combined: string): StreakProtectionState | null {
        try {
            const carriers = this.flight.extractObjects(combined, '"isProtectionOn"').filter(o => 'isProtectionOn' in o)
            if (!carriers.length) return null

            // The flag and remainingDays
            const withDays = carriers.find(o => pointValue(o.remainingDays) !== null)
            const withFlag = carriers.find(o => typeof o.isProtectionOn === 'boolean')
            const withStreakCounter = carriers.find(o => pointValue(o.streakCounter) !== null)
            if (!withFlag) return null

            const state: StreakProtectionState = {
                isProtectionOn: withFlag.isProtectionOn === true,
                remainingDays: pointValue(withDays?.remainingDays),
                streakCounter: pointValue(withStreakCounter?.streakCounter)
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'REACT-PARSE',
                `Parsed streak protection | enabled=${state.isProtectionOn} | remainingDays=${state.remainingDays ?? 'null'} | streakCounter=${state.streakCounter}`
            )

            return state
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'REACT-PARSE',
                `Failed parsing streak protection | error=${error instanceof Error ? error.message : String(error)}`
            )
            return null
        }
    }

    private parseAccountData(combined: string): AccountInfo {
        const empty = normalizeAccountInfo(null)

        try {
            const membership = ['pointsProgress', 'pointsRemaining', 'lifetimeEarn', 'levelInfo', 'level'].flatMap(
                key => this.flight.extractObjects(combined, `"${key}"`)
            )

            for (const info of this.flight.extractObjects(combined, '"activeLevel"'))
                membership.push({ levelInfo: info })
            const account = mergeAccountInfo(...membership)

            for (const header of this.flight.extractObjects(combined, '"availablePoints"'))
                account.availablePoints = pointValue(header.availablePoints) ?? account.availablePoints

            this.bot.logger.debug(
                this.bot.isMobile,
                'REACT-PARSE',
                `Parsed account | level=${account.level} | available=${account.availablePoints} | toGo=${account.pointsRemaining} | lifetime=${account.lifetimeEarn}`
            )

            if (account.level === null && account.availablePoints === null) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'REACT-PARSE',
                    'Account state empty - membership/header objects not found in payload'
                )
            }

            return account
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'REACT-PARSE',
                `Failed parsing account | error=${error instanceof Error ? error.message : String(error)}`
            )
            return empty
        }
    }

    // Quest pages (punchcards)
    snapshotQuestPage(html: string, parent?: ParentQuest): QuestChild[] {
        try {
            const combined = this.flight.concatFlightChunks(html)
            const children = this.parseQuestOffers(combined)
            if (parent && children.length) {
                const current = this.flight
                    .extractObjects(combined, '"offerId"')
                    .find(obj => obj.offerId === parent.offerId)
                const attributes = current?.attributes as Record<string, unknown> | undefined
                const maximum = pointValue(current?.pointProgressMax ?? attributes?.pointmax)
                observePunchCard(
                    this.bot,
                    {
                        ...parent,
                        title: typeof current?.title === 'string' ? current.title : parent.title,
                        complete: current?.isCompleted === true || current?.complete === true || parent.complete,
                        completedSteps: null,
                        totalSteps: null,
                        pointProgress: pointValue(current?.pointProgress ?? attributes?.pointprogress),
                        pointProgressMax: maximum ?? parent.pointProgressMax,
                        pointProgressMaxKnown: maximum !== null || parent.pointProgressMaxKnown
                    },
                    children.map(child => ({ complete: child.isCompleted, locked: child.isLocked || child.isDisabled }))
                )
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'REACT-PARSE',
                `Quest snapshot | children=${children.length} | reportable=${children.filter(c => c.reportable).length}`
            )

            return children
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'REACT-PARSE',
                `Failed parsing quest page | error=${error instanceof Error ? error.message : String(error)}`
            )
            return []
        }
    }

    private parseQuestOffers(combined: string): QuestChild[] {
        const out: QuestChild[] = []
        const seen = new Set<string>()

        for (const obj of this.flight.extractObjects(combined, '"offerId"')) {
            const offerId = obj.offerId as string | undefined
            if (!offerId || !offerId.includes('pcchild') || seen.has(offerId)) continue
            seen.add(offerId)

            const hash = (obj.hash as string | null) ?? null
            const title = (obj.title as string) ?? ''
            const destination = (obj.destination as string) ?? (obj.destinationUrl as string) ?? ''
            const points = pointValue(obj.points ?? obj.pointProgressMax) ?? 0
            const isCompleted = ((obj.isCompleted ?? obj.complete) as boolean | undefined) === true
            const isLocked = obj.isLocked === true
            const isDisabled = (obj.isDisabled as boolean | undefined) === true

            const reportable = !!hash && !isCompleted && !isLocked && !isDisabled

            out.push({
                offerId,
                hash,
                title,
                destination,
                points,
                pointProgress: pointValue(
                    obj.pointProgress ?? (obj.attributes as Record<string, unknown> | undefined)?.pointprogress
                ),
                isCompleted,
                isLocked,
                isDisabled,
                reportable
            })
        }

        this.bot.logger.debug(
            this.bot.isMobile,
            'REACT-PARSE',
            `Parsed quest children | total=${out.length} | reportable=${out.filter(c => c.reportable).length}`
        )

        return out
    }

    snapshotQuestList(...htmls: string[]): ParentQuest[] {
        try {
            const combined = htmls.map(h => this.flight.concatFlightChunks(h)).join('')

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
                    complete: prev?.complete || complete,
                    completedSteps: taskM ? Number(taskM[1]) : (prev?.completedSteps ?? null),
                    totalSteps: taskM ? Number(taskM[2]) : (prev?.totalSteps ?? null),
                    pointProgressMaxKnown: prev?.pointProgressMaxKnown || Boolean(pointsMatch)
                })
            }

            const out = [...byId.values()]
            this.bot.logger.debug(
                this.bot.isMobile,
                'REACT-PARSE',
                `Quest list | parents=${out.length} | incomplete=${out.filter(q => !q.complete).length}`
            )
            this.bot.logger.debug(
                this.bot.isMobile,
                'REACT-PARSE',
                `Quest points | ${out.map(q => `${q.title || q.offerId}=${q.pointProgressMax}`).join(' | ') || 'none'}`
            )
            if (!out.length) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'REACT-PARSE',
                    'No parent quests parsed - the fetched HTML may be missing the QuestSection chunks (Suspense/streaming or a login redirect)'
                )
            }
            return out
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'REACT-PARSE',
                `Failed parsing quest list | error=${error instanceof Error ? error.message : String(error)}`
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
