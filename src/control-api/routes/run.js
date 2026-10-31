import { resolveAccountSelection } from '../accounts.js'
import { readJsonObject, sendJson, rejectUnknownFields } from '../http.js'

function readForce(body) {
    if ('force' in body && typeof body.force !== 'boolean') {
        throw Object.assign(new Error('`force` must be a boolean.'), { code: 'BAD_REQUEST' })
    }
    return body.force ?? false
}

export function createRunRoutes({ pm, allowEnvOverrides, shutdown }) {
    return async (req, res, url, method, pathname) => {
        // start or restart
        if (method === 'POST' && (pathname === '/start' || pathname === '/restart')) {
            const restarting = pathname === '/restart'
            const body = await readJsonObject(req)
            rejectUnknownFields(
                body,
                restarting
                    ? ['args', 'env', 'accountIndex', 'excludedAccountIndexes', 'force']
                    : ['args', 'env', 'accountIndex', 'excludedAccountIndexes']
            )
            const overrides = restarting ? { force: readForce(body) } : {}
            if (body.args != null) overrides.args = body.args
            if (body.env != null) {
                if (!allowEnvOverrides) {
                    return sendJson(res, 403, {
                        error: 'Per-request env overrides are disabled. Set API_ALLOW_ENV_OVERRIDES=true to enable.'
                    })
                }
                overrides.env = body.env
            }
            try {
                const effectiveEnv = pm.validateOverrides(overrides)
                const selection = resolveAccountSelection(body, effectiveEnv)
                overrides.env = { ...(overrides.env || {}), ...selection.env }
                const info = restarting ? await pm.restart(overrides) : pm.start(overrides)
                return sendJson(res, 202, {
                    [restarting ? 'restarted' : 'started']: true,
                    selectedAccount: selection.selectedAccount,
                    excludedAccounts: selection.excludedAccounts,
                    ...info
                })
            } catch (err) {
                if (err.code === 'ALREADY_RUNNING') return sendJson(res, 409, { error: err.message, code: err.code })
                if (err.code === 'SHUTTING_DOWN') return sendJson(res, 503, { error: err.message, code: err.code })
                if (err.code === 'BAD_REQUEST') return sendJson(res, 400, { error: err.message, code: err.code })
                return sendJson(res, 500, { error: err.message })
            }
        }

        // kill proc
        if (method === 'POST' && pathname === '/stop') {
            const body = await readJsonObject(req)
            rejectUnknownFields(body, ['force', 'runId'])
            const force = readForce(body)
            if (body.runId !== undefined && (typeof body.runId !== 'string' || !body.runId.trim())) {
                return sendJson(res, 400, { error: 'runId must be a nonempty string when provided.' })
            }
            try {
                const stopping = pm.stop({ force, runId: body.runId })
                stopping.catch(() => {})
                return sendJson(res, 202, { stopping: true, force })
            } catch (err) {
                if (err.code === 'NOT_RUNNING' || err.code === 'RUN_CHANGED')
                    return sendJson(res, 409, { error: err.message, code: err.code })
                return sendJson(res, 500, { error: err.message })
            }
        }

        // stop api
        if (method === 'POST' && pathname === '/shutdown') {
            const body = await readJsonObject(req)
            rejectUnknownFields(body, ['force'])
            const force = readForce(body)
            pm.beginShutdown()
            sendJson(res, 202, { shuttingDown: true, stoppingBot: pm.getStatus().state !== 'idle' })
            setTimeout(() => void shutdown('API /shutdown', { force }), 50)
            return
        }

        return sendJson(res, 404, { error: 'Not found', path: pathname })
    }
}
