const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

export function stripAnsi(str) {
    return typeof str === 'string' ? str.replace(ANSI_RE, '') : str
}

const LINE_RE = /^\[([^\]]*)\] \[([^\]]*)\] \[(INFO|WARN|ERROR|DEBUG)\] (MAIN|MOBILE|DESKTOP) \[([^\]]*)\] ([\s\S]*)$/

const SEVERITY = { debug: 0, info: 1, warn: 2, error: 3 }

export function severityRank(level) {
    return SEVERITY[level] ?? 1
}

export function parseLogLine(rawInput, source = 'stdout') {
    const raw = stripAnsi(String(rawInput))
    const match = raw.match(LINE_RE)

    if (match) {
        const [, ts, user, levelTag, platform, title, message] = match
        return {
            ts,
            level: levelTag.toLowerCase(),
            user: user || null,
            platform,
            title,
            message,
            source,
            parsed: true,
            raw
        }
    }

    let level = source === 'stderr' ? 'error' : 'info'
    if (/\b(ERROR|Error:|ERR!|FATAL|Traceback|Unhandled)\b/.test(raw)) level = 'error'
    else if (/\b(WARN|WARNING|Deprecat)/i.test(raw)) level = 'warn'

    return {
        ts: null,
        level,
        user: null,
        platform: null,
        title: null,
        message: raw,
        source,
        parsed: false,
        raw
    }
}

export function createRunState() {
    return {
        version: null,
        clusters: null,
        accountsTotal: null,
        currentEmail: null,
        userToEmail: {}, // log "user" (email localpart) -> full email, for attributing live lines
        totals: null, // { collected, oldTotal, newTotal, runtimeMinutes, accountsProcessed }
        order: [], // emails in the order they started
        accounts: {}, // email -> account summary
        errors: [], // recent error/warn messages { ts, level, title, message }
        finished: false
    }
}

function ensureAccount(state, email) {
    if (!email) return null
    if (!state.accounts[email]) {
        state.accounts[email] = {
            email,
            geoLocale: null,
            initialPoints: null,
            collectedPoints: null,
            finalPoints: null,
            earnable: null, // { mobile, browser, app } as reported in the "Earnable today" line
            searchSummary: null, // { mobile, desktop, bonus, total }
            streakProtection: null, // { enabled, remainingDays, streakCounter, updatedAt }
            durationSeconds: null,
            success: null,
            error: null,
            live: {
                balance: null, // latest known available-points balance
                gained: 0, // points earned so far this run (per this account)
                bySource: {}, // keyed by normalized activity source
                lastUpdateTs: null
            }
        }
        state.order.push(email)
    }
    return state.accounts[email]
}

const RE = {
    runStart: /^Starting Microsoft Rewards Script \| v(\S+) \| Accounts: (\d+) \| Clusters: (\d+)/,
    accountStart: /^Starting account: (\S+) \| geoLocale: (.+?)\s*$/,
    earnable: /^Earnable today \| Mobile: (\d+) \| Browser: (\d+) \| App: (\d+) \| (\S+) \| locale: (\S+)/,
    searchSummary: /^Search summary \| mobile=(-?\d+) \| desktop=(-?\d+) \| bonus=(-?\d+) \| total=(-?\d+)/,
    streakProtection:
        /^Snapshot complete \| offers=(\d+) \| reportable=(\d+) \| streaks=(\d+) \| streakProtectionEnabled=(true|false|null) \| streakProtectionRemainingDays=(\d+|null) \| streakCounter=(\d+|null) \| level=([^|]+) \| account=(\S+@\S+)$/,
    accountEnd:
        /^Completed account: (\S+) \| pointsGained=(-?\d+) \| previousBalance=(\d+) \| currentBalance=(\d+) \| durationSeconds=([\d.]+)/,
    runEnd: /^Completed all accounts \| accountsProcessed=(\d+) \| pointsGained=(-?\d+) \| previousBalance=(\d+) \| currentBalance=(\d+) \| runtimeMinutes=([\d.]+)/,
    accountError: /^(\S+@\S+): ([\s\S]+)$/,
    flowFailed: /flow failed for (\S+@\S+):/i,

    searchStart: /^Starting Bing searches \| currentBalance=(\d+)/,
    flowCollected: /^Points collected \| pointsGained=(-?\d+) \| currentBalance=(\d+) \| account=(\S+@\S+)/
}

function numericField(message, name) {
    const match = message.match(new RegExp(`(?:^| \\| )${name}=(-?\\d+)(?= \\| |$)`))
    return match ? Number(match[1]) : null
}

function pointEventSource(title, message) {
    switch (title) {
        case 'SEARCH-BING':
            return message.startsWith('pointsGained=') ? 'search' : null
        case 'SEARCH-BONUS':
            return message.startsWith('pointsGained=') ? 'bonus' : null
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
        case 'CLAIM-REWARD':
            return message.startsWith('Reward claimed ') ? 'claimReward' : null
        case 'URL-REWARD':
            return message.startsWith('Completed UrlReward') || message.startsWith('UrlReward credited ')
                ? 'urlReward'
                : null
        case 'VISUAL-SEARCH':
            return message.startsWith('Daily visual search done ') ? 'visualSearch' : null
        case 'APP-REWARD':
            return message.startsWith('Completed AppReward') ? 'appReward' : null
        case 'PUNCHCARD':
            return message.startsWith('Reported child ') ? 'punchcard' : null
        case 'SEARCH-ON-BING-SEARCH':
            return message.startsWith('SearchOnBing activity completed ') ? 'searchOnBing' : null
        default:
            return null
    }
}

function applyLivePoints(state, entry) {
    const msg = entry.message ?? ''

    const emailFromUser = user => (user ? state.userToEmail[user] : null)
    const target = email => ensureAccount(state, email || emailFromUser(entry.user) || state.currentEmail)
    const num = s => {
        const n = Number(s)
        return Number.isFinite(n) ? n : null
    }
    const touch = acc => {
        acc.live.lastUpdateTs = entry.ts
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
        if (gained > 0) {
            acc.live.gained += gained
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
        acc.live.gained = total
        acc.live.balance = balance
        if (changed) touch(acc)
        return changed
    }

    const source = pointEventSource(entry.title, msg)
    if (!source) return false

    const gained = numericField(msg, 'pointsGained')
    const balance = numericField(msg, 'currentBalance')
    if (gained == null && balance == null) return false
    return addGain(target(), gained ?? 0, balance, source)
}

export function applyLogToRunState(state, entry) {
    const msg = entry.message ?? ''

    if (entry.level === 'error' || entry.level === 'warn') {
        state.errors.push({
            ts: entry.ts,
            level: entry.level,
            title: entry.title,
            message: msg
        })
        if (state.errors.length > 200) state.errors.shift()

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

    if (applyLivePoints(state, entry)) return 'points'

    let m
    switch (entry.title) {
        case 'RUN-START':
            if ((m = msg.match(RE.runStart))) {
                state.version = m[1]
                state.accountsTotal = Number(m[2])
                state.clusters = Number(m[3])
                state.finished = false
                return 'run-start'
            }
            break

        case 'ACCOUNT-START':
            if ((m = msg.match(RE.accountStart))) {
                const acc = ensureAccount(state, m[1])
                if (acc) acc.geoLocale = m[2]
                state.currentEmail = m[1]
                if (entry.user) state.userToEmail[entry.user] = m[1] // map localpart -> full email
                return 'account-start'
            }
            break

        case 'POINTS':
            if ((m = msg.match(RE.earnable))) {
                const email = m[4]
                const acc = ensureAccount(state, email)
                if (acc) {
                    acc.earnable = { mobile: Number(m[1]), browser: Number(m[2]), app: Number(m[3]) }
                }
                state.currentEmail = email
            }
            break

        case 'SEARCH-MANAGER':
            if ((m = msg.match(RE.searchSummary)) && state.currentEmail) {
                const acc = ensureAccount(state, state.currentEmail)
                if (acc) {
                    acc.searchSummary = {
                        mobile: Number(m[1]),
                        desktop: Number(m[2]),
                        bonus: Number(m[3]),
                        total: Number(m[4])
                    }
                }
            }
            break

        case 'REACT-PARSE':
            if ((m = msg.match(RE.streakProtection))) {
                const acc = ensureAccount(state, m[8])
                if (acc) {
                    acc.streakProtection = {
                        enabled: m[4] === 'null' ? null : m[4] === 'true',
                        remainingDays: m[5] === 'null' ? null : Number(m[5]),
                        streakCounter: m[6] === 'null' ? null : Number(m[6]),
                        updatedAt: entry.ts
                    }
                }
                return 'streak-protection'
            }
            break

        case 'ACCOUNT-END':
            if ((m = msg.match(RE.accountEnd))) {
                const acc = ensureAccount(state, m[1])
                if (acc) {
                    acc.collectedPoints = Number(m[2])
                    acc.initialPoints = Number(m[3])
                    acc.finalPoints = Number(m[4])
                    acc.durationSeconds = Number(m[5])
                    acc.success = true
                    acc.live.gained = Number(m[2])
                    acc.live.balance = Number(m[4])
                }
                return 'account-end'
            }
            break

        case 'ACCOUNT-ERROR':
            if ((m = msg.match(RE.accountError))) {
                const acc = ensureAccount(state, m[1])
                if (acc) {
                    acc.error = m[2].trim()
                    acc.success = false
                }
                return 'account-error'
            }
            break

        case 'RUN-END':
            if ((m = msg.match(RE.runEnd))) {
                state.totals = {
                    accountsProcessed: Number(m[1]),
                    collected: Number(m[2]),
                    oldTotal: Number(m[3]),
                    newTotal: Number(m[4]),
                    runtimeMinutes: Number(m[5])
                }
                state.finished = true
                return 'run-end'
            }
            break

        default:
            break
    }

    return null
}

function accountCollected(a) {
    if (typeof a.collectedPoints === 'number') return a.collectedPoints
    return a.live?.gained ?? 0
}

export function summarizeRunState(state) {
    const accounts = state.order.map(email => state.accounts[email])
    const collected = state.totals?.collected ?? accounts.reduce((sum, a) => sum + accountCollected(a), 0)

    const current = state.currentEmail ? state.accounts[state.currentEmail] : null
    let lastUpdateTs = null
    for (const a of accounts) {
        if (a.live?.lastUpdateTs) lastUpdateTs = a.live.lastUpdateTs
    }

    return {
        version: state.version,
        clusters: state.clusters,
        accountsTotal: state.accountsTotal,
        accountsSeen: accounts.length,
        collected,
        totals: state.totals,
        finished: state.finished,
        live: {
            currentAccount: state.currentEmail,
            currentBalance: current?.live?.balance ?? null,
            gained: collected,
            updatedAt: lastUpdateTs
        },
        accounts
    }
}
