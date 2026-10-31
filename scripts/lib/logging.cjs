const { format } = require('node:util')
const chalkModule = require('chalk')
const chalk = chalkModule.default ?? chalkModule

const LOG_COLORS = Object.freeze({
    debug: 'magenta',
    info: 'white',
    special: 'blue',
    success: 'green',
    warn: 'yellow',
    error: 'red'
})
const LOG_ACCENTS = Object.freeze({
    white: 0xffffff,
    magenta: 0x9b59b6,
    blue: 0x3498db,
    green: 0x57f287,
    yellow: 0xfee75c,
    red: 0xed4245
})

function resolveLogColor(level, data, requested) {
    const severity = String(level).toLowerCase()
    if (severity === 'error' || severity === 'warn' || severity === 'debug') return LOG_COLORS[severity]
    const completed =
        data?.kind === 'activity'
            ? data.status === 'confirmed'
            : ['account', 'run', 'session'].includes(data?.kind) && data.status === 'completed'
    if (completed || severity === 'success' || requested === 'green') return LOG_COLORS.success
    if (data?.kind === 'quota' || severity === 'special' || requested === 'blue' || requested === 'cyan')
        return LOG_COLORS.special
    return LOG_COLORS.info
}

function resolveLogAccent(color) {
    return Object.hasOwn(LOG_ACCENTS, color) ? LOG_ACCENTS[color] : LOG_ACCENTS.white
}

function formatLogLine(event) {
    return `[${event.ts}] [${event.user}] [${event.level.toUpperCase()}] ${event.platform} [${event.title}] ${sanitizeLogMessage(event.message)}`
}

function writeConsoleLog(level, line, color) {
    const output = chalk[resolveLogColor(level, undefined, color)](line)
    if (level === 'error') console.error(output)
    else if (level === 'warn') console.warn(output)
    else console.log(output)
}

function sanitizeLogMessage(message) {
    return message
        .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
        .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [redacted]')
        .replace(/(\b(?:Cookie|Set-Cookie)\s*:\s*)[^\r\n|]*/gi, '$1[redacted]')
        .replace(
            /(["']?\b(?:ACCOUNT_\d+_)?(?:access_?token|refresh_?token|id_?token|api_?token|api_?key|botToken|token|totp_?secret|proxy_password|password|client_?secret|authorization|cookie|set-cookie)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^"'\s&,;]+)/gi,
            '$1[redacted]'
        )
        .replace(/([?&](?:token|key|code|sig|signature)=)[^\s&#]*/gi, '$1[redacted]')
        .replace(/\r?\n/g, '\\n')
}

function logMessage(prefix, level, ...args) {
    const requested = String(level).toLowerCase()
    const highlighted = requested === 'success' || requested === 'special'
    const severity = !highlighted && Object.hasOwn(LOG_COLORS, requested) ? requested : 'info'
    writeConsoleLog(
        severity,
        formatLogLine({
            ts: new Date().toISOString(),
            user: 'MAIN',
            platform: 'MAIN',
            level: severity,
            title: prefix ? prefix.toUpperCase() : 'CLI',
            message: format(...args)
        }),
        resolveLogColor(requested)
    )
}

function sanitizeLogData(value) {
    if (typeof value === 'string') return sanitizeLogMessage(value)
    if (Array.isArray(value)) return value.map(sanitizeLogData)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeLogData(item)]))
}

function exitWithUsage(message, printHelp, log) {
    log('ERROR', message)
    printHelp()
    process.exit(1)
}

module.exports = {
    LOG_COLORS,
    resolveLogColor,
    resolveLogAccent,
    formatLogLine,
    writeConsoleLog,
    sanitizeLogMessage,
    sanitizeLogData,
    logMessage,
    exitWithUsage
}
