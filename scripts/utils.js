import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { DatabaseSync } from 'node:sqlite'
import { accountIndexesFromEnv, envBool, envInt, envStr, normalizeGeoLocale, normalizeLanguageCode } from './env.js'

export function getDirname(importMetaUrl) {
    const __filename = fileURLToPath(importMetaUrl)
    return path.dirname(__filename)
}

export function getProjectRoot(currentDir) {
    let dir = currentDir
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
    throw new Error('Could not find project root (package.json not found)')
}

export function log(level, ...args) {
    console.log(`[${level}]`, ...args)
}

export function parseArgs(argv = process.argv.slice(2)) {
    const args = {}

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]

        if (arg.startsWith('-')) {
            const key = arg.replace(/^-+/, '')

            if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
                args[key] = argv[i + 1]
                i++
            } else {
                args[key] = true
            }
        }
    }

    return args
}

export function validateEmail(email) {
    if (!email || typeof email !== 'string' || !email.includes('@')) {
        log('ERROR', `Invalid or missing -email argument: ${JSON.stringify(email)}`)
        log('ERROR', 'Usage: node script.js -email you@example.com')
        process.exit(1)
    }

    return email
}

export function loadJsonFile(possiblePaths, required = true) {
    for (const filePath of possiblePaths) {
        if (fs.existsSync(filePath)) {
            try {
                const content = fs.readFileSync(filePath, 'utf8')
                return { data: JSON.parse(content), path: filePath }
            } catch (error) {
                log('ERROR', `Failed to parse JSON file: ${filePath}`)
                log('ERROR', `Parse error: ${error.message}`)
                if (required) process.exit(1)
                return null
            }
        }
    }

    if (required) {
        log('ERROR', 'Required file not found. Searched in:')
        possiblePaths.forEach(p => log('ERROR', `  - ${p}`))
        process.exit(1)
    }

    return null
}

export function loadConfig(projectRoot) {
    const possiblePaths = [
        path.resolve(process.cwd(), 'config.json'),
        path.join(projectRoot, 'config.json'),
        path.join(projectRoot, 'dist', 'config.json'),
        path.join(projectRoot, 'src', 'config.json')
    ]

    const result = loadJsonFile(possiblePaths, true)

    const missingFields = []
    if (!result.data.sessionPath) missingFields.push('sessionPath')

    if (missingFields.length > 0) {
        log('ERROR', 'Invalid config.json - missing required fields:')
        missingFields.forEach(field => log('ERROR', `  - ${field}`))
        log('ERROR', `Config file: ${result.path}`)
        process.exit(1)
    }

    return result
}

export function loadEnvFile(projectRoot) {
    const candidates = [
        path.resolve(process.cwd(), '.env'),
        path.join(projectRoot, '.env'),
        path.join(projectRoot, 'dist', '.env'),
        path.join(projectRoot, 'src', '.env')
    ]

    const envFile = candidates.find(p => fs.existsSync(p))
    if (!envFile) return

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

        if (process.env[key] === undefined) {
            process.env[key] = value
        }
    }
}

const deprecationWarned = new Set()
function envBoolWithLegacy(primary, legacy, fallback) {
    if (envStr(primary) !== undefined) return envBool(primary, fallback)
    if (envStr(legacy) !== undefined) {
        if (!deprecationWarned.has(legacy)) {
            deprecationWarned.add(legacy)
            log('WARN', `${legacy} is deprecated; rename it to ${primary}.`)
        }
        return envBool(legacy, fallback)
    }
    return fallback
}

export function loadAccountsFromEnv(projectRoot) {
    loadEnvFile(projectRoot)

    const accounts = []
    for (const index of accountIndexesFromEnv()) {
        const idx = String(index)
        const email = envStr(`ACCOUNT_${idx}_EMAIL`)
        if (!email) continue

        accounts.push({
            email,
            password: envStr(`ACCOUNT_${idx}_PASSWORD`) ?? '',
            totpSecret: envStr(`ACCOUNT_${idx}_TOTP_SECRET`),
            recoveryEmail: envStr(`ACCOUNT_${idx}_RECOVERY_EMAIL`) ?? '',
            geoLocale: normalizeGeoLocale(envStr(`ACCOUNT_${idx}_GEO_LOCALE`) ?? 'auto'),
            langCode: normalizeLanguageCode(envStr(`ACCOUNT_${idx}_LANG_CODE`) ?? 'en'),
            proxy: {
                proxyHttp: envBoolWithLegacy(`ACCOUNT_${idx}_PROXY_HTTP`, `ACCOUNT_${idx}_PROXY_AXIOS`, false),
                url: envStr(`ACCOUNT_${idx}_PROXY_URL`) ?? '',
                port: envInt(`ACCOUNT_${idx}_PROXY_PORT`, 0),
                username: envStr(`ACCOUNT_${idx}_PROXY_USERNAME`) ?? '',
                password: envStr(`ACCOUNT_${idx}_PROXY_PASSWORD`) ?? ''
            },
            saveFingerprint: {
                mobile: envBool(`ACCOUNT_${idx}_SAVE_FINGERPRINT_MOBILE`, false),
                desktop: envBool(`ACCOUNT_${idx}_SAVE_FINGERPRINT_DESKTOP`, false)
            }
        })
    }

    return accounts
}

export function findAccountByEmail(accounts, email) {
    if (!email || typeof email !== 'string') return null
    return (
        accounts.find(a => a?.email && typeof a.email === 'string' && a.email.toLowerCase() === email.toLowerCase()) ||
        null
    )
}

const browserProxyProtocols = new Set(['http:', 'https:', 'socks4:', 'socks5:'])
const explicitProxyProtocolPattern = /^[a-z][a-z\d+.-]*:\/\//i

function parseBrowserProxyUrl(value) {
    const input = String(value ?? '').trim()
    if (!input) throw new Error('Proxy URL is empty')

    let url
    try {
        url = new URL(explicitProxyProtocolPattern.test(input) ? input : `http://${input}`)
    } catch {
        throw new Error(`Invalid proxy URL: ${value}`)
    }

    const protocol = url.protocol.toLowerCase()
    if (!browserProxyProtocols.has(protocol)) {
        throw new Error(
            `Unsupported browser proxy protocol "${protocol.slice(0, -1)}"; supported: http, https, socks4, socks5`
        )
    }
    if (!url.hostname) throw new Error(`Invalid proxy URL: ${value}`)
    return url
}

export function buildProxyConfig(account) {
    const settings = account?.proxy
    if (!settings?.url) {
        if (settings && (settings.proxyHttp || settings.port || settings.username || settings.password)) {
            throw new Error('Proxy URL is required when other proxy settings are configured')
        }
        return null
    }

    if (!Number.isInteger(settings.port) || settings.port < 1 || settings.port > 65535) {
        throw new Error('Proxy port must be an integer from 1 to 65535')
    }

    const url = parseBrowserProxyUrl(settings.url)
    if (url.username || url.password) {
        throw new Error('Put proxy credentials in ACCOUNT_N_PROXY_USERNAME/PASSWORD, not in ACCOUNT_N_PROXY_URL')
    }

    const hasUsername = Boolean(settings.username)
    const hasPassword = Boolean(settings.password)
    if (hasUsername !== hasPassword) {
        throw new Error('Proxy username and password must be configured together')
    }
    if ((url.protocol === 'socks4:' || url.protocol === 'socks5:') && (hasUsername || hasPassword)) {
        throw new Error(
            `${url.protocol.slice(0, -1).toUpperCase()} proxy authentication is not supported by Patchright`
        )
    }

    const proxy = { server: `${url.protocol}//${url.hostname}:${settings.port}` }
    if (hasUsername && hasPassword) {
        proxy.username = settings.username
        proxy.password = settings.password
    }

    return proxy
}

export function setupCleanupHandlers(cleanupFn) {
    const cleanup = async () => {
        try {
            await cleanupFn()
        } catch (error) {
            log('ERROR', 'Cleanup failed:', error.message)
        }
        process.exit(0)
    }

    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)
}

export function getSessionDbPath(projectRoot, sessionPath) {
    const candidates = [
        path.resolve(process.cwd(), sessionPath, 'sessions.db'),
        path.join(projectRoot, sessionPath, 'sessions.db'),
        path.join(projectRoot, 'dist', sessionPath, 'sessions.db'),
        path.join(projectRoot, 'src', sessionPath, 'sessions.db')
    ]

    const found = candidates.find(p => fs.existsSync(p))
    return { dbPath: found ?? candidates[0], exists: Boolean(found), candidates }
}

export function openSessionDb(dbPath, { readonly = false } = {}) {
    const db = new DatabaseSync(dbPath, { readOnly: readonly })
    db.exec('PRAGMA busy_timeout = 5000')
    return db
}

export function closeSessionDb(db) {
    try {
        db.close()
    } catch {}
}

export function loadSessionRow(db, email, platform) {
    const row = db
        .prepare('SELECT storage_state, fingerprint, updated_at FROM sessions WHERE email = ? AND platform = ?')
        .get(email, platform)

    if (!row) return null

    return {
        storageState: row.storage_state ? JSON.parse(row.storage_state) : null,
        fingerprint: row.fingerprint ? JSON.parse(row.fingerprint) : null,
        updatedAt: row.updated_at
    }
}

export function listSessionRows(db) {
    return db.prepare('SELECT email, platform, updated_at FROM sessions ORDER BY email, platform').all()
}

export function clearSessionRows(db, email) {
    const info = email
        ? db.prepare('DELETE FROM sessions WHERE LOWER(email) = LOWER(?)').run(email)
        : db.prepare('DELETE FROM sessions').run()

    try {
        if (email) {
            db.prepare('DELETE FROM account_metadata WHERE LOWER(email) = LOWER(?)').run(email)
        } else {
            db.prepare('DELETE FROM account_metadata').run()
        }
    } catch {}

    try {
        db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch {}

    return Number(info.changes ?? 0)
}
