import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

import { ProcessManager } from './processManager.js'
import { buildExcludedAccountsEnv, buildSingleAccountEnv, loadAccounts, mergeAccountStats } from './accounts.js'
import { validateConfig, deepMerge, readConfig, writeConfigAtomic } from './configEditor.js'
import { readSchedule, writeSchedule } from './scheduleStore.js'
import { resolveRunCommand } from './runCommand.js'
import {
    log,
    parseArgs,
    getProjectRoot,
    loadEnvFile,
    loadConfigSafe,
    redactSecrets,
    envStr,
    envInt,
    envBool
} from './lib.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = getProjectRoot(__dirname)

loadEnvFile(projectRoot)

const cliArgs = parseArgs()

let pkgVersion = '0.0.0'
let pkgName = 'microsoft-rewards-script'
try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
    pkgVersion = pkg.version ?? pkgVersion
    pkgName = pkg.name ?? pkgName
} catch {}

const HOST = envStr('API_HOST') ?? (typeof cliArgs.host === 'string' ? cliArgs.host : '127.0.0.1')
const PORT = Number(cliArgs.port) || envInt('API_PORT', 3010)
const TOKEN = envStr('API_TOKEN') ?? (typeof cliArgs.token === 'string' ? cliArgs.token : undefined)
const CORS_ORIGIN = envStr('API_CORS_ORIGIN') ?? '*'
const LOG_BUFFER = envInt('API_LOG_BUFFER', 2000)
const STOP_TIMEOUT_MS = envInt('API_STOP_TIMEOUT_MS', 15000)
const ALLOW_ENV_OVERRIDES = envBool('API_ALLOW_ENV_OVERRIDES', false)
const REVEAL_ENABLED = envBool('API_ALLOW_CONFIG_REVEAL', false)
const ALLOW_CONFIG_WRITE = envBool('API_ALLOW_CONFIG_WRITE', false)
// Writing to the crontab is a meaningfully different trust level than
// starting/stopping a run, so it gets its own opt-in flag rather than
// riding along with API_MODE=true for free.
const ALLOW_SCHEDULE_WRITE = envBool('API_ALLOW_SCHEDULE_WRITE', false)

const RUN_HISTORY = envInt('API_RUN_HISTORY', 20)
const DIAG_DIR = envStr('API_DIAGNOSTICS_DIR') ?? path.join(projectRoot, 'diagnostics')

const { command, args } = resolveRunCommand({ projectRoot })

const pm = new ProcessManager({
    command,
    args,
    cwd: projectRoot,
    stopTimeoutMs: STOP_TIMEOUT_MS,
    logBufferSize: LOG_BUFFER,
    historySize: RUN_HISTORY,
    name: pkgName,
    version: pkgVersion
})

const startedAt = Date.now()

// Forward bot stdout/stderr to the API server's own output streams so that
// container logs (docker logs) continue to show the bot's output regardless
// of which mode started the run. Controller messages (run start/stop lifecycle
// events from ProcessManager) are included - they are low-volume and useful.
pm.on('log', entry => {
    const line = (entry.raw ?? entry.message ?? '') + '\n'
    if (entry.source === 'stderr') process.stderr.write(line)
    else process.stdout.write(line)
})

function toHistoryRecord(entry) {
    return {
        startedAt: entry.startedAt,
        endedAt: entry.endedAt,
        exit: entry.exit,
        version: entry.run?.version ?? null,
        collected: entry.run?.collected ?? 0,
        accounts: (entry.run?.accounts ?? []).map(a => ({
            email: a.email,
            collected: a.collectedPoints ?? a.live?.gained ?? 0,
            success: a.success,
            error: a.error,
            streakProtection: a.streakProtection ?? null
        }))
    }
}

function applyCors(res) {
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-API-Key')
    res.setHeader('Access-Control-Max-Age', '86400')
}

function sendJson(res, status, obj) {
    const body = JSON.stringify(obj)
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(body)
}

function tokenFromReq(req, url) {
    const auth = req.headers['authorization']
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim()
    const apiKey = req.headers['x-api-key']
    if (typeof apiKey === 'string' && apiKey.trim()) return apiKey.trim()
    const q = url.searchParams.get('token')
    if (q) return q
    return null
}

function safeEqual(a, b) {
    const bufA = Buffer.from(String(a))
    const bufB = Buffer.from(String(b))
    if (bufA.length !== bufB.length) return false
    return crypto.timingSafeEqual(bufA, bufB)
}

function isAuthorized(req, url) {
    if (!TOKEN) return true
    const provided = tokenFromReq(req, url)
    if (!provided) return false
    return safeEqual(provided, TOKEN)
}

async function readJsonBody(req, limitBytes = 1_000_000) {
    return new Promise((resolve, reject) => {
        let size = 0
        const chunks = []
        req.on('data', chunk => {
            size += chunk.length
            if (size > limitBytes) {
                reject(Object.assign(new Error('Request body too large.'), { code: 'BODY_TOO_LARGE' }))
                req.destroy()
                return
            }
            chunks.push(chunk)
        })
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8').trim()
            if (!raw) return resolve({})
            try {
                resolve(JSON.parse(raw))
            } catch {
                reject(Object.assign(new Error('Invalid JSON body.'), { code: 'BAD_JSON' }))
            }
        })
        req.on('error', reject)
    })
}

function handleEventStream(req, res, url) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
    })
    if (typeof res.flushHeaders === 'function') res.flushHeaders()

    const write = frame => {
        if (!res.writableEnded) res.write(frame)
    }
    const sendEvent = (event, data, id) => {
        let frame = ''
        if (id != null) frame += `id: ${id}\n`
        frame += `event: ${event}\n`
        frame += `data: ${JSON.stringify(data)}\n\n`
        write(frame)
    }

    sendEvent('hello', pm.getStatus())

    const lastEventId = Number(req.headers['last-event-id'])
    if (Number.isFinite(lastEventId) && lastEventId > 0) {
        for (const entry of pm.getLogs({ afterId: lastEventId }).logs) {
            sendEvent('log', entry, entry.id)
        }
    } else {
        const replay = Math.max(0, Math.min(Number(url.searchParams.get('replay') ?? 100) || 0, LOG_BUFFER))
        if (replay > 0) {
            for (const entry of pm.getLogs({ limit: replay }).logs) {
                sendEvent('log', entry, entry.id)
            }
        }
    }

    const onLog = entry => sendEvent('log', entry, entry.id)
    const onStatus = status => sendEvent('status', status)
    pm.on('log', onLog)
    pm.on('status', onStatus)

    const keepAlive = setInterval(() => write(': ping\n\n'), 15000)
    if (typeof keepAlive.unref === 'function') keepAlive.unref()

    const cleanup = () => {
        clearInterval(keepAlive)
        pm.off('log', onLog)
        pm.off('status', onStatus)
        if (!res.writableEnded) res.end()
    }
    req.on('close', cleanup)
    req.on('error', cleanup)
}

const requestHandler = async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
    const pathname = url.pathname.replace(/\/+$/, '') || '/'
    const method = req.method ?? 'GET'

    applyCors(res)

    if (method === 'OPTIONS') {
        res.writeHead(204)
        return res.end()
    }

    if (TOKEN && !isAuthorized(req, url)) {
        return sendJson(res, 401, {
            error: 'Unauthorized',
            hint: 'Provide the API token via Authorization: Bearer, X-API-Key, or ?token= (the dashboard sends its CONTROL_API_TOKEN). All endpoints require it while API_TOKEN is set.'
        })
    }

    try {
        // index
        if (method === 'GET' && pathname === '/') {
            return sendJson(res, 200, {
                name: pkgName,
                version: pkgVersion,
                message: 'Control API',
                authRequired: Boolean(TOKEN),
                stateless: true,
                endpoints: [
                    'GET /health',
                    'GET /status',
                    'GET /points',
                    'GET /logs',
                    'GET /errors',
                    'GET /history',
                    'GET /accounts',
                    'GET /diagnostics',
                    'GET /events',
                    'GET /config',
                    'GET /schedule',
                    'POST /start',
                    'POST /stop',
                    'POST /restart',
                    'POST /shutdown',
                    'PUT|PATCH /config',
                    'PUT|PATCH /schedule'
                ]
            })
        }

        // health
        if (method === 'GET' && pathname === '/health') {
            return sendJson(res, 200, {
                ok: true,
                name: pkgName,
                version: pkgVersion,
                state: pm.getStatus().state,
                uptimeSec: Math.round((Date.now() - startedAt) / 1000),
                authRequired: Boolean(TOKEN)
            })
        }

        // status
        if (method === 'GET' && pathname === '/status') {
            return sendJson(res, 200, pm.getStatus())
        }

        // point read live
        if (method === 'GET' && pathname === '/points') {
            return sendJson(res, 200, pm.getPoints())
        }

        // log read
        if (method === 'GET' && pathname === '/logs') {
            const limit = clampInt(url.searchParams.get('limit'), 1, LOG_BUFFER, 200)
            const afterId = url.searchParams.has('afterId') ? Number(url.searchParams.get('afterId')) : null
            const minLevel = url.searchParams.get('level') || null
            return sendJson(
                res,
                200,
                pm.getLogs({ limit, afterId: Number.isFinite(afterId) ? afterId : null, minLevel })
            )
        }

        // error read
        if (method === 'GET' && pathname === '/errors') {
            const limit = clampInt(url.searchParams.get('limit'), 1, LOG_BUFFER, 100)
            const includeWarnings = url.searchParams.get('warnings') !== 'false'
            return sendJson(res, 200, pm.getErrors({ limit, includeWarnings }))
        }

        // historyu
        if (method === 'GET' && pathname === '/history') {
            const limit = clampInt(url.searchParams.get('limit'), 1, RUN_HISTORY, RUN_HISTORY)
            const runs = pm.getHistory().slice(0, limit).map(toHistoryRecord)
            return sendJson(res, 200, { runs, count: runs.length, inMemoryOnly: true })
        }

        // acc overv
        if (method === 'GET' && pathname === '/accounts') {
            const accounts = mergeAccountStats(loadAccounts(), pm.getHistory().map(toHistoryRecord))
            return sendJson(res, 200, { accounts, count: accounts.length })
        }

        // diag list
        if (method === 'GET' && pathname === '/diagnostics') {
            return sendJson(res, 200, listDiagnostics())
        }

        // diag read
        if (method === 'GET' && pathname.startsWith('/diagnostics/')) {
            return serveDiagnosticFile(res, pathname)
        }

        // conf read
        if (method === 'GET' && pathname === '/config') {
            const loaded = loadConfigSafe(projectRoot)
            if (!loaded) return sendJson(res, 404, { error: 'config.json not found' })
            if (loaded.data == null)
                return sendJson(res, 500, { error: 'config.json is invalid', detail: loaded.error })
            const reveal = REVEAL_ENABLED && Boolean(TOKEN) && url.searchParams.get('reveal') === '1'
            const data = reveal ? loaded.data : redactSecrets(loaded.data)
            return sendJson(res, 200, { path: loaded.path, redacted: !reveal, config: data })
        }

        // sched read
        if (method === 'GET' && pathname === '/schedule') {
            try {
                return sendJson(res, 200, { ...readSchedule(projectRoot), writable: ALLOW_SCHEDULE_WRITE })
            } catch (err) {
                return sendJson(res, 500, { error: err.message, code: err.code })
            }
        }

        // sched write
        if ((method === 'PUT' || method === 'PATCH') && pathname === '/schedule') {
            if (!ALLOW_SCHEDULE_WRITE) {
                return sendJson(res, 403, {
                    error: 'Schedule writes are disabled. Set API_ALLOW_SCHEDULE_WRITE=true to enable.'
                })
            }
            const body = await readJsonBody(req)
            if (typeof body !== 'object' || body === null || Array.isArray(body)) {
                return sendJson(res, 400, { error: 'Body must be a JSON object.' })
            }
            try {
                const updated = writeSchedule(projectRoot, body)
                pm.note(
                    'info',
                    `Schedule updated via API (${method}): ${updated.enabled ? `${updated.cron} (TZ ${updated.timezone})` : 'disabled'}.`
                )
                return sendJson(res, 200, { ...updated, writable: true })
            } catch (err) {
                const status = err.code === 'BAD_REQUEST' ? 400 : 500
                return sendJson(res, status, { error: err.message, code: err.code })
            }
        }

        // sse
        if (method === 'GET' && pathname === '/events') {
            return handleEventStream(req, res, url)
        }

        // start
        if (method === 'POST' && pathname === '/start') {
            const body = await readJsonBody(req)
            const overrides = {}
            let selectedAccount = null
            let excludedAccounts = []
            if (body.args != null) overrides.args = body.args
            if (body.env != null) {
                if (!ALLOW_ENV_OVERRIDES) {
                    return sendJson(res, 403, {
                        error: 'Per-request env overrides are disabled. Set API_ALLOW_ENV_OVERRIDES=true to enable.'
                    })
                }
                overrides.env = body.env
            }
            try {
                if (body.accountIndex != null && body.excludedAccountIndexes != null) {
                    return sendJson(res, 400, {
                        error: '`accountIndex` and `excludedAccountIndexes` cannot be used together.',
                        code: 'BAD_REQUEST'
                    })
                }
                if (body.accountIndex != null) {
                    const selection = buildSingleAccountEnv(body.accountIndex)
                    overrides.env = { ...(overrides.env || {}), ...selection.env }
                    selectedAccount = selection.account
                } else if (body.excludedAccountIndexes != null) {
                    const selection = buildExcludedAccountsEnv(body.excludedAccountIndexes)
                    overrides.env = { ...(overrides.env || {}), ...selection.env }
                    excludedAccounts = selection.excludedAccounts
                }
                const info = pm.start(overrides)
                return sendJson(res, 202, { started: true, selectedAccount, excludedAccounts, ...info })
            } catch (err) {
                if (err.code === 'ALREADY_RUNNING') return sendJson(res, 409, { error: err.message, code: err.code })
                if (err.code === 'BAD_REQUEST') return sendJson(res, 400, { error: err.message, code: err.code })
                return sendJson(res, 500, { error: err.message })
            }
        }

        // kill proc
        if (method === 'POST' && pathname === '/stop') {
            const body = await readJsonBody(req)
            const force = Boolean(body.force)
            try {
                const stopping = pm.stop({ force })
                stopping.catch(() => {})
                return sendJson(res, 202, { stopping: true, force })
            } catch (err) {
                if (err.code === 'NOT_RUNNING') return sendJson(res, 409, { error: err.message, code: err.code })
                return sendJson(res, 500, { error: err.message })
            }
        }

        // restart
        if (method === 'POST' && pathname === '/restart') {
            const body = await readJsonBody(req)
            const overrides = { force: Boolean(body.force) }
            let selectedAccount = null
            let excludedAccounts = []
            if (body.args != null) overrides.args = body.args
            if (body.env != null) {
                if (!ALLOW_ENV_OVERRIDES) {
                    return sendJson(res, 403, {
                        error: 'Per-request env overrides are disabled. Set API_ALLOW_ENV_OVERRIDES=true to enable.'
                    })
                }
                overrides.env = body.env
            }
            try {
                if (body.accountIndex != null && body.excludedAccountIndexes != null) {
                    return sendJson(res, 400, {
                        error: '`accountIndex` and `excludedAccountIndexes` cannot be used together.',
                        code: 'BAD_REQUEST'
                    })
                }
                if (body.accountIndex != null) {
                    const selection = buildSingleAccountEnv(body.accountIndex)
                    overrides.env = { ...(overrides.env || {}), ...selection.env }
                    selectedAccount = selection.account
                } else if (body.excludedAccountIndexes != null) {
                    const selection = buildExcludedAccountsEnv(body.excludedAccountIndexes)
                    overrides.env = { ...(overrides.env || {}), ...selection.env }
                    excludedAccounts = selection.excludedAccounts
                }
                const info = await pm.restart(overrides)
                return sendJson(res, 202, { restarted: true, selectedAccount, excludedAccounts, ...info })
            } catch (err) {
                if (err.code === 'BAD_REQUEST') return sendJson(res, 400, { error: err.message, code: err.code })
                return sendJson(res, 500, { error: err.message })
            }
        }

        // conf
        if ((method === 'PUT' || method === 'PATCH') && pathname === '/config') {
            if (!ALLOW_CONFIG_WRITE) {
                return sendJson(res, 403, {
                    error: 'Config writes are disabled. Set API_ALLOW_CONFIG_WRITE=true to enable.'
                })
            }
            const body = await readJsonBody(req)
            if (typeof body !== 'object' || body === null || Array.isArray(body)) {
                return sendJson(res, 400, { error: 'Body must be a JSON object.' })
            }
            let candidate
            try {
                candidate = method === 'PATCH' ? deepMerge(readConfig(projectRoot).data, body) : body
            } catch (err) {
                return sendJson(res, 500, {
                    error: `Could not read current config: ${err instanceof Error ? err.message : err}`
                })
            }
            const result = await validateConfig(candidate, {
                projectRoot,
                validatorModule: envStr('API_VALIDATOR_MODULE')
            })
            if (!result.ok) {
                return sendJson(res, 422, { error: 'Config validation failed', via: result.via, errors: result.errors })
            }
            try {
                const written = writeConfigAtomic(projectRoot, result.value ?? candidate)
                pm.note('info', `config.json updated via API (${method}); applies on the next run.`)
                return sendJson(res, 200, { ok: true, path: written, via: result.via, appliesOnNextRun: true })
            } catch (err) {
                return sendJson(res, 500, {
                    error: `Could not write config: ${err instanceof Error ? err.message : err}`
                })
            }
        }

        // stop api
        if (method === 'POST' && pathname === '/shutdown') {
            const body = await readJsonBody(req)
            sendJson(res, 202, { shuttingDown: true, stoppingBot: pm.getStatus().state !== 'idle' })
            setTimeout(() => void shutdown('API /shutdown', { force: Boolean(body.force) }), 50)
            return
        }

        return sendJson(res, 404, { error: 'Not found', path: pathname })
    } catch (err) {
        if (err && (err.code === 'BAD_JSON' || err.code === 'BODY_TOO_LARGE')) {
            return sendJson(res, 400, { error: err.message, code: err.code })
        }
        log('ERROR', 'Unhandled request error:', err instanceof Error ? err.stack : err)
        if (!res.headersSent) return sendJson(res, 500, { error: 'Internal server error' })
    }
}

function clampInt(value, min, max, fallback) {
    const n = parseInt(value, 10)
    if (!Number.isFinite(n)) return fallback
    return Math.max(min, Math.min(max, n))
}

// diagn
const DIAG_FILES = {
    'screenshot.png': 'image/png',
    'error.txt': 'text/plain; charset=utf-8',
    'dump.html': 'application/octet-stream'
}

function listDiagnostics() {
    let dirents = []
    try {
        dirents = fs
            .readdirSync(DIAG_DIR, { withFileTypes: true })
            .filter(d => d.isDirectory() && d.name.startsWith('error-'))
    } catch {
        return { dir: DIAG_DIR, count: 0, entries: [] }
    }
    const entries = dirents
        .map(d => {
            const full = path.join(DIAG_DIR, d.name)
            let files = []
            let createdAt = null
            let error = null
            try {
                files = fs.readdirSync(full)
            } catch {}
            try {
                createdAt = fs.statSync(full).mtime.toISOString()
            } catch {}
            if (files.includes('error.txt')) {
                try {
                    error = fs.readFileSync(path.join(full, 'error.txt'), 'utf8').slice(0, 2000)
                } catch {}
            }
            return {
                name: d.name,
                createdAt,
                hasScreenshot: files.includes('screenshot.png'),
                hasHtml: files.includes('dump.html'),
                hasError: files.includes('error.txt'),
                error
            }
        })
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    return { dir: DIAG_DIR, count: entries.length, entries }
}

function serveDiagnosticFile(res, pathname) {
    const parts = pathname.slice('/diagnostics/'.length).split('/').filter(Boolean).map(decodeURIComponent)
    if (parts.length !== 2) return sendJson(res, 404, { error: 'Not found' })
    const [name, file] = parts
    if (!/^error-[A-Za-z0-9._:-]+$/.test(name) || !(file in DIAG_FILES)) {
        return sendJson(res, 400, { error: 'Invalid diagnostics path' })
    }
    const full = path.join(DIAG_DIR, name, file)
    if (!path.resolve(full).startsWith(path.resolve(DIAG_DIR) + path.sep)) {
        return sendJson(res, 400, { error: 'Invalid diagnostics path' })
    }
    if (!fs.existsSync(full)) return sendJson(res, 404, { error: 'Not found' })
    const headers = { 'Content-Type': DIAG_FILES[file] }
    if (file === 'dump.html') headers['Content-Disposition'] = `attachment; filename="${name}-dump.html"`
    res.writeHead(200, headers)
    fs.createReadStream(full).pipe(res)
}

// startup
const server = http.createServer(requestHandler)

server.on('error', err => {
    if (err && err.code === 'EADDRINUSE') {
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
        `Stateless: writes nothing to disk except schedule.json when enabled | config writes: ${ALLOW_CONFIG_WRITE ? 'on' : 'off'} | schedule writes: ${ALLOW_SCHEDULE_WRITE ? 'on' : 'off'}`
    )
    if (!TOKEN) {
        const loopback = HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1'
        log(
            loopback ? 'WARN' : 'ERROR',
            loopback
                ? 'No API_TOKEN set - the API is open to anything on this machine. Set API_TOKEN and give the dashboard the same value as CONTROL_API_TOKEN.'
                : 'API is bound to a non-loopback address WITHOUT a token - anyone who can reach this port can start/stop the bot and read your logs. Set API_TOKEN.'
        )
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
