import { sanitizeLogMessage, sanitizeLogData } from '../../../scripts/lib/logging.cjs'
import { resolveLogColor } from '../../logging/LogStyle.js'

const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

function stripAnsi(str) {
    return typeof str === 'string' ? str.replace(ANSI_RE, '') : str
}

const LINE_RE = /^\[([^\]]*)\] \[([^\]]*)\] \[(INFO|WARN|ERROR|DEBUG)\] (MAIN|MOBILE|DESKTOP) \[([^\]]*)\] ([\s\S]*)$/

const SEVERITY = { debug: 0, info: 1, warn: 2, error: 3 }

export function severityRank(level) {
    return SEVERITY[level] ?? 1
}

export function parseLogLine(rawInput, source = 'stdout') {
    const raw = sanitizeLogMessage(stripAnsi(String(rawInput)))
    if (String(rawInput).startsWith('__REWARDS_EVENT__ ')) {
        try {
            const event = JSON.parse(String(rawInput).slice('__REWARDS_EVENT__ '.length))
            if (
                [1, 2].includes(event.version) &&
                typeof event.message === 'string' &&
                typeof event.title === 'string' &&
                ['debug', 'info', 'warn', 'error'].includes(event.level) &&
                typeof event.user === 'string' &&
                typeof event.ts === 'string' &&
                ['MAIN', 'MOBILE', 'DESKTOP'].includes(event.platform) &&
                (event.consoleAllowed === undefined || typeof event.consoleAllowed === 'boolean') &&
                (event.runId === undefined || typeof event.runId === 'string')
            ) {
                return {
                    ...event,
                    message: sanitizeLogMessage(event.message),
                    data: sanitizeLogData(event.data),
                    color: resolveLogColor(event.level, event.data, event.color),
                    source,
                    parsed: true,
                    raw: `[${event.ts}] [${event.user}] [${event.level.toUpperCase()}] ${event.platform} [${event.title}] ${sanitizeLogMessage(event.message)}`
                }
            }
        } catch {
            /* Retain malformed output as an ordinary log line. */
        }
    }
    const match = raw.match(LINE_RE)

    if (match) {
        const [, ts, user, levelTag, platform, title, message] = match
        return {
            ts,
            level: (levelTag ?? 'INFO').toLowerCase(),
            color: resolveLogColor((levelTag ?? 'INFO').toLowerCase()),
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
        color: resolveLogColor(level),
        user: null,
        platform: null,
        title: null,
        message: raw,
        source,
        parsed: false,
        raw
    }
}
