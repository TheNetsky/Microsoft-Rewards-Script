/**
 * Triggers a run via the local API server and waits for it to finish.
 *
 * Called by scripts/docker/run_daily.sh when API_MODE=true so that cron
 * delegates to the API server rather than running npm start directly.  The
 * API server has full visibility over every run, scheduled or
 * manually triggered, and the dashboard can stream logs, stop a run, or
 * inspect history regardless of how it was started.
 *
 */

import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getProjectRoot } from './lib.js'
import { readSchedule } from './scheduleStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = getProjectRoot(__dirname)

const configuredPort = process.env.API_PORT === undefined ? 3010 : Number(process.env.API_PORT)
if (!Number.isSafeInteger(configuredPort) || configuredPort < 1 || configuredPort > 65535) {
    console.error('[trigger] API_PORT must be an integer between 1 and 65535.')
    process.exit(1)
}
const PORT = configuredPort
const TOKEN = process.env.API_TOKEN || ''
const configuredTimeoutHours =
    process.env.STUCK_PROCESS_TIMEOUT_HOURS === undefined ? 8 : Number(process.env.STUCK_PROCESS_TIMEOUT_HOURS)
if (!Number.isFinite(configuredTimeoutHours) || configuredTimeoutHours <= 0) {
    console.error('[trigger] STUCK_PROCESS_TIMEOUT_HOURS must be a positive number.')
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

// Scheduled runs (cron -> run_daily.sh -> here) honor whichever accounts are
// currently excluded in config/schedule.json, if the dashboard (or a manual
// PUT /schedule call) has ever saved one. RUN_ON_START's initial kickoff goes
// through this same path, so it respects exclusions too rather than always
// running every account regardless of the saved schedule.
function buildStartBody() {
    try {
        const schedule = readSchedule(projectRoot)
        if (schedule.excludedAccountIndexes?.length) {
            return { excludedAccountIndexes: schedule.excludedAccountIndexes }
        }
    } catch (err) {
        console.warn(`[trigger] Could not read schedule.json, running with all accounts: ${err.message}`)
    }
    return {}
}

// Wait for the API server to be ready.  Handles the RUN_ON_START race where
// trigger.js is launched in the background before the API server has started.
let ready = false
for (let i = 0; i < STARTUP_ATTEMPTS; i++) {
    try {
        const { status } = await request('GET', '/health')
        if (status === 200) {
            ready = true
            break
        }
        if (status === 401 || status === 403) {
            console.error('[trigger] API authentication failed. Ensure API_TOKEN matches the control API.')
            process.exit(1)
        }
    } catch {
        /* server not up yet */
    }
    if (i < STARTUP_ATTEMPTS - 1) {
        console.log(`[trigger] Waiting for API server (attempt ${i + 1}/${STARTUP_ATTEMPTS})…`)
        await sleep(STARTUP_DELAY_MS)
    }
}

if (!ready) {
    console.error(`[trigger] API server did not respond after ${STARTUP_ATTEMPTS} attempts. Is API_MODE=true?`)
    process.exit(1)
}

// Trigger the run.
const { status, body } = await request('POST', '/start', buildStartBody())

if (status === 409) {
    // A run is already in progress - the dashboard or a previous cron invocation
    // beat us to it.  Exit cleanly so the lockfile is released.
    console.log('[trigger] A run is already in progress (409 Conflict). Skipping.')
    process.exit(0)
}

if (status !== 202) {
    console.error(`[trigger] POST /start failed (HTTP ${status}):`, JSON.stringify(body))
    process.exit(1)
}

console.log('[trigger] Run started. Waiting for completion…')

// Poll /status until the run finishes or the timeout is reached.
const deadline = Date.now() + TIMEOUT_MS
while (Date.now() < deadline) {
    await sleep(POLL_MS)
    try {
        const { body: s } = await request('GET', '/status')
        if (s?.state === 'idle') {
            const exit = s.lastExit
            if (exit?.code === 0 && !exit?.signal && !exit?.error) {
                console.log('[trigger] Run completed successfully.')
                process.exit(0)
            }
            console.error('[trigger] Run failed:', JSON.stringify(exit ?? { error: 'No exit status returned' }))
            process.exit(1)
        }
    } catch {
        /* momentary blip - keep polling */
    }
}

console.error(`[trigger] Timed out after ${configuredTimeoutHours}h waiting for run to finish.`)
try {
    await request('POST', '/stop', { force: true })
    console.error('[trigger] Requested a forced stop for the timed-out run.')
} catch (err) {
    console.error(`[trigger] Could not request a forced stop: ${err.message}`)
}
process.exit(1)
