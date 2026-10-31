import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'

import { ProcessManager } from './processManager.js'
import { createAccessControl } from './access.js'
import { createMonitoringRoutes } from './routes/monitoring.js'
import { createSettingsRoutes } from './routes/settings.js'
import { createSessionRoutes } from './routes/sessions.js'
import { createDiagnosticRoutes } from './routes/diagnostics.js'
import { createRunRoutes } from './routes/run.js'
import { sendJson, sendRequestError, containsControlCharacters } from './http.js'
import { createEventStream } from './eventStream.js'
import { resolveRunCommand, resolveSessionCommand } from './runCommand.js'
import {
    log,
    exitWithUsage,
    parseArgs,
    findUnknownOptions,
    getProjectRoot,
    loadEnvFile,
    envStr,
    envBool,
    loadConfigSafe
} from './lib.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = getProjectRoot(__dirname)

loadEnvFile(projectRoot)

const cliArgs = parseArgs(process.argv.slice(2), { boolean: ['help', 'h'] })

function printHelp() {
    console.log(`
Microsoft Rewards control API

Usage:
  npm run api
  npm run api -- [--host <address>] [--port <number>] [--token <token>]

Options:
  --host        Listen address. Defaults to API_HOST or 127.0.0.1.
  --port        Listen port from 1 to 65535. Defaults to API_PORT or 3010.
  --token       One-time API token. API_TOKEN from .env takes precedence.
  --help        Show this help.

Examples:
  npm run api
  npm run api -- --port 3010
  npm run api -- --host 0.0.0.0 --port 3010 --token "YOUR_API_TOKEN"
`)
}

const failUsage = message => exitWithUsage(message, printHelp, log)

if (cliArgs.help || cliArgs.h) {
    printHelp()
    process.exit(0)
}

const unknownOptions = findUnknownOptions(cliArgs, ['host', 'port', 'token', 'help', 'h'])
if (unknownOptions.length) {
    failUsage(
        `Unknown option${unknownOptions.length === 1 ? '' : 's'}: ${unknownOptions.map(v => `--${v}`).join(', ')}`
    )
}
if (cliArgs._.length) {
    failUsage(`Unexpected positional argument${cliArgs._.length === 1 ? '' : 's'}: ${cliArgs._.join(' ')}`)
}
for (const option of ['host', 'port', 'token']) {
    if (cliArgs[option] === true || cliArgs[option] === '') {
        failUsage(`--${option} requires a value after it.`)
    }
}

function integerSetting(name, value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
    if (value === undefined) return fallback
    const parsed = Number(value)
    if (typeof value === 'boolean' || !Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
        log('ERROR', `${name} must be an integer between ${min} and ${max}.`)
        process.exit(1)
    }
    return parsed
}

let pkgVersion = '0.0.0'
let pkgName = 'microsoft-rewards-script'
try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
    pkgVersion = pkg.version ?? pkgVersion
    pkgName = pkg.name ?? pkgName
} catch {
    // Ignore
}

const HOST = envStr('API_HOST') ?? (typeof cliArgs.host === 'string' ? cliArgs.host : '127.0.0.1')
const PORT =
    cliArgs.port !== undefined
        ? integerSetting('--port', cliArgs.port, 3010, { max: 65535 })
        : integerSetting('API_PORT', envStr('API_PORT'), 3010, { max: 65535 })
const TOKEN = envStr('API_TOKEN') ?? (typeof cliArgs.token === 'string' ? cliArgs.token : undefined)
if (!TOKEN && !['127.0.0.1', 'localhost', '::1'].includes(HOST)) {
    failUsage('API_TOKEN is required when listening on a non-loopback address.')
}
const CORS_ORIGIN = envStr('API_CORS_ORIGIN') ?? (TOKEN ? '*' : 'http://localhost:3000')
const LOG_BUFFER = integerSetting('API_LOG_BUFFER', envStr('API_LOG_BUFFER'), 2000)
const STOP_TIMEOUT_MS = integerSetting('API_STOP_TIMEOUT_MS', envStr('API_STOP_TIMEOUT_MS'), 15000)
const ALLOW_ENV_OVERRIDES = envBool('API_ALLOW_ENV_OVERRIDES', false)
const REVEAL_ENABLED = envBool('API_ALLOW_CONFIG_REVEAL', false)
const DEBUG_LOGS = envBool('CONFIG_DEBUG_LOGS', loadConfigSafe(projectRoot)?.data?.debugLogs === true)
const ALLOW_CONFIG_WRITE = envBool('API_ALLOW_CONFIG_WRITE', false)
const ALLOW_SCHEDULE_WRITE = envBool('API_ALLOW_SCHEDULE_WRITE', false)

const RUN_HISTORY = integerSetting('API_RUN_HISTORY', envStr('API_RUN_HISTORY'), 20)
const DIAG_DIR = envStr('API_DIAGNOSTICS_DIR') ?? path.join(projectRoot, 'diagnostics')

const { command, args } = resolveRunCommand({ projectRoot })

const pm = new ProcessManager({
    command,
    args,
    sessionCommand: resolveSessionCommand({ projectRoot }),
    cwd: projectRoot,
    stopTimeoutMs: STOP_TIMEOUT_MS,
    logBufferSize: LOG_BUFFER,
    historySize: RUN_HISTORY,
    name: pkgName,
    version: pkgVersion
})

const startedAt = Date.now()

if (containsControlCharacters(HOST) || containsControlCharacters(CORS_ORIGIN)) {
    log('ERROR', 'API_HOST and API_CORS_ORIGIN must not contain control characters.')
    process.exit(1)
}

pm.on('log', entry => {
    if (entry.consoleAllowed === false) return
    const plain = entry.raw ?? entry.message ?? ''
    const line = (entry.color ? chalk[entry.color](plain) : plain) + '\n'
    if (entry.level === 'warn' || entry.level === 'error' || entry.source === 'stderr') process.stderr.write(line)
    else process.stdout.write(line)
})

const handleEventStream = createEventStream(pm, LOG_BUFFER)
const authorize = createAccessControl({ token: TOKEN, corsOrigin: CORS_ORIGIN })
const monitoring = createMonitoringRoutes({
    projectRoot,
    pm,
    name: pkgName,
    version: pkgVersion,
    token: TOKEN,
    startedAt,
    logBuffer: LOG_BUFFER,
    historySize: RUN_HISTORY
})
const settings = createSettingsRoutes({
    projectRoot,
    pm,
    revealEnabled: REVEAL_ENABLED,
    token: TOKEN,
    allowConfigWrite: ALLOW_CONFIG_WRITE,
    allowScheduleWrite: ALLOW_SCHEDULE_WRITE
})
const sessions = createSessionRoutes({ projectRoot, pm, allowEnvOverrides: ALLOW_ENV_OVERRIDES })
const diagnostics = createDiagnosticRoutes(DIAG_DIR)
const runs = createRunRoutes({ pm, allowEnvOverrides: ALLOW_ENV_OVERRIDES, shutdown })
const routes = [
    { path: /^\/(?:config(?:\/(?:diff|sync))?|schedule)$/, handle: settings },
    { path: /^\/sessions(?:\/.*)?$/, handle: sessions },
    { path: /^\/diagnostics(?:\/.*)?$/, handle: diagnostics },
    { path: /^\/(?:start|stop|restart|shutdown)$/, handle: runs }
]

async function requestHandler(req, res) {
    let url
    try {
        url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
    } catch {
        return sendJson(res, 400, { error: 'Invalid request URL.', code: 'BAD_REQUEST' })
    }
    if (!authorize(req, res, url)) return
    const pathname = url.pathname.replace(/\/+$/, '') || '/'
    const method = req.method ?? 'GET'
    if (method === 'GET' && pathname === '/events') return handleEventStream(req, res, url)
    const route = routes.find(route => route.path.test(pathname))
    return (route?.handle ?? monitoring)(req, res, url, method, pathname)
}

function reportRequestError(error) {
    log('ERROR', 'Request failed:', error instanceof Error ? error.message : error)
    if (DEBUG_LOGS && error instanceof Error) log('DEBUG', 'Request failure details:', error.stack ?? error.message)
}

// startup
const server = http.createServer((req, res) => {
    void requestHandler(req, res).catch(error => sendRequestError(res, error, reportRequestError))
})
server.requestTimeout = 60000
server.headersTimeout = 30000

server.on('error', err => {
    if ('code' in err && err.code === 'EADDRINUSE') {
        log('ERROR', `Port ${PORT} is already in use on ${HOST}. Set API_PORT to a free port.`)
        process.exit(1)
    }
    log('ERROR', 'Server error:', err instanceof Error ? err.message : err)
    process.exit(1)
})

server.listen(PORT, HOST, () => {
    log('INFO', `${pkgName} control API listening on http://${HOST}:${PORT} (headless - no UI)`)
    log('INFO', `Launch command: ${command} ${args.join(' ')}`.trim())
    log(
        'INFO',
        `Auth: ${TOKEN ? 'shared token required (API_TOKEN)' : 'DISABLED (no API_TOKEN set)'} | CORS origin: ${CORS_ORIGIN}`
    )
    log(
        'INFO',
        `Live state: memory-only; completed summaries: config/run-history.json | config writes: ${ALLOW_CONFIG_WRITE ? 'on' : 'off'} | schedule writes: ${ALLOW_SCHEDULE_WRITE ? 'on' : 'off'} | session deletion: account-scoped`
    )
    if (!TOKEN) {
        log('WARN', 'No API_TOKEN set; configure a token to authenticate dashboard connections.')
    }

    const ready = {
        host: HOST,
        port: PORT,
        pid: process.pid,
        name: pkgName,
        version: pkgVersion,
        auth: Boolean(TOKEN)
    }
    process.stdout.write(`__API_READY__ ${JSON.stringify(ready)}\n`)
})

let shuttingDown = false
async function shutdown(signal, { force = false } = {}) {
    if (shuttingDown) return
    shuttingDown = true
    pm.beginShutdown()
    log('INFO', `${signal} received - shutting down.`)
    server.close()
    try {
        if (pm.getStatus().state !== 'idle') {
            log('INFO', `Stopping active bot run${force ? ' (force)' : ''}…`)
            await pm.stop({ force })
        }
    } catch {
        // ignore
    }
    process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
