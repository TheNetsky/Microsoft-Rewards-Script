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
        lastPointUpdateAt: null,
        totals: null, // { collected, oldTotal, newTotal, runtimeMinutes, accountsProcessed }
        order: [], // emails in the order they started
        accounts: {}, // email -> account summary
        errors: [], // recent error/warn messages { ts, level, title, message }
        finished: false,
        pendingDelay: null // { seconds, nextEmail, sinceTs } while waiting between accounts/workers
    }
}

function ensureAccount(state, email) {
    if (!email) return null
    if (!state.accounts[email]) {
        state.accounts[email] = {
            email,
            geoLocale: null,
            locale: null,
            cachedRegion: null,
            initialPoints: null,
            collectedPoints: null,
            finalPoints: null,
            earnable: null, // { mobile, browser, app }; browser is the desktop search pool
            searchSummary: null, // { mobile, desktop, bonus, total }
            streakProtection: null, // { enabled, remainingDays, streakCounter, updatedAt }
            edgeBrowsing: null, // background Edge activity progress and ETA
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

// All patterns adapted for the Chinese-localized fork of Microsoft-Rewards-Script.
// The field names (offers=, pointsGained=, currentBalance=, etc.) remain in English
// inside the log messages, but the surrounding text is Chinese.
const RE = {
    runStart: /^启动微软奖励脚本 \| v(\S+) \| 账户数: (\d+) \| 集群数: (\d+)/,
    accountStart:
        /^开始处理账户: (\S+) \| geoLocale: ([^|]+?)(?: \| locale: (\S+))?(?: \| 缓存区域: (\S+))?\s*$/,
    earnable: /^今日可赚取 \| 移动端: (\d+) \| 浏览器: (\d+) \| App: (\d+) \| (\S+) \| locale: (\S+)\s*$/,
    searchSummary: /^搜索汇总 \| 移动端=(-?\d+) \| 桌面端=(-?\d+) \| 额外=(-?\d+) \| 总计=(-?\d+)/,
    streakProtection:
        /^快照完成 \| offers=(\d+) \| 可上报=(\d+) \| streaks=(\d+) \| 连续保护已启用=(true|false|null) \| 连续保护剩余天数=(\d+|null) \| 连续计数=(\d+|null) \| 等级=([^|]+) \| 账户=(\S+@\S+)$/,
    accountEnd:
        /^账户完成: (\S+) \| 获得积分=(-?\d+) \| 原余额=(\d+) \| 现余额=(\d+) \| 持续秒数=([\d.]+)/,
    runEnd: /^全部账户完成 \| 处理账户数=(\d+) \| 获得积分=(-?\d+) \| 原余额=(\d+) \| 现余额=(\d+) \| 运行分钟数=([\d.]+)/,
    accountError: /^(\S+@\S+) \| 错误=([\s\S]+)$/,
    flowFailed: /(\S+@\S+) 的.*流程失败:/i,
    accountDelay: /^等待 ([\d.]+) 秒后开始下一个账户(?: \((\S+@\S+)\))?$/,

    searchStart: /^开始必应搜索 \| 当前余额=(\d+)/,
    flowCollected: /^积分已收集 \| 获得积分=(-?\d+) \| 现余额=(\d+) \| 账户=(\S+@\S+)/
}

function numericField(message, name) {
    const match = message.match(new RegExp(`(?:^| \\| )${name}=(-?\\d+(?:\\.\\d+)?)(?= \\| |$)`))
    return match ? Number(match[1]) : null
}

function fractionField(message, name) {
    const match = message.match(new RegExp(`(?:^| \\| )${name}=(\\d+)\\/(\\d+)(?= \\| |$)`))
    return match ? { current: Number(match[1]), total: Number(match[2]) } : null
}

function eventTime(entry) {
    return entry.receivedAt ?? entry.ts ?? null
}

function accountEmailForEntry(state, entry) {
    return (entry.user && state.userToEmail[entry.user]) || state.currentEmail || null
}

function pointEventSource(title, message) {
    switch (title) {
        case 'SEARCH-BING':
            return message.startsWith('必应搜索完成') ? 'search' : null
        case 'SEARCH-BONUS':
            return message.startsWith('必应搜索完成') ? 'bonus' : null
        case 'READ-TO-EARN':
            return (message.startsWith('文章后的积分变化') ||
                    message.startsWith('未获得积分，停止读文赚积分') ||
                    message.startsWith('已阅读第') ||
                    message.startsWith('读文赚积分完成')) ? 'read' : null
        case 'DAILY-CHECK-IN':
            return message.startsWith('每日签到完成') ? 'checkIn' : null
        case 'CLAIM-BONUS-POINTS':
            return (message.startsWith('领取奖励积分完成') || message.startsWith('没有可领取的积分'))
                ? 'claimBonus'
                : null
        case 'CLAIM-REWARD':
            return message.startsWith('奖励已领取') ? 'claimReward' : null
        case 'URL-REWARD':
            return (message.startsWith('UrlReward 完成') || message.startsWith('UrlReward 未获得积分'))
                ? 'urlReward'
                : null
        case 'VISUAL-SEARCH':
            return (message.startsWith('每日视觉搜索完成') || message.startsWith('每日视觉搜索已记录'))
                ? 'visualSearch'
                : null
        case 'APP-REWARD':
            return (message.startsWith('AppReward 完成') || message.startsWith('AppReward 完成但未获得积分'))
                ? 'appReward'
                : null
        case 'PUNCHCARD':
            return (message.includes('COMPLETE') || message.includes('in progress')) ? 'punchcard' : null
        case 'SEARCH-ON-BING-SEARCH':
            return message.startsWith('SearchOnBing 活动完成') ? 'searchOnBing' : null
        default:
            return null
    }
}

function applyLivePoints(state, entry) {
    const msg = entry.message ?? ''

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

function applyEdgeBrowsing(state, entry) {
    if (entry.title !== 'EDGE-BROWSING') return null

    const account = ensureAccount(state, accountEmailForEntry(state, entry))
    if (!account) return null

    const message = entry.message ?? ''
    const finalReports = message.startsWith('后台 Edge 浏览活动结束')
        ? numericField(message, 'reports')
        : null
    const progress =
        fractionField(message, 'reportsCompleted') ??
        fractionField(message, 'report') ??
        (finalReports != null ? { current: finalReports, total: finalReports } : null)
    const previous = account.edgeBrowsing ?? {
        status: 'pending',
        targetMinutes: null,
        serverIntervalMinutes: null,
        reportsCompleted: 0,
        reportsTotal: null,
        reportsRemaining: null,
        scheduledMinutesCovered: 0,
        nextReportInSeconds: null,
        estimatedRemainingMinutes: null,
        elapsedMinutes: null,
        accepted: 0,
        duplicates: 0,
        failed: 0,
        waitingForBackground: false,
        updatedAt: null
    }

    if (message.startsWith('开始后台 Edge 浏览活动')) {
        previous.status = 'running'
        previous.targetMinutes = numericField(message, 'targetMinutes')
        previous.serverIntervalMinutes = numericField(message, 'serverIntervalMinutes')
        previous.reportsTotal = numericField(message, 'reports')
        previous.reportsRemaining = previous.reportsTotal
        previous.scheduledMinutesCovered = 0
        previous.estimatedRemainingMinutes = numericField(message, 'estimatedDurationMinutes')
        previous.waitingForBackground = false
    } else if (message.startsWith('Edge 浏览进度')) {
        previous.status = 'running'
    } else if (message.startsWith('已提交 Edge 浏览报告')) {
        previous.status = 'running'
        previous.nextReportInSeconds = null
    } else if (message.startsWith('后台 Edge 浏览活动结束')) {
        const duplicates = numericField(message, 'duplicates') ?? previous.duplicates
        const failed = numericField(message, 'failed') ?? previous.failed
        const serverCompleteMatch = message.match(/(?:^| \| )serverComplete=(true|false)(?= \| |$)/)
        const serverComplete = serverCompleteMatch ? serverCompleteMatch[1] === 'true' : null

        if (serverComplete === true) previous.status = 'complete'
        else if (serverComplete === false) previous.status = 'partial'
        else previous.status = duplicates > 0 || failed > 0 ? 'partial' : 'complete'

        previous.reportsRemaining = serverComplete === false ? previous.reportsRemaining : 0
        previous.nextReportInSeconds = null
        previous.estimatedRemainingMinutes = 0
        previous.waitingForBackground = false
    } else if (message === 'Edge 浏览连击（Browsing Streak）已完成') {
        previous.status = 'complete'
        previous.reportsRemaining = 0
        previous.nextReportInSeconds = null
        previous.estimatedRemainingMinutes = 0
        previous.waitingForBackground = false
    } else if (
        message === '该账户无法使用 Edge 浏览连击（Browsing Streak）' ||
        message.startsWith('跳过：')
    ) {
        previous.status = 'skipped'
        previous.waitingForBackground = false
    } else if (
        message.startsWith('后台 Edge 浏览活动失败') ||
        message.startsWith('意外的后台任务失败')
    ) {
        previous.status = 'failed'
        previous.waitingForBackground = false
    } else if (message === '后台活动已取消') {
        previous.status = 'cancelled'
        previous.waitingForBackground = false
    } else if (message.startsWith('前台活动已完成；')) {
        previous.waitingForBackground = true
    } else {
        return null
    }

    if (progress?.current != null) previous.reportsCompleted = progress.current
    if (progress?.total != null) previous.reportsTotal = progress.total

    const reportsRemaining = numericField(message, 'reportsRemaining')
    const scheduledMinutes = fractionField(message, 'scheduledMinutesCovered')
    const nextReportInSeconds = numericField(message, 'nextReportInSeconds')
    const estimatedRemainingMinutes = numericField(message, 'estimatedRemainingMinutes')
    const elapsedMinutes = numericField(message, 'elapsedMinutes')
    const accepted = numericField(message, 'accepted')
    const duplicates = numericField(message, 'duplicates')
    const failed = numericField(message, 'failed')

    if (reportsRemaining != null) previous.reportsRemaining = reportsRemaining
    if (scheduledMinutes?.current != null) previous.scheduledMinutesCovered = scheduledMinutes.current
    if (nextReportInSeconds != null) previous.nextReportInSeconds = nextReportInSeconds
    if (estimatedRemainingMinutes != null) previous.estimatedRemainingMinutes = estimatedRemainingMinutes
    if (elapsedMinutes != null) previous.elapsedMinutes = elapsedMinutes
    if (accepted != null) previous.accepted = accepted
    if (duplicates != null) previous.duplicates = duplicates
    if (failed != null) previous.failed = failed

    previous.updatedAt = eventTime(entry)
    account.edgeBrowsing = previous
    return 'edge-browsing'
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
                state.pendingDelay = null
                return 'run-start'
            }
            break

        case 'ACCOUNT-START':
            if ((m = msg.match(RE.accountStart))) {
                const acc = ensureAccount(state, m[1])
                if (acc) {
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
                    seconds: Number(m[1]),
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
                    acc.earnable = { mobile: Number(m[1]), browser: Number(m[2]), app: Number(m[3]) }
                    acc.locale ??= m[5]
                }
                state.currentEmail = email
            }
            break

        case 'SEARCH-MANAGER':
            if ((m = msg.match(RE.searchSummary))) {
                const acc = ensureAccount(state, accountEmailForEntry(state, entry))
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
                        updatedAt: eventTime(entry)
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
                    const at = eventTime(entry)
                    acc.live.lastUpdateTs = at
                    state.lastPointUpdateAt = at
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
                state.pendingDelay = null
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
    return {
        version: state.version,
        clusters: state.clusters,
        accountsTotal: state.accountsTotal,
        accountsSeen: accounts.length,
        collected,
        totals: state.totals,
        finished: state.finished,
        pendingDelay: state.pendingDelay,
        live: {
            currentAccount: state.currentEmail,
            currentBalance: current?.live?.balance ?? null,
            gained: collected,
            updatedAt: state.lastPointUpdateAt
        },
        accounts
    }
}