import { listStoredSessions, deleteStoredSessions } from '../sessionStore.js'
import { loadConfigSafe } from '../lib.js'
import { sendJson, requestError, containsControlCharacters, readJsonObject, rejectUnknownFields } from '../http.js'
import { resolveAccountSelection } from '../accounts.js'
import { resolveSessionOptions } from '../../session/SessionGeneration.js'

export function createSessionRoutes({ projectRoot, pm, allowEnvOverrides = false }) {
    return async (req, res, url, method, pathname) => {
        if (method === 'POST' && pathname === '/sessions/regenerate') {
            const body = await readJsonObject(req)
            rejectUnknownFields(body, ['accountIndex', 'excludedAccountIndexes', 'platform', 'fresh', 'env'])
            const options = resolveSessionOptions(body)
            if (body.env != null && !allowEnvOverrides) {
                return sendJson(res, 403, {
                    error: 'Per-request env overrides are disabled. Set API_ALLOW_ENV_OVERRIDES=true to enable.'
                })
            }
            const overrides = { env: body.env }
            const effectiveEnv = pm.validateOverrides(overrides)
            const selection = resolveAccountSelection(body, effectiveEnv)
            if (!selection.accounts.length) throw requestError('No accounts configured for session regeneration.')
            if (
                new Set(selection.accounts.map(account => account.email.toLowerCase())).size !==
                selection.accounts.length
            )
                throw requestError('Selected account slots must have distinct email addresses.')
            configuredSessionPath(projectRoot)
            try {
                const info = pm.startSessions({
                    ...options,
                    accounts: selection.accounts,
                    env: { ...(body.env || {}), ...selection.env }
                })
                return sendJson(res, 202, {
                    regenerating: true,
                    ...options,
                    accounts: selection.accounts,
                    selectedAccount: selection.selectedAccount,
                    excludedAccounts: selection.excludedAccounts,
                    ...info
                })
            } catch (error) {
                if (error.code === 'ALREADY_RUNNING') throw requestError(error.message, error.code, 409)
                if (['SHUTTING_DOWN', 'SESSION_RUNNER_UNAVAILABLE'].includes(error.code))
                    throw requestError(error.message, error.code, 503)
                throw error
            }
        }

        // session list
        if (method === 'GET' && pathname === '/sessions') {
            const sessionPath = configuredSessionPath(projectRoot)
            return sendJson(res, 200, listStoredSessions(projectRoot, sessionPath))
        }

        // account-specific session delete; intentionally no delete-all route
        if (method === 'DELETE' && pathname === '/sessions') {
            return sendJson(res, 400, {
                error: 'An account email is required. Use DELETE /sessions/:email.',
                code: 'EMAIL_REQUIRED'
            })
        }

        if (method === 'DELETE' && pathname.startsWith('/sessions/')) {
            if (pm.getStatus().state !== 'idle') {
                return sendJson(res, 409, {
                    error: 'Cannot delete sessions while a bot run is active. Stop the run first.',
                    code: 'RUN_ACTIVE'
                })
            }

            let email
            try {
                email = decodeURIComponent(pathname.slice('/sessions/'.length)).trim()
            } catch {
                return sendJson(res, 400, { error: 'The session email path is not valid URL encoding.' })
            }
            if (!email || email.length > 320 || !email.includes('@') || containsControlCharacters(email)) {
                return sendJson(res, 400, {
                    error: 'A valid account email is required in DELETE /sessions/:email.',
                    code: 'INVALID_EMAIL'
                })
            }

            const sessionPath = configuredSessionPath(projectRoot)
            const result = deleteStoredSessions(projectRoot, sessionPath, email)
            if (!result.found) {
                return sendJson(res, 404, {
                    error: `No stored sessions found for ${email}.`,
                    code: 'SESSION_NOT_FOUND'
                })
            }

            pm.note('info', `Deleted ${result.removed} stored session row(s) for ${result.email} via API.`)
            return sendJson(res, 200, { deleted: true, ...result })
        }

        return sendJson(res, 404, { error: 'Not found', path: pathname })
    }
}

function configuredSessionPath(projectRoot) {
    const loaded = loadConfigSafe(projectRoot)
    if (!loaded) throw requestError('config.json not found', 'CONFIG_NOT_FOUND', 404)
    if (loaded.data == null) throw Object.assign(new Error('config.json is invalid'), { code: 'CONFIG_INVALID' })
    return typeof loaded.data.sessionPath === 'string' ? loaded.data.sessionPath : 'sessions'
}
