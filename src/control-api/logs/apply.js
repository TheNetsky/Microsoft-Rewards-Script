import { applyDomainEvent, isDomainEvent } from './domainEvents.js'
import { ensureAccount, accountEmailForEntry, eventTime } from './state.js'
import { numericField, jsonStringField } from './fields.js'
import { applyEdgeBrowsing } from './edgeProgress.js'
import { normalizeAccountLevel } from '../../rewards/shared/parsers/NormalizeRewards.js'

const RE = {
    runStart: /^Starting Microsoft Rewards Script \| v(\S+) \| Accounts: (\d+) \| Clusters: (\d+)/,
    accountStart:
        /^Starting account: (\S+) \| geoLocale: ([^|]+?)(?: \| locale: (\S+))?(?: \| cachedRegion: (\S+))?\s*$/,
    earnable:
        /^Earnable today \| Mobile: (\d+|unknown|null) \| Browser: (\d+|unknown|null) \| App: (\d+|unknown|null|pending mobile sign-in|pending app data|unavailable|disabled) \| (\S+) \| locale: (\S+)\s*$/,
    searchSummary:
        /^Search summary \| mobile=(-?\d+(?:\.\d+)?|unknown) \| desktop=(-?\d+(?:\.\d+)?|unknown) \| bonus=(-?\d+(?:\.\d+)?|unknown)(?: \| apiReport=(-?\d+(?:\.\d+)?|unknown))? \| total=(-?\d+(?:\.\d+)?|unknown)(?= \| |$)/,
    streakProtection:
        /^Snapshot complete \| offers=(\d+) \| reportable=(\d+) \| streaks=(\d+) \| streakProtectionEnabled=(true|false|null) \| streakProtectionRemainingDays=(\d+|null) \| streakCounter=(\d+|null) \| level=([^|]+) \| account=(\S+@\S+)$/,
    accountEnd:
        /^(?:Completed|Finished) account: (\S+) \| pointsGained=(-?\d+(?:\.\d+)?|unknown) \| previousBalance=(\d+(?:\.\d+)?) \| currentBalance=(\d+(?:\.\d+)?) \| durationSeconds=(\d+(?:\.\d+)?)(?= \| |$)/,
    runEnd: /^(?:Completed all accounts|Run interrupted) \| accountsProcessed=(\d+) \| pointsGained=(-?\d+(?:\.\d+)?|unknown) \| previousBalance=(\d+(?:\.\d+)?) \| currentBalance=(\d+(?:\.\d+)?) \| runtimeMinutes=(\d+(?:\.\d+)?)(?= \| |$)/,
    accountError: /^(\S+@\S+): ([\s\S]+)$/,
    flowFailed: /flow failed for (\S+@\S+):/i,
    accountDelay: /^Waiting ([\d.]+) seconds before starting the next account(?: \((\S+@\S+)\))?(?: \| waitMs=(\d+))?$/,

    searchStart: /^Starting Bing searches \| currentBalance=(\d+)/,
    flowCollected: /^Points collected \| pointsGained=(-?\d+|unknown) \| currentBalance=(\d+) \| account=(\S+@\S+)/
}

function pointEventSource(title, message) {
    switch (title) {
        case 'SEARCH-BING':
            return /^(?:batch )?pointsGained=/.test(message) ? 'search' : null
        case 'SEARCH-BONUS':
            return /^(?:batch )?pointsGained=/.test(message) ? 'bonus' : null
        case 'READ-TO-EARN':
            return message.startsWith('Read article ') || message.startsWith('No points gained,') ? 'read' : null
        case 'DAILY-CHECK-IN':
            return message.startsWith('Completed Daily Check-In ') || message.startsWith('Daily Check-In completed ')
                ? 'checkIn'
                : null
        case 'CLAIM-BONUS-POINTS':
            return message.startsWith('Completed ClaimBonusPoints ') || message.startsWith('Nothing claimed ')
                ? 'claimBonus'
                : null
        case 'CLAIM-BONUS-POINTS-BROWSER':
            return message.startsWith('Claim control processed ') ? 'claimBonus' : null
        case 'CLAIM-REWARD':
            return message.startsWith('Reward claimed ') ? 'claimReward' : null
        case 'URL-REWARD-BROWSER':
        case 'URL-REWARD-API':
        case 'URL-REWARD':
            return message.startsWith('Completed browser card') ||
                message.startsWith('Completed API offer') ||
                message.startsWith('Completed UrlReward') ||
                message.startsWith('UrlReward credited ')
                ? 'urlReward'
                : null
        case 'VISUAL-SEARCH':
            return message.startsWith('Daily visual search done ') ||
                message.startsWith('Daily visual search registered ')
                ? 'visualSearch'
                : null
        case 'APP-REWARD':
            return message.startsWith('Completed AppReward') ? 'appReward' : null
        case 'PUNCHCARD':
            return message.startsWith('Reported child ') ? 'punchcard' : null
        case 'PUNCHCARD-BROWSER':
            return message.startsWith('Quest processed ') ? 'punchcard' : null
        case 'SEARCH-ON-BING-SEARCH':
            return message.startsWith('SearchOnBing activity completed ') ? 'searchOnBing' : null
        default:
            return null
    }
}

function applyLivePoints(state, entry) {
    const msg = (entry.message ?? '').replace(/^batch /, '')

    const target = email => ensureAccount(state, email || accountEmailForEntry(state, entry))
    const num = s => {
        const n = Number(s)
        return Number.isFinite(n) ? n : null
    }
    const touch = acc => {
        const at = eventTime(entry)
        acc.live.lastUpdateTs = at
        state.lastPointUpdateAt = at
    }
    const setBalance = (acc, balance) => {
        if (!acc || balance == null) return false
        if (acc.live.balance === balance) return false
        acc.live.balance = balance
        touch(acc)
        return true
    }
    const addGain = (acc, gained, balance, source) => {
        if (!acc) return false
        let changed = false
        if (balance != null && acc.live.balance !== balance) {
            acc.live.balance = balance
            changed = true
        }
        if (balance !== null && acc.initialPoints !== null) {
            acc.pointsKnown = true
            acc.live.gained = balance - acc.initialPoints
        }
        if (gained > 0) {
            if (acc.initialPoints === null) acc.live.gained += gained
            acc.live.bySource[source] = (acc.live.bySource[source] || 0) + gained
            changed = true
        }
        if (changed) touch(acc)
        return changed
    }

    let m
    if ((entry.title === 'SEARCH-BING' || entry.title === 'SEARCH-BONUS') && (m = msg.match(RE.searchStart))) {
        return setBalance(target(), num(m[1]))
    }

    if (entry.title === 'FLOW' && (m = msg.match(RE.flowCollected))) {
        const acc = target(m[3])
        if (!acc) return false
        const total = Number(m[1])
        const balance = Number(m[2])
        const changed = acc.live.gained !== total || acc.live.balance !== balance
        acc.pointsKnown = Number.isFinite(total)
        if (acc.pointsKnown) acc.live.gained = total
        acc.live.balance = balance
        if (changed) touch(acc)
        return changed
    }

    const source = pointEventSource(entry.title, msg)
    if (!source) return false

    const account = target()

    if (account?.attribution) return false

    const gained = numericField(msg, 'pointsGained')
    const balance = numericField(msg, 'currentBalance')
    if (gained == null && balance == null) return false
    return addGain(account, gained ?? 0, balance, source)
}

export function applyLogToRunState(state, entry) {
    const msg = (entry.message ?? '').replace(/^batch /, '')

    if (entry.level === 'error' || entry.level === 'warn') {
        const ff = msg.match(RE.flowFailed)
        if (ff) {
            const acc = ensureAccount(state, ff[1])
            if (acc) {
                acc.error = msg
                acc.success = acc.success === true ? true : false
            }
        }
    }

    if (!entry.parsed) return null

    if (entry.data) {
        if (!isDomainEvent(entry.data)) return null
        const email = entry.data.kind === 'account' ? entry.data.email : undefined
        const account =
            entry.data.kind === 'run' || entry.data.kind === 'session'
                ? null
                : ensureAccount(state, email ?? accountEmailForEntry(state, entry))
        const domain = applyDomainEvent(state, entry, account)
        if (domain) return domain
    }
    if (entry.version !== 2 && applyLivePoints(state, entry)) return 'points'
    const edgeBrowsingEvent = applyEdgeBrowsing(state, entry)
    if (edgeBrowsingEvent) return edgeBrowsingEvent

    let m
    switch (entry.title) {
        case 'RUN-START':
            if ((m = msg.match(RE.runStart))) {
                state.version = m[1]
                state.accountsTotal = Number(m[2])
                state.clusters = Number(m[3])
                state.finished = false
                state.runEnded = false
                state.executionComplete = false
                state.executionError = null
                state.pendingDelay = null
                return 'run-start'
            }
            break

        case 'ACCOUNT-START':
            if ((m = msg.match(RE.accountStart))) {
                const acc = ensureAccount(state, m[1])
                if (acc) {
                    acc.status = 'running'
                    acc.geoLocale = m[2].trim()
                    acc.locale = m[3] || null
                    acc.cachedRegion = m[4] || null
                }
                state.currentEmail = m[1]
                if (entry.user) state.userToEmail[entry.user] = m[1] // map localpart -> full email
                state.pendingDelay = null
                return 'account-start'
            }
            break

        case 'ACCOUNT-DELAY':
            if ((m = msg.match(RE.accountDelay))) {
                state.pendingDelay = {
                    seconds: m[3] === undefined ? Number(m[1]) : Number(m[3]) / 1000,
                    nextEmail: m[2] || null,
                    sinceTs: eventTime(entry)
                }
                return 'account-delay'
            }
            break

        case 'POINTS':
            if ((m = msg.match(RE.earnable))) {
                const email = m[4]
                const acc = ensureAccount(state, email)
                if (acc) {
                    const quota = value => (value === 'disabled' ? 0 : /^\d+$/.test(value) ? Number(value) : null)
                    acc.earnable = { mobile: quota(m[1]), browser: quota(m[2]), app: quota(m[3]) }
                    acc.appQuotaState = m[3].startsWith('pending ')
                        ? 'pending'
                        : /^\d+$/.test(m[3])
                          ? 'available'
                          : m[3] === 'disabled'
                            ? 'disabled'
                            : 'unavailable'
                    acc.locale ??= m[5]
                }
                state.currentEmail = email
                return 'quota'
            } else if ((m = msg.match(/^App points available: (\d+)$/)) || msg === 'App points unavailable') {
                const acc = ensureAccount(state, accountEmailForEntry(state, entry))
                if (acc) {
                    acc.earnable ??= { mobile: null, browser: null, app: null }
                    acc.earnable.app = m ? Number(m[1]) : null
                    acc.appQuotaState = m ? 'available' : 'unavailable'
                }
                return 'quota'
            }
            break

        case 'SEARCH-MANAGER':
            if ((m = msg.match(RE.searchSummary))) {
                const acc = ensureAccount(state, accountEmailForEntry(state, entry))
                if (acc) {
                    acc.searchSummary = {
                        mobile: m[1] === 'unknown' ? null : Number(m[1]),
                        desktop: m[2] === 'unknown' ? null : Number(m[2]),
                        bonus: m[3] === 'unknown' ? null : Number(m[3]),
                        ...(m[4] !== undefined ? { apiReport: m[4] === 'unknown' ? null : Number(m[4]) } : {}),
                        total: m[5] === 'unknown' ? null : Number(m[5])
                    }
                }
                return 'search-summary'
            }
            break

        case 'REACT-PARSE':
            if ((m = msg.match(RE.streakProtection))) {
                const acc = ensureAccount(state, m[8])
                if (acc) {
                    return applyDomainEvent(
                        state,
                        {
                            ...entry,
                            data: {
                                kind: 'account-info',
                                level: normalizeAccountLevel(m[7]),
                                pointsProgress: null,
                                pointsRemaining: null,
                                lifetimeEarn: null,
                                availablePoints: null,
                                streakProtection:
                                    m[4] === 'null'
                                        ? null
                                        : {
                                              isProtectionOn: m[4] === 'true',
                                              remainingDays: m[5] === 'null' ? null : Number(m[5]),
                                              streakCounter: m[6] === 'null' ? null : Number(m[6])
                                          }
                            }
                        },
                        acc
                    )
                }
            }
            break

        case 'ACCOUNT-END':
        case 'ACCOUNT-SKIP':
            if ((m = msg.match(RE.accountEnd))) {
                const acc = ensureAccount(state, m[1])
                if (acc) {
                    const status =
                        msg.match(/(?:^| \| )status=(completed|partial|skipped|failed|cancelled)(?= \| |$)/)?.[1] ??
                        'completed'
                    return applyDomainEvent(
                        state,
                        {
                            ...entry,
                            data: {
                                kind: 'account',
                                email: m[1],
                                status,
                                initialPoints: Number(m[3]),
                                currentBalance: Number(m[4]),
                                pointsGained: m[2] === 'unknown' ? 0 : Number(m[2]),
                                pointsKnown: m[2] !== 'unknown',
                                durationSeconds: Number(m[5]),
                                reason: jsonStringField(msg, 'reason')
                            }
                        },
                        acc
                    )
                }
            } else {
                const failed = msg.match(/^Account (failed|cancelled|setup failed): (\S+)(?: \| (.*))?$/)
                const skipped = msg.match(/^(Skipped|Deferred) account: (\S+)/)
                const email = failed?.[2] ?? skipped?.[2]
                if (email) {
                    const account = ensureAccount(state, email)
                    return applyDomainEvent(
                        state,
                        {
                            ...entry,
                            data: {
                                kind: 'account',
                                email,
                                status: failed
                                    ? failed[1] === 'cancelled'
                                        ? 'cancelled'
                                        : 'failed'
                                    : skipped[1] === 'Deferred' && account.activities?.length
                                      ? 'partial'
                                      : 'skipped',
                                initialPoints: account.initialPoints ?? 0,
                                currentBalance: account.live.balance ?? 0,
                                pointsGained: 0,
                                pointsKnown: false,
                                durationSeconds: numericField(msg, 'durationSeconds') ?? 0,
                                reason: failed?.[3] ?? msg
                            }
                        },
                        account
                    )
                }
            }
            break
        case 'ACCOUNT-BALANCE': {
            const currentBalance = numericField(msg, 'currentBalance')
            const initialPoints = numericField(msg, 'initialPoints')
            if (currentBalance !== null && initialPoints !== null) {
                const account = ensureAccount(state, accountEmailForEntry(state, entry))
                return applyDomainEvent(
                    state,
                    { ...entry, data: { kind: 'balance', currentBalance, initialPoints } },
                    account
                )
            }
            break
        }
        case 'ACTIVITY-RESULT': {
            const account = ensureAccount(state, accountEmailForEntry(state, entry))
            if (account) {
                account.activities ??= []
                const fields = msg.match(
                    /^([^|]+?) \| status=(confirmed|unconfirmed|skipped|failed) \| reason=([^|]*) \| offerId=([^|]*) \| pointsGained=(-?\d+(?:\.\d+)?|unknown)(?= \| |$)/
                )
                const operationId = msg.match(/(?:^| \| )operationId=([^| ]+)/)?.[1]
                if (fields && operationId) {
                    return applyDomainEvent(
                        state,
                        {
                            ...entry,
                            data: {
                                kind: 'activity',
                                activity: fields[1],
                                status: fields[2],
                                reason: fields[3],
                                offerId: fields[4] || undefined,
                                operationId,
                                errorCode: msg.match(/(?:^| \| )errorCode=([^| ]+)/)?.[1],
                                message: jsonStringField(msg, 'message'),
                                pointsGained: fields[5] === 'unknown' ? 0 : Number(fields[5]),
                                pointsKnown: fields[5] !== 'unknown'
                            }
                        },
                        account
                    )
                }
                account.activities.push({
                    message: entry.message,
                    ts: entry.ts,
                    platform: entry.platform,
                    ...(fields
                        ? {
                              activity: fields[1],
                              status: fields[2],
                              reason: fields[3],
                              offerId: fields[4] || null,
                              pointsGained: fields[5] === 'unknown' ? 0 : Number(fields[5]),
                              pointsKnown: fields[5] !== 'unknown'
                          }
                        : {})
                })
                account.activities = account.activities.slice(-200)
            }
            return 'activity-result'
        }
        case 'BROWSER-TASKS': {
            const account = ensureAccount(state, accountEmailForEntry(state, entry))
            if (!account || !['DESKTOP', 'MOBILE'].includes(entry.platform)) break
            const phase =
                msg.startsWith('Starting flyout') || msg.startsWith('Refreshing flyout')
                    ? { surface: 'flyout', status: 'running' }
                    : msg.startsWith('Flyout pass failed')
                      ? { surface: 'flyout', status: 'fallback' }
                      : msg.startsWith('Starting /earn')
                        ? { surface: 'earn', status: 'running' }
                        : msg.startsWith('/earn pass failed')
                          ? { surface: 'earn', status: 'partial' }
                          : msg.startsWith('Completed flyout and earn') || msg.startsWith('Completed /earn fallback')
                            ? { surface: 'earn', status: 'completed' }
                            : msg.startsWith('Completed earn and flyout')
                              ? { surface: 'flyout', status: 'completed' }
                              : msg.startsWith('Finished flyout; /earn pass remains unconfirmed') ||
                                  msg.startsWith('Browser task passes remain unconfirmed')
                                ? { surface: 'earn', status: 'partial' }
                                : null
            if (phase) {
                account.browserPhases ??= {}
                account.browserPhases[entry.platform.toLowerCase()] = { ...phase, updatedAt: eventTime(entry) }
                return 'browser-tasks'
            }
            break
        }
        case 'ACCOUNT-ERROR':
            if ((m = msg.match(RE.accountError))) {
                const acc = ensureAccount(state, m[1])
                if (acc) {
                    acc.error = m[2].trim()
                    acc.success = false
                    acc.status = 'failed'
                }
                return 'account-error'
            }
            break

        case 'RUN-END':
            if ((m = msg.match(RE.runEnd))) {
                state.totals = {
                    accountsProcessed: Number(m[1]),
                    collected: m[2] === 'unknown' ? null : Number(m[2]),
                    pointsKnown: m[2] !== 'unknown',
                    oldTotal: Number(m[3]),
                    newTotal: Number(m[4]),
                    runtimeMinutes: Number(m[5])
                }
                state.finished = true
                state.runEnded = true
                state.terminalStatus =
                    msg.match(/(?:^| \| )status=(completed|partial|interrupted)(?= \| |$)/)?.[1] ?? 'completed'
                state.pendingDelay = null
                return 'run-end'
            }
            break

        default:
            break
    }

    return null
}
