import projectFiles from '../../scripts/lib/projectFiles.cjs'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import crypto from 'node:crypto'
import { requestError } from './http.js'

function resolveConfigPath(projectRoot) {
    return projectFiles.resolveProjectFile('config.json', projectRoot) ?? path.join(projectRoot, 'config.json')
}

async function loadConfigModule(projectRoot, name) {
    const modulePath = path.join(projectRoot, 'dist', 'config', `${name}.js`)
    if (!fs.existsSync(modulePath)) return null
    try {
        const loaded = await import(pathToFileURL(modulePath).href)
        return loaded.default ?? loaded
    } catch (error) {
        throw new Error(
            `Could not load ${name} at ${modulePath}: ${error instanceof Error ? error.message : String(error)}`
        )
    }
}

async function loadBotValidator(projectRoot, effectiveEnv) {
    const validator = await loadConfigModule(projectRoot, effectiveEnv ? 'ConfigEnvOverrides' : 'Validator')
    if (!validator) return null
    if (effectiveEnv && typeof validator.resolveConfigOverrides === 'function') {
        return {
            via: 'bot-effective-config',
            run: (cfg, warnings) =>
                validator.resolveConfigOverrides(cfg, effectiveEnv, { onWarning: message => warnings.push(message) })
        }
    }
    if (typeof validator.validateConfig === 'function') {
        return {
            via: 'bot-validateConfig',
            run: (cfg, warnings) => validator.validateConfig(cfg, { onWarning: message => warnings.push(message) })
        }
    }
    throw new Error('Config validator module has no supported validation function')
}

/** @param {unknown} cfg @param {{projectRoot: string, effectiveEnv?: NodeJS.ProcessEnv}} options */
export async function validateConfig(cfg, { projectRoot, effectiveEnv }) {
    let validator
    try {
        validator = await loadBotValidator(projectRoot, effectiveEnv)
    } catch (error) {
        return {
            ok: false,
            errors: [error instanceof Error ? error.message : String(error)],
            via: 'bot-validator-load'
        }
    }
    if (validator) {
        try {
            const warnings = []
            const value = validator.run(cfg, warnings)
            return { ok: true, value: value ?? cfg, warnings, via: validator.via }
        } catch (err) {
            const issues = err?.issues
            const errors = Array.isArray(issues)
                ? issues.map(i => `${(i.path || []).join('.') || '(root)'}: ${i.message}`)
                : [err instanceof Error ? err.message : String(err)]
            return { ok: false, errors, via: validator.via }
        }
    }
    return {
        ok: false,
        errors: ['Build the project before editing config (npm run build).'],
        via: 'validator-unavailable'
    }
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

export async function diffConfig(projectRoot) {
    const mod = await loadConfigModule(projectRoot, 'ConfigSync')
    if (!mod) throw new Error('ConfigSync module not found - run `npm run build`.')
    const { data: config } = readConfig(projectRoot)
    return { addedKeys: mod.diffKeyPaths(config) }
}

/** @param {string} projectRoot @param {{expectedRevision?: string}} options */
export async function syncMissingDefaults(projectRoot, { expectedRevision } = {}) {
    const mod = await loadConfigModule(projectRoot, 'ConfigSync')
    if (!mod) throw new Error('ConfigSync module not found - run `npm run build`.')
    const { data: config } = readConfig(projectRoot)
    if (expectedRevision && expectedRevision !== configRevision(config)) {
        throw requestError('Config revision changed; reload before synchronizing.', 'CONFIG_CHANGED', 412)
    }
    const { merged, addedKeys } = mod.mergeMissingDefaults(config)
    if (addedKeys.length > 0) {
        writeConfigAtomic(projectRoot, merged)
    }
    return { addedKeys, patched: addedKeys.length > 0, revision: configRevision(merged) }
}

export function readConfig(projectRoot) {
    const p = resolveConfigPath(projectRoot)
    try {
        return { path: p, data: JSON.parse(fs.readFileSync(p, 'utf8')) }
    } catch (error) {
        if (error.code === 'ENOENT') throw requestError('config.json not found', 'CONFIG_NOT_FOUND', 404)
        throw error
    }
}

export function configRevision(value) {
    return '"' + crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex') + '"'
}

export function writeConfigAtomic(projectRoot, cfg) {
    const target = resolveConfigPath(projectRoot)
    projectFiles.writeJsonAtomic(target, cfg)
    return target
}
