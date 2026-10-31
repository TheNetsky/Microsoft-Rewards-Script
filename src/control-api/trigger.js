import logging from '../../scripts/lib/logging.cjs'

const log = (level, ...args) => logging.logMessage('TRIGGER', level, ...args)
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getProjectRoot } from './lib.js'
import { readSchedule } from './scheduleStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = getProjectRoot(__dirname)

const configuredPort = process.env.API_PORT === undefined ? 3010 : Number(process.env.API_PORT)
if (!Number.isSafeInteger(configuredPort) || configuredPort < 1 || configuredPort > 65535) {
    log('error', 'API_PORT must be an integer between 1 and 65535.')
    process.exit(1)
}
const PORT = configuredPort
const TOKEN = process.env.API_TOKEN || ''
const configuredTimeoutHours =
    process.env.STUCK_PROCESS_TIMEOUT_HOURS === undefined ? 8 : Number(process.env.STUCK_PROCESS_TIMEOUT_HOURS)
if (!Number.isFinite(configuredTimeoutHours) || configuredTimeoutHours <= 0) {
    log('error', 'STUCK_PROCESS_TIMEOUT_HOURS must be a positive number.')
    process.exit(1)
}
const TIMEOUT_MS = configuredTimeoutHours * 60 * 60 * 1000
const POLL_MS = 15_000
const STARTUP_ATTEMPTS = 30
const STARTUP_DELAY_MS = 2_000
const REQUEST_TIMEOUT_MS = 10_000

function request(method, requestPath, body) {
    return new Promise((resolve, reject) => {
        const payload = body === undefined ? null : JSON.stringify(body)
        /** @type {import('node:http').OutgoingHttpHeaders} */
        const headers = {}
        if (payload !== null) {
            headers['Content-Type'] = 'application/json'
            headers['Content-Length'] = Buffer.byteLength(payload)
        }
        if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`
        const req = http.request({ host: '127.0.0.1', port: PORT, path: requestPath, method, headers }, res => {
            let raw = ''
            res.on('data', c => (raw += c))
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(raw) })
                } catch {
                    resolve({ status: res.statusCode, body: raw })
                }
            })
        })
        req.on('error', reject)
        req.setTimeout(REQUEST_TIMEOUT_MS, () =>
            req.destroy(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`))
        )
        req.end(payload)
    })
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms))
}

const schedule = readSchedule(projectRoot)
const startBody = schedule.excludedAccountIndexes.length
    ? { excludedAccountIndexes: schedule.excludedAccountIndexes }
    : {}

let ready = false
for (let i = 0; i < STARTUP_ATTEMPTS; i++) {
    try {
        const { status } = await request('GET', '/health')
        if (status === 200) {
            ready = true
            break
        }
        if (status === 401 || status === 403) {
            log('error', 'API authentication failed. Ensure API_TOKEN matches the control API.')
            process.exit(1)
        }
    } catch {
        /* server not up yet */
    }
    if (i < STARTUP_ATTEMPTS - 1) {
        log('info', `Waiting for API server (attempt ${i + 1}/${STARTUP_ATTEMPTS})…`)
        await sleep(STARTUP_DELAY_MS)
    }
}

if (!ready) {
    log('error', `API server did not respond after ${STARTUP_ATTEMPTS} attempts. Is API_MODE=true?`)
    process.exit(1)
}

const startDeadline = Date.now() + TIMEOUT_MS
let start = await request('POST', '/start', startBody)
while (start.status === 409) {
    if (schedule.skipIfRunning) {
        log('info', 'A run is already in progress. Skipping as configured.')
        process.exit(0)
    }
    if (Date.now() >= startDeadline) {
        log('error', 'Deferred invocation expired while waiting for the active run.')
        process.exit(1)
    }
    log('info', 'A run is already in progress. Deferring until it finishes.')
    await sleep(POLL_MS)
    start = await request('POST', '/start', startBody)
}
const { status, body } = start

if (status !== 202) {
    log('error', `POST /start failed (HTTP ${status}):`, JSON.stringify(body))
    process.exit(1)
}

log('info', 'Run started. Waiting for completion…')
const runId = body?.runId
if (typeof runId !== 'string' || !runId) {
    log('error', 'API did not return a runId. Cannot monitor or stop this run safely.')
    process.exit(1)
}

function finish(exit) {
    if (
        exit?.code === 0 &&
        !exit?.signal &&
        !exit?.error &&
        exit?.executionComplete !== false &&
        exit?.status === 'completed'
    ) {
        log('info', 'Run completed successfully.')
        process.exit(0)
    }
    if (
        exit?.executionComplete === true &&
        exit?.status === 'partial' &&
        [0, 1].includes(exit?.code) &&
        !exit?.signal &&
        !exit?.error
    ) {
        log('warn', 'Run completed with incomplete activities.')
        process.exit(0)
    }
    log('error', 'Run failed:', JSON.stringify(exit ?? { error: 'No exit status returned' }))
    process.exit(1)
}

const deadline = Date.now() + TIMEOUT_MS
while (Date.now() < deadline) {
    await sleep(Math.min(POLL_MS, Math.max(0, deadline - Date.now())))
    try {
        const { status: statusCode, body: s } = await request('GET', '/status')
        if (statusCode !== 200) continue
        if (s?.lastExit?.runId === runId) finish(s.lastExit)
        if (s?.runId !== runId) {
            const history = await request('GET', '/history')
            if (history.status !== 200) continue
            const completed = history.body?.runs?.find(run => run.runId === runId)
            if (completed) finish(completed.exit)
            log('error', 'Run is no longer active and its result is unavailable.')
            process.exit(1)
        }
    } catch {
        // Ignore
    }
}

log('error', `Timed out after ${configuredTimeoutHours}h waiting for run to finish.`)
try {
    const stopped = await request('POST', '/stop', { force: true, runId })
    log(
        'error',
        stopped.status === 202
            ? 'Requested a forced stop for the timed-out run.'
            : `Stop was not accepted (HTTP ${stopped.status}); another run will not be stopped.`
    )
} catch (err) {
    log('error', `Could not request a forced stop: ${err.message}`)
}
process.exit(1)
