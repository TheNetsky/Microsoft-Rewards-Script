import { logSystemMessage } from '../logging/LogEvent'
import {
    getProjectRoot,
    resolveProjectFile,
    writeJsonAtomic as writeConfigAtomic
} from '../../scripts/lib/projectFiles.cjs'
import fs from 'node:fs'
import path from 'node:path'
import { defaultConfig } from './Defaults'
import { isPlainObject } from '../util/Utils'

export { getProjectRoot, writeJsonAtomic as writeConfigAtomic } from '../../scripts/lib/projectFiles.cjs'

export interface SyncReport {
    configPath: string
    created: boolean // true if config.json didn't exist and was seeded from built-in defaults
    addedKeys: string[] // dotted key-paths present in defaults but missing from config
    patched: boolean // true if addedKeys were actually written into config.json
    backupPath?: string
}

export function resolveConfigPath(projectRoot: string = getProjectRoot()): string {
    return resolveProjectFile('config.json', projectRoot) ?? path.join(projectRoot, 'config.json')
}

export function readJson(filePath: string): unknown {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

export function diffKeyPaths(config: unknown, defaults: unknown = defaultConfig, prefix = ''): string[] {
    if (!isPlainObject(defaults)) return []
    const cfgObj = isPlainObject(config) ? config : {}
    const missing: string[] = []

    for (const [key, defaultValue] of Object.entries(defaults)) {
        const keyPath = prefix ? `${prefix}.${key}` : key
        if (!Object.prototype.hasOwnProperty.call(cfgObj, key)) {
            missing.push(keyPath)
            continue
        }
        if (isPlainObject(defaultValue) && isPlainObject(cfgObj[key])) {
            missing.push(...diffKeyPaths(cfgObj[key], defaultValue, keyPath))
        }
    }
    return missing
}

export function mergeMissingDefaults(
    config: unknown,
    defaults: unknown = defaultConfig
): { merged: unknown; addedKeys: string[] } {
    const addedKeys: string[] = []

    function walk(cfg: unknown, fallback: unknown, prefix: string): unknown {
        if (!isPlainObject(fallback)) return cfg === undefined ? structuredClone(fallback) : cfg
        const cfgObj = isPlainObject(cfg) ? { ...cfg } : {}
        for (const [key, defaultValue] of Object.entries(fallback)) {
            const keyPath = prefix ? `${prefix}.${key}` : key
            if (!Object.prototype.hasOwnProperty.call(cfgObj, key)) {
                cfgObj[key] = structuredClone(defaultValue)
                addedKeys.push(keyPath)
            } else if (isPlainObject(defaultValue) && isPlainObject(cfgObj[key])) {
                cfgObj[key] = walk(cfgObj[key], defaultValue, keyPath)
            }
        }
        return cfgObj
    }

    return { merged: walk(config, defaults, ''), addedKeys }
}

export interface SyncOptions {
    projectRoot?: string
    configPath?: string
    /** If true, missing keys are written into config.json (with a .bak backup). If false, only reported. */
    patch?: boolean
}

function syncConfig(opts: SyncOptions = {}): SyncReport {
    const projectRoot = opts.projectRoot ?? getProjectRoot()
    const configPath = opts.configPath ?? resolveConfigPath(projectRoot)

    if (!fs.existsSync(configPath)) {
        writeConfigAtomic(configPath, defaultConfig)
        return { configPath, created: true, addedKeys: [], patched: true }
    }

    const config = readJson(configPath)
    if (!isPlainObject(config)) throw new Error('Config must be a JSON object')
    const addedKeys = diffKeyPaths(config)

    if (addedKeys.length === 0) {
        return { configPath, created: false, addedKeys: [], patched: false }
    }
    if (!opts.patch) {
        return { configPath, created: false, addedKeys, patched: false }
    }

    const { merged } = mergeMissingDefaults(config)
    const { backupPath } = writeConfigAtomic(configPath, merged)
    return { configPath, created: false, addedKeys, patched: true, backupPath }
}

if (require.main === module) {
    const args = process.argv.slice(2)

    const printHelp = (): void => {
        console.log(`
Microsoft Rewards config synchronizer

Usage:
  node dist/config/ConfigSync.js sync [--config <path>] [--patch]

Options:
  --config     Path to config.json. Defaults to the project config.
  --patch      Add missing built-in defaults to config.json and create a backup.
  --help       Show this help.

Examples:
  node dist/config/ConfigSync.js sync
  node dist/config/ConfigSync.js sync --patch
  node dist/config/ConfigSync.js sync --config ./config.json --patch
`)
    }

    const failUsage = (message: string): never => {
        logSystemMessage('error', 'CONFIG-SYNC', `${message}`)
        printHelp()
        process.exit(1)
    }

    if (args.includes('--help') || args.includes('-h')) {
        printHelp()
        process.exit(0)
    }

    const command = args[0]
    if (!command) failUsage('Missing command. Use "sync".')
    if (command !== 'sync') failUsage(`Unknown command "${command}". Expected "sync".`)

    let configPath: string | undefined
    let patch = false

    for (let i = 1; i < args.length; i++) {
        const arg = args[i]
        if (arg === '--patch') {
            patch = true
            continue
        }
        if (arg === '--config') {
            const value = args[i + 1]
            if (!value || value.startsWith('-')) failUsage(`${arg} requires a file path after it.`)
            configPath = value
            i++
            continue
        }
        failUsage(`Unknown option or argument: ${arg}`)
    }

    try {
        const report = syncConfig({
            configPath,
            patch
        })

        if (report.created) {
            logSystemMessage(
                'info',
                'CONFIG-SYNC',
                `No config.json found - generated from built-in defaults at ${report.configPath}.`
            )
        } else if (report.addedKeys.length === 0) {
            logSystemMessage('info', 'CONFIG-SYNC', 'config.json is up to date.')
        } else if (report.patched) {
            logSystemMessage('info', 'CONFIG-SYNC', `Added ${report.addedKeys.length} missing key(s) to config.json:`)
            report.addedKeys.forEach(k => logSystemMessage('info', 'CONFIG-SYNC', `+ ${k}`))
            if (report.backupPath) logSystemMessage('info', 'CONFIG-SYNC', `Backup saved to ${report.backupPath}`)
        } else {
            logSystemMessage('warn', 'CONFIG-SYNC', `${report.addedKeys.length} missing default key(s) in config.json:`)
            report.addedKeys.forEach(k => logSystemMessage('warn', 'CONFIG-SYNC', `+ ${k}`))
            logSystemMessage(
                'warn',
                'CONFIG-SYNC',
                'Run sync --patch to add them, or set CONFIG_AUTO_SYNC=true in Docker.'
            )
        }
        process.exit(0)
    } catch (err) {
        logSystemMessage('error', 'CONFIG-SYNC', `${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }
}
