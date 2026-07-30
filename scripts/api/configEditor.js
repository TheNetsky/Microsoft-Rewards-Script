import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

function resolveConfigPath(projectRoot) {
    const candidates = [
        path.join(projectRoot, 'config.json'),
        path.join(projectRoot, 'dist', 'config.json'),
        path.join(projectRoot, 'src', 'config.json'),
        path.resolve(process.cwd(), 'config.json')
    ]
    return candidates.find(p => fs.existsSync(p)) ?? path.join(projectRoot, 'config.json')
}

async function loadBotValidator(projectRoot, override) {
    const modPath = override || path.join(projectRoot, 'dist', 'util', 'Validator.js')
    if (!override && !fs.existsSync(modPath)) return null
    try {
        const mod = await import(pathToFileURL(path.resolve(modPath)).href)
        const m = mod.default && !mod.validateConfig ? mod.default : mod
        if (m.ConfigSchema && typeof m.ConfigSchema.parse === 'function') {
            return { via: 'bot-ConfigSchema', run: cfg => m.ConfigSchema.parse(cfg) }
        }
        if (typeof m.validateConfig === 'function') {
            return { via: 'bot-validateConfig', run: cfg => m.validateConfig(cfg) }
        }
        throw new Error('module has no validateConfig function or ConfigSchema')
    } catch (error) {
        throw new Error(
            `Could not load bot config validator at ${modPath}: ${error instanceof Error ? error.message : String(error)}`
        )
    }
}

const BOOL_KEYS = [
    'headless',
    'errorDiagnostics',
    'ensureStreakProtection',
    'autoClaimPunchcardRewards',
    'skipNonPointTasks',
    'searchOnBingLocalQueries',
    'debugLogs'
]

function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateBooleanObject(value, path, errors) {
    if (!isObject(value)) {
        errors.push(`${path} must be an object`)
        return
    }
    for (const [key, item] of Object.entries(value)) {
        if (typeof item !== 'boolean') errors.push(`${path}.${key} must be a boolean`)
    }
}

function validateNumberOrString(value, path, errors) {
    if (typeof value !== 'number' && typeof value !== 'string') {
        errors.push(`${path} must be a number or string`)
    }
}

function validateDelay(value, path, errors) {
    if (!isObject(value)) {
        errors.push(`${path} must be an object`)
        return
    }
    if ('min' in value) validateNumberOrString(value.min, `${path}.min`, errors)
    if ('max' in value) validateNumberOrString(value.max, `${path}.max`, errors)
}

function validateLogFilter(value, path, errors) {
    if (!isObject(value)) {
        errors.push(`${path} must be an object`)
        return
    }
    if ('enabled' in value && typeof value.enabled !== 'boolean') errors.push(`${path}.enabled must be a boolean`)
    if ('mode' in value && !['whitelist', 'blacklist'].includes(value.mode)) {
        errors.push(`${path}.mode must be "whitelist" or "blacklist"`)
    }
    for (const key of ['levels', 'keywords', 'regexPatterns']) {
        if (key in value && (!Array.isArray(value[key]) || value[key].some(item => typeof item !== 'string'))) {
            errors.push(`${path}.${key} must be an array of strings`)
        }
    }
}

function structuralValidate(cfg) {
    const errors = []
    if (!isObject(cfg)) {
        return { ok: false, errors: ['config must be a JSON object'] }
    }
    if (typeof cfg.sessionPath !== 'string') errors.push('sessionPath must be a string')
    if (!Number.isInteger(cfg.clusters) || cfg.clusters < 0) errors.push('clusters must be a non-negative integer')
    for (const k of BOOL_KEYS) {
        if (k in cfg && typeof cfg[k] !== 'boolean') errors.push(`${k} must be a boolean`)
    }
    if ('workers' in cfg) {
        validateBooleanObject(cfg.workers, 'workers', errors)
    }
    if ('activities' in cfg) validateBooleanObject(cfg.activities, 'activities', errors)
    if ('experimental' in cfg) validateBooleanObject(cfg.experimental, 'experimental', errors)
    if ('globalTimeout' in cfg) validateNumberOrString(cfg.globalTimeout, 'globalTimeout', errors)
    if ('accountDelay' in cfg) validateDelay(cfg.accountDelay, 'accountDelay', errors)

    if ('searchSettings' in cfg) {
        if (!isObject(cfg.searchSettings)) {
            errors.push('searchSettings must be an object')
        } else {
            const search = cfg.searchSettings
            for (const key of [
                'scrollRandomResults',
                'clickRandomResults',
                'runOnZeroPoints',
                'parallelSearching',
                'clusterSearch'
            ]) {
                if (key in search && typeof search[key] !== 'boolean') {
                    errors.push(`searchSettings.${key} must be a boolean`)
                }
            }
            if ('maxBonusSearches' in search && typeof search.maxBonusSearches !== 'number') {
                errors.push('searchSettings.maxBonusSearches must be a number')
            }
            if (
                'queryEngines' in search &&
                (!Array.isArray(search.queryEngines) ||
                    search.queryEngines.some(
                        engine =>
                            typeof engine !== 'string' ||
                            !/^(?:google|wikipedia|wikirandom|hackernews|reddit|local|rss(?:\.[A-Za-z0-9_-]+){0,2})$/.test(
                                engine
                            )
                    ))
            ) {
                errors.push('searchSettings.queryEngines contains an invalid query source')
            }
            if ('searchResultVisitTime' in search) {
                validateNumberOrString(search.searchResultVisitTime, 'searchSettings.searchResultVisitTime', errors)
            }
            for (const delayKey of ['searchDelay', 'readDelay']) {
                if (!(delayKey in search)) continue
                validateDelay(search[delayKey], `searchSettings.${delayKey}`, errors)
            }
        }
    }

    if ('proxy' in cfg) {
        if (!isObject(cfg.proxy)) errors.push('proxy must be an object')
        else if ('queryEngine' in cfg.proxy && typeof cfg.proxy.queryEngine !== 'boolean') {
            errors.push('proxy.queryEngine must be a boolean')
        }
    }
    if ('consoleLogFilter' in cfg) validateLogFilter(cfg.consoleLogFilter, 'consoleLogFilter', errors)
    if ('webhook' in cfg) {
        if (!isObject(cfg.webhook)) {
            errors.push('webhook must be an object')
        } else {
            if ('webhookLogFilter' in cfg.webhook) {
                validateLogFilter(cfg.webhook.webhookLogFilter, 'webhook.webhookLogFilter', errors)
            }
            for (const key of ['discord', 'ntfy', 'telegram']) {
                if (key in cfg.webhook && !isObject(cfg.webhook[key])) {
                    errors.push(`webhook.${key} must be an object`)
                }
            }
        }
    }

    return { ok: errors.length === 0, errors }
}

export async function validateConfig(cfg, { projectRoot, validatorModule } = {}) {
    let validator
    try {
        validator = await loadBotValidator(projectRoot, validatorModule)
    } catch (error) {
        return {
            ok: false,
            errors: [error instanceof Error ? error.message : String(error)],
            via: 'bot-validator-load'
        }
    }
    if (validator) {
        try {
            const value = validator.run(cfg)
            return { ok: true, value: value ?? cfg, via: validator.via }
        } catch (err) {
            const issues = err?.issues
            const errors = Array.isArray(issues)
                ? issues.map(i => `${(i.path || []).join('.') || '(root)'}: ${i.message}`)
                : [err instanceof Error ? err.message : String(err)]
            return { ok: false, errors, via: validator.via }
        }
    }
    const res = structuralValidate(cfg)
    return { ...res, value: cfg, via: 'structural-fallback' }
}

export function deepMerge(base, patch) {
    if (Array.isArray(patch)) return patch // arrays replace wholesale
    if (typeof patch !== 'object' || patch === null) return patch
    const out = { ...(typeof base === 'object' && base !== null ? base : {}) }
    for (const [k, v] of Object.entries(patch)) {
        if (['__proto__', 'prototype', 'constructor'].includes(k)) {
            throw Object.assign(new Error(`Unsafe config key: ${k}`), { code: 'BAD_REQUEST' })
        }
        out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(out[k], v) : v
    }
    return out
}

export function readConfig(projectRoot) {
    const p = resolveConfigPath(projectRoot)
    return { path: p, data: JSON.parse(fs.readFileSync(p, 'utf8')) }
}

export function writeConfigAtomic(projectRoot, cfg) {
    const target = resolveConfigPath(projectRoot)
    if (fs.existsSync(target)) {
        try {
            fs.copyFileSync(target, `${target}.bak`)
        } catch {
            // best-effort backup
        }
    }
    const tmp = `${target}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2))
    fs.renameSync(tmp, target)
    return target
}
