/**
 * 通过本地 API 服务器触发运行并等待其完成。
 *
 * API_MODE=true 时由 scripts/docker/run_daily.sh 调用，使 cron 将任务交给 API 服务器，
 * 而不是直接运行 npm start。API 服务器可以完整查看计划运行和手动触发的所有任务，
 * 仪表盘也可以无论任务如何启动，都流式读取日志、停止运行或查看历史记录。
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

// 计划运行（cron -> run_daily.sh -> 此处）会遵守 config/schedule.json 中当前排除的账号，
// 前提是仪表盘（或手动的 PUT /schedule 调用）曾保存过计划。
// RUN_ON_START 的初始启动也经过同一路径，因此同样会遵守排除项，
// 不会无视已保存计划而始终运行所有账号。
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

// 等待 API 服务器就绪。处理 API 服务器尚未启动时 trigger.js 已在后台启动的
// RUN_ON_START 竞态。
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
        /* 服务器尚未启动 */
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

// 触发运行。
const { status, body } = await request('POST', '/start', buildStartBody())

if (status === 409) {
    // 已有运行正在进行，说明仪表盘或之前的 cron 调用已经先触发了任务。
    // 正常退出，以便释放锁文件。
    console.log('[trigger] A run is already in progress (409 Conflict). Skipping.')
    process.exit(0)
}

if (status !== 202) {
    console.error(`[trigger] POST /start failed (HTTP ${status}):`, JSON.stringify(body))
    process.exit(1)
}

console.log('[trigger] Run started. Waiting for completion…')

// 轮询 /status，直到运行完成或达到超时时间。
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
        /* 短暂波动，继续轮询 */
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
