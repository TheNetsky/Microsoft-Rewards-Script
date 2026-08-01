/**
 * ConfigSync.ts
 *
 * Single source of truth for comparing/merging config.json against
 * config.example.json. Used by the Docker entrypoint (via CLI) and the
 * API's configEditor.js (via dynamic import) - NOT by Load.ts. Load.ts /
 * Validator.ts already backfill missing keys in memory on every start
 * (bare metal and docker); this module is strictly about writing
 * those defaults back to the *file on disk* for docker users whose
 * config.json lives in a bind-mounted volume across image updates.
 *
 * Users:
 *   - entrypoint.sh -> `node dist/util/ConfigSync.js sync [--patch] --config <path> --example <path>`
 *   - configEditor.js -> dynamic import of diffKeyPaths / mergeMissingDefaults / readJson / resolveExamplePath
 */

import fs from 'fs'
import path from 'path'

export interface SyncReport {
    configPath: string
    examplePath: string
    created: boolean // true if config.json didn't exist and was seeded from example
    addedKeys: string[] // dotted key-paths present in example but missing from config
    patched: boolean // true if addedKeys were actually written into config.json
    backupPath?: string
}

// ── Path helpers (docker-side only; mirrors the search order Load.ts uses,
//    kept separate/duplicated there deliberately - see note above) ──

export function getProjectRoot(startDir: string = process.cwd()): string {
    if (fs.existsSync(path.join(startDir, 'package.json'))) return startDir
    let dir = startDir
    while (dir !== path.parse(dir).root) {
        if (fs.existsSync(path.join(dir, 'package.json'))) return dir
        dir = path.dirname(dir)
    }
    return startDir
}

function resolveProjectFile(filename: string, projectRoot: string): string | undefined {
    const candidates = [
        path.join(process.cwd(), filename),
        path.join(projectRoot, filename),
        path.join(projectRoot, 'dist', filename),
        path.join(projectRoot, 'src', filename)
    ]
    return candidates.find(p => fs.existsSync(p))
}

export function resolveConfigPath(projectRoot: string = getProjectRoot()): string {
    return resolveProjectFile('config.json', projectRoot) ?? path.join(projectRoot, 'config.json')
}

export function resolveExamplePath(projectRoot: string = getProjectRoot()): string {
    return resolveProjectFile('config.example.json', projectRoot) ?? path.join(projectRoot, 'config.example.json')
}

// ── Read/write ──

export function readJson(filePath: string): unknown {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

export function writeConfigAtomic(
    targetPath: string,
    cfg: unknown,
    opts: { backup?: boolean } = {}
): { backupPath?: string } {
    const backup = opts.backup ?? true
    let backupPath: string | undefined
    if (backup && fs.existsSync(targetPath)) {
        backupPath = `${targetPath}.bak`
        try {
            fs.copyFileSync(targetPath, backupPath)
        } catch {
            backupPath = undefined // best-effort backup; don't fail the sync over it
        }
    }
    const tmp = `${targetPath}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n')
    fs.renameSync(tmp, targetPath)
    return { backupPath }
}

// ── Diff / merge ──

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Dotted key-paths present in `example` but absent from `config`. Arrays are
 * leaves - their contents are never diffed, only presence/absence of the key.
 */
export function diffKeyPaths(config: unknown, example: unknown, prefix = ''): string[] {
    if (!isPlainObject(example)) return []
    const cfgObj = isPlainObject(config) ? config : {}
    const missing: string[] = []

    for (const [key, exampleVal] of Object.entries(example)) {
        const keyPath = prefix ? `${prefix}.${key}` : key
        if (!Object.prototype.hasOwnProperty.call(cfgObj, key)) {
            missing.push(keyPath)
            continue
        }
        if (isPlainObject(exampleVal)) {
            missing.push(...diffKeyPaths(cfgObj[key], exampleVal, keyPath))
        }
    }
    return missing
}

/**
 * Deep-copies `config`, filling in any key present in `example` but missing
 * from `config` using the example's value. Existing user values are never
 * overwritten. Returns the merged config plus the dotted paths that were added.
 */
export function mergeMissingDefaults<T = unknown>(config: unknown, example: T): { merged: T; addedKeys: string[] } {
    const addedKeys: string[] = []

    function walk(cfg: unknown, ex: unknown, prefix: string): unknown {
        if (!isPlainObject(ex)) return cfg === undefined ? ex : cfg
        const cfgObj = isPlainObject(cfg) ? { ...cfg } : {}
        for (const [key, exVal] of Object.entries(ex)) {
            const keyPath = prefix ? `${prefix}.${key}` : key
            if (!Object.prototype.hasOwnProperty.call(cfgObj, key)) {
                cfgObj[key] = exVal
                addedKeys.push(keyPath)
            } else if (isPlainObject(exVal)) {
                cfgObj[key] = walk(cfgObj[key], exVal, keyPath)
            }
        }
        return cfgObj
    }

    return { merged: walk(config, example, '') as T, addedKeys }
}

// ── Orchestration (docker CLI path) ──

export interface SyncOptions {
    projectRoot?: string
    configPath?: string
    examplePath?: string
    /** If true, missing keys are written into config.json (with a .bak backup). If false, only reported. */
    patch?: boolean
}

export function syncConfig(opts: SyncOptions = {}): SyncReport {
    const projectRoot = opts.projectRoot ?? getProjectRoot()
    const configPath = opts.configPath ?? resolveConfigPath(projectRoot)
    const examplePath = opts.examplePath ?? resolveExamplePath(projectRoot)

    if (!fs.existsSync(examplePath)) {
        throw new Error(`config.example.json not found at ${examplePath} - image may be corrupt.`)
    }
    const example = readJson(examplePath)

    // No config.json (or an empty stub) yet -> seed it from the example.
    if (!fs.existsSync(configPath) || fs.statSync(configPath).size < 10) {
        writeConfigAtomic(configPath, example)
        return { configPath, examplePath, created: true, addedKeys: [], patched: true }
    }

    // Existing file: parse errors are surfaced as a thrown error rather than
    // silently overwritten, so a corrupt user file fails loudly instead of
    // being clobbered.
    const config = readJson(configPath)
    const addedKeys = diffKeyPaths(config, example)

    if (addedKeys.length === 0) {
        return { configPath, examplePath, created: false, addedKeys: [], patched: false }
    }
    if (!opts.patch) {
        return { configPath, examplePath, created: false, addedKeys, patched: false }
    }

    const { merged } = mergeMissingDefaults(config, example)
    const { backupPath } = writeConfigAtomic(configPath, merged)
    return { configPath, examplePath, created: false, addedKeys, patched: true, backupPath }
}

// ── CLI entry point, used by entrypoint.sh ──
// node dist/util/ConfigSync.js sync [--patch] [--config <path>] [--example <path>]
if (require.main === module) {
    const args = process.argv.slice(2)
    const patch = args.includes('--patch')
    const getArg = (flag: string) => {
        const i = args.indexOf(flag)
        return i !== -1 ? args[i + 1] : undefined
    }

    try {
        const report = syncConfig({
            configPath: getArg('--config'),
            examplePath: getArg('--example'),
            patch
        })

        if (report.created) {
            console.log(`[config-sync] No config.json found - generated from ${path.basename(report.examplePath)}.`)
        } else if (report.addedKeys.length === 0) {
            console.log('[config-sync] config.json is up to date.')
        } else if (report.patched) {
            console.log(`[config-sync] Added ${report.addedKeys.length} missing key(s) to config.json:`)
            report.addedKeys.forEach(k => console.log(`[config-sync]   + ${k}`))
            if (report.backupPath) console.log(`[config-sync] Backup saved to ${report.backupPath}`)
        } else {
            console.warn('')
            console.warn('┌──────────────────────────────────────────────────────────┐')
            console.warn('│  ⚠  CONFIG UPDATE AVAILABLE                              │')
            console.warn('│  Missing keys (see config.example.json for defaults):    │')
            report.addedKeys.forEach(k => console.warn(('│    + ' + k).padEnd(60) + '│'))
            console.warn('│  Set CONFIG_AUTO_SYNC=true to patch automatically, or    │')
            console.warn('│  delete config.json to regenerate it from scratch.       │')
            console.warn('└──────────────────────────────────────────────────────────┘')
            console.warn('')
        }
        process.exit(0)
    } catch (err) {
        console.error(`[config-sync] ERROR: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }
}
