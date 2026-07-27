import fs from 'node:fs'
import path from 'node:path'

export { envBool, envInt, envStr } from '../env.js'

export function log(level, ...args) {
    const lvl = typeof level === 'string' ? level.toUpperCase() : 'INFO'
    const line = `[api] [${lvl}]`
    if (lvl === 'ERROR') return console.error(line, ...args)
    if (lvl === 'WARN') return console.warn(line, ...args)
    return console.log(line, ...args)
}

export function parseArgs(argv = process.argv.slice(2)) {
    const args = {}
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg.startsWith('-')) {
            const key = arg.replace(/^-+/, '')
            if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
                args[key] = argv[++i]
            } else {
                args[key] = true
            }
        }
    }
    return args
}

export function getProjectRoot(startDir) {
    let dir = startDir
    let nearestPackageDir = null
    while (dir !== path.parse(dir).root) {
        const packagePath = path.join(dir, 'package.json')
        if (fs.existsSync(packagePath)) {
            nearestPackageDir ??= dir
            try {
                const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
                if (typeof pkg.name === 'string' && pkg.name.trim()) return dir
            } catch {}
        }
        dir = path.dirname(dir)
    }
    if (nearestPackageDir) return nearestPackageDir
    throw new Error('Could not locate project root (package.json not found).')
}

export function loadEnvFile(projectRoot) {
    const candidates = [
        path.resolve(process.cwd(), '.env'),
        path.join(projectRoot, '.env'),
        path.join(projectRoot, 'dist', '.env')
    ]
    const envFile = candidates.find(p => fs.existsSync(p))
    if (!envFile) return null

    const raw = fs.readFileSync(envFile, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eq = trimmed.indexOf('=')
        if (eq === -1) continue
        const key = trimmed.slice(0, eq).trim()
        let value = trimmed.slice(eq + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1)
        }
        if (process.env[key] === undefined) process.env[key] = value
    }
    return envFile
}

export function loadConfigSafe(projectRoot) {
    const candidates = [
        path.join(projectRoot, 'config.json'),
        path.join(projectRoot, 'dist', 'config.json'),
        path.join(projectRoot, 'src', 'config.json'),
        path.resolve(process.cwd(), 'config.json')
    ]
    for (const p of candidates) {
        if (!fs.existsSync(p)) continue
        try {
            return { data: JSON.parse(fs.readFileSync(p, 'utf8')), path: p }
        } catch (error) {
            return { data: null, path: p, error: error instanceof Error ? error.message : String(error) }
        }
    }
    return null
}

export function redactSecrets(config) {
    if (!config || typeof config !== 'object') return config
    const clone = structuredClone(config)
    const mask = '***REDACTED***'
    const wh = clone.webhook
    if (wh && typeof wh === 'object') {
        if (wh.discord?.url) wh.discord.url = mask
        if (wh.ntfy?.url) wh.ntfy.url = mask
        if (wh.ntfy?.token) wh.ntfy.token = mask
        if (wh.telegram?.botToken) wh.telegram.botToken = mask
        if (wh.telegram?.chatId) wh.telegram.chatId = mask
    }
    return clone
}
