import { readJsonObject, rejectUnknownFields, requestError, sendJson } from '../http.js'
import { validateConfig, readConfig } from '../configEditor.js'
import { loadAccounts, mergeAccountStats } from '../accounts.js'
import { toHistoryRecord } from '../history.js'
import { API_ENDPOINTS } from '../endpoints.js'

const DOCKER_LOG_LINE_RE =
    /^\[[^\]]+\] \[MAIN\] \[(?:DEBUG|INFO|WARN|ERROR)\] MAIN \[(?:ENTRYPOINT|CONFIG-SYNC|CONFIG-OVERRIDES|SCHEDULE|RUN_DAILY\.SH)\] |^\[(?:entrypoint|config-sync|config-overrides)\]\s|^\[[^\]]+\]\s\[run_daily\.sh\]\s/

export function createMonitoringRoutes({ projectRoot, pm, name, version, token, startedAt, logBuffer, historySize }) {
    return async (req, res, url, method, pathname) => {
        if (method === 'POST' && pathname === '/docker-log') {
            const body = await readJsonObject(req)
            rejectUnknownFields(body, ['line'])
            if (
                typeof body.line !== 'string' ||
                !body.line.trim() ||
                body.line.length > 16384 ||
                /[\r\n\0]/.test(body.line) ||
                !DOCKER_LOG_LINE_RE.test(body.line)
            ) {
                throw requestError('`line` must be one supported Docker wrapper log line.')
            }
            pm.dockerLog(body.line)
            return sendJson(res, 202, { accepted: true })
        }

        if (method === 'GET' && pathname === '/') {
            return sendJson(res, 200, {
                name: name,
                version: version,
                message: 'Control API',
                authRequired: Boolean(token),
                stateless: false,
                endpoints: API_ENDPOINTS
            })
        }

        if (method === 'GET' && pathname === '/plan') {
            const result = await validateConfig(readConfig(projectRoot).data, {
                projectRoot,
                effectiveEnv: process.env
            })
            if (!result.ok) return sendJson(res, 422, result)
            const module = await import('../../config/ExecutionPlan.js')
            return sendJson(res, 200, {
                ...module.describeExecutionPlan(result.value),
                configWarnings: result.warnings ?? []
            })
        }

        if (method === 'GET' && pathname === '/health') {
            return sendJson(res, 200, {
                ok: true,
                name: name,
                version: version,
                state: pm.getStatus().state,
                uptimeSec: Math.round((Date.now() - startedAt) / 1000),
                authRequired: Boolean(token)
            })
        }

        if (method === 'GET' && pathname === '/status') {
            return sendJson(res, 200, pm.getStatus())
        }

        if (method === 'GET' && pathname === '/points') {
            return sendJson(res, 200, pm.getPoints())
        }

        if (method === 'GET' && pathname === '/logs') {
            const limit = clampInt(url.searchParams.get('limit'), 1, logBuffer, 200)
            const afterId = url.searchParams.has('afterId') ? Number(url.searchParams.get('afterId')) : null
            if (
                afterId !== null &&
                (!url.searchParams.get('afterId')?.trim() || !Number.isSafeInteger(afterId) || afterId < 0)
            ) {
                return sendJson(res, 400, {
                    error: '`afterId` must be a non-negative safe integer.',
                    code: 'BAD_REQUEST'
                })
            }
            const minLevel = url.searchParams.get('level') || null
            if (minLevel && !['debug', 'info', 'warn', 'error'].includes(minLevel)) {
                return sendJson(res, 400, {
                    error: '`level` must be one of: debug, info, warn, error.',
                    code: 'BAD_REQUEST'
                })
            }
            return sendJson(res, 200, pm.getLogs({ limit, afterId, minLevel }))
        }

        if (method === 'GET' && pathname === '/errors') {
            const limit = clampInt(url.searchParams.get('limit'), 1, logBuffer, 100)
            const includeWarnings = url.searchParams.get('warnings') !== 'false'
            return sendJson(res, 200, pm.getErrors({ limit, includeWarnings }))
        }

        if (method === 'GET' && pathname === '/history') {
            const limit = clampInt(url.searchParams.get('limit'), 1, historySize, historySize)
            const runs = pm.getHistory().slice(0, limit).map(toHistoryRecord)
            return sendJson(res, 200, { runs, count: runs.length, inMemoryOnly: false })
        }

        if (method === 'GET' && pathname === '/accounts') {
            const accounts = mergeAccountStats(
                loadAccounts(),
                pm.getHistory().map(toHistoryRecord),
                pm.getPoints().accounts
            )
            return sendJson(res, 200, { accounts, count: accounts.length })
        }

        return sendJson(res, 404, { error: 'Not found', path: pathname })
    }
}

function clampInt(value, min, max, fallback) {
    const n = parseInt(value, 10)
    if (!Number.isFinite(n)) return fallback
    return Math.max(min, Math.min(max, n))
}
