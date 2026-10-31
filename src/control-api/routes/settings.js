import { readJsonObject, sendJson, rejectUnknownFields } from '../http.js'
import fs from 'node:fs'
import {
    validateConfig,
    deepMerge,
    readConfig,
    writeConfigAtomic,
    diffConfig,
    syncMissingDefaults,
    configRevision
} from '../configEditor.js'
import { readSchedule, writeSchedule } from '../scheduleStore.js'
import { loadConfigSafe, redactSecrets } from '../lib.js'

export function createSettingsRoutes({
    projectRoot,
    pm,
    revealEnabled: REVEAL_ENABLED,
    token: TOKEN,
    allowConfigWrite: ALLOW_CONFIG_WRITE,
    allowScheduleWrite: ALLOW_SCHEDULE_WRITE
}) {
    return async (req, res, url, method, pathname) => {
        if (method === 'GET' && pathname === '/config') {
            const loaded = loadConfigSafe(projectRoot)
            if (!loaded) return sendJson(res, 404, { error: 'config.json not found' })
            if (loaded.data == null)
                return sendJson(res, 500, { error: 'config.json is invalid', detail: loaded.error })
            const reveal = REVEAL_ENABLED && Boolean(TOKEN) && url.searchParams.get('reveal') === '1'
            const data = reveal ? loaded.data : redactSecrets(loaded.data)
            const revision = configRevision(loaded.data)
            res.setHeader('ETag', revision)
            return sendJson(res, 200, { path: loaded.path, redacted: !reveal, config: data, revision })
        }

        if (method === 'GET' && pathname === '/config/diff') {
            try {
                const { addedKeys } = await diffConfig(projectRoot)
                return sendJson(res, 200, { addedKeys, upToDate: addedKeys.length === 0 })
            } catch (err) {
                return sendJson(res, err.status ?? 500, {
                    error: err instanceof Error ? err.message : String(err),
                    code: err.code
                })
            }
        }

        if (method === 'POST' && pathname === '/config/sync') {
            if (!ALLOW_CONFIG_WRITE) {
                return sendJson(res, 403, {
                    error: 'Config writes are disabled. Set API_ALLOW_CONFIG_WRITE=true to enable.'
                })
            }
            const body = await readJsonObject(req)
            rejectUnknownFields(body, [])
            try {
                const result = await syncMissingDefaults(projectRoot, {
                    expectedRevision: req.headers['if-match']
                })
                if (result.patched) {
                    pm.note(
                        'info',
                        `config.json patched with ${result.addedKeys.length} missing key(s) via API /config/sync.`
                    )
                }
                res.setHeader('ETag', result.revision)
                return sendJson(res, 200, { ...result, appliesOnNextRun: true })
            } catch (err) {
                return sendJson(res, err.status ?? 500, {
                    error: err instanceof Error ? err.message : String(err),
                    code: err.code
                })
            }
        }

        if (method === 'GET' && pathname === '/schedule') {
            try {
                const supported = fs.existsSync('/etc/cron.d/microsoft-rewards-cron.template')
                return sendJson(res, 200, {
                    ...readSchedule(projectRoot),
                    supported,
                    backend: supported ? 'docker-cron' : null,
                    writable: ALLOW_SCHEDULE_WRITE && supported
                })
            } catch (err) {
                return sendJson(res, 500, { error: err.message, code: err.code })
            }
        }

        if ((method === 'PUT' || method === 'PATCH') && pathname === '/schedule') {
            if (!ALLOW_SCHEDULE_WRITE) {
                return sendJson(res, 403, {
                    error: 'Schedule writes are disabled. Set API_ALLOW_SCHEDULE_WRITE=true to enable.'
                })
            }
            const body = await readJsonObject(req)
            try {
                const updated = writeSchedule(projectRoot, body)
                pm.note(
                    'info',
                    `Schedule updated via API (${method}): ${updated.enabled ? `${updated.cron} (TZ ${updated.timezone})` : 'disabled'}.`
                )
                return sendJson(res, 200, { ...updated, writable: true })
            } catch (err) {
                const status = err.code === 'BAD_REQUEST' ? 400 : err.code === 'SCHEDULER_UNAVAILABLE' ? 503 : 500
                return sendJson(res, status, { error: err.message, code: err.code })
            }
        }

        if ((method === 'PUT' || method === 'PATCH') && pathname === '/config') {
            if (!ALLOW_CONFIG_WRITE) {
                return sendJson(res, 403, {
                    error: 'Config writes are disabled. Set API_ALLOW_CONFIG_WRITE=true to enable.'
                })
            }
            const body = await readJsonObject(req)
            let candidate
            let original
            try {
                original = readConfig(projectRoot).data
                if (req.headers['if-match'] && req.headers['if-match'] !== configRevision(original)) {
                    return sendJson(res, 412, { error: 'Config revision changed; reload before saving.' })
                }
                candidate = method === 'PATCH' ? deepMerge(original, body) : body
                candidate = preserveRedacted(original, candidate)
            } catch (err) {
                return sendJson(res, err.status ?? (err.code === 'BAD_REQUEST' ? 400 : 500), {
                    error: `Could not prepare config update: ${err instanceof Error ? err.message : err}`,
                    code: err.code
                })
            }
            const result = await validateConfig(candidate, { projectRoot })
            if (!result.ok) {
                return sendJson(res, 422, { error: 'Config validation failed', via: result.via, errors: result.errors })
            }
            try {
                if (JSON.stringify(readConfig(projectRoot).data) !== JSON.stringify(original)) {
                    return sendJson(res, 409, { error: 'Config changed while validating. Reload and retry.' })
                }
                const written = writeConfigAtomic(projectRoot, result.value ?? candidate)
                const revision = configRevision(result.value ?? candidate)
                res.setHeader('ETag', revision)
                for (const warning of result.warnings ?? []) pm.note('warn', warning)
                pm.note('info', `config.json updated via API (${method}); applies on the next run.`)
                return sendJson(res, 200, {
                    ok: true,
                    path: written,
                    via: result.via,
                    appliesOnNextRun: true,
                    warnings: result.warnings ?? [],
                    config: redactSecrets(result.value ?? candidate),
                    revision
                })
            } catch (err) {
                return sendJson(res, 500, {
                    error: `Could not write config: ${err instanceof Error ? err.message : err}`
                })
            }
        }

        return sendJson(res, 405, { error: 'Method not allowed' })
    }
}

function preserveRedacted(previous, candidate) {
    if (candidate === '***REDACTED***') return previous
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return candidate
    return Object.fromEntries(
        Object.entries(candidate).map(([key, value]) => [key, preserveRedacted(previous?.[key], value)])
    )
}
