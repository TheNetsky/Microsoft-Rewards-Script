import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

export function getDirname(importMetaUrl) {
    const __filename = fileURLToPath(importMetaUrl)
    return path.dirname(__filename)
}

export function getProjectRoot(currentDir) {
    let dir = currentDir
    while (dir !== path.parse(dir).root) {
        if (fs.existsSync(path.join(dir, 'package.json'))) {
            return dir
        }
        dir = path.dirname(dir)
    }
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
            const key = arg.substring(1)

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
    if (!email) {
        log('ERROR', 'Missing -email argument')
        log('ERROR', 'Usage: node script.js -email you@example.com')
        process.exit(1)
    }

    if (typeof email !== 'string') {
        log('ERROR', `Invalid email type: expected string, got ${typeof email}`)
        log('ERROR', 'Usage: node script.js -email you@example.com')
        process.exit(1)
    }

    if (!email.includes('@')) {
        log('ERROR', `Invalid email format: "${email}"`)
        log('ERROR', 'Email must contain "@" symbol')
        log('ERROR', 'Example: you@example.com')
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
        log('ERROR', 'Required file not found')
        log('ERROR', 'Searched in the following locations:')
        possiblePaths.forEach(p => log('ERROR', `  - ${p}`))
        process.exit(1)
    }

    return null
}

export function loadConfig(projectRoot, isDev = false) {
    const possiblePaths = isDev
        ? [path.join(projectRoot, 'src', 'config.json')]
        : [
            path.join(projectRoot, 'dist', 'config.json'),
            path.join(projectRoot, 'config.json')
        ]

    const result = loadJsonFile(possiblePaths, true)

    const missingFields = []
    if (!result.data.baseURL) missingFields.push('baseURL')
    if (!result.data.sessionPath) missingFields.push('sessionPath')
    if (result.data.headless === undefined) missingFields.push('headless')
    if (!result.data.workers) missingFields.push('workers')

    if (missingFields.length > 0) {
        log('ERROR', 'Invalid config.json - missing required fields:')
        missingFields.forEach(field => log('ERROR', `  - ${field}`))
        log('ERROR', `Config file: ${result.path}`)
        process.exit(1)
    }

    return result
}

export function loadAccounts(projectRoot, isDev = false) {
    const possiblePaths = isDev
        ? [path.join(projectRoot, 'src', 'accounts.dev.json')]
        : [
            path.join(projectRoot, 'dist', 'accounts.json'),
            path.join(projectRoot, 'accounts.json'),
            path.join(projectRoot, 'accounts.example.json')
        ]

    return loadJsonFile(possiblePaths, true)
}

export function findAccountByEmail(accounts, email) {
    if (!email || typeof email !== 'string') return null
    return accounts.find(a => a?.email && typeof a.email === 'string' && a.email.toLowerCase() === email.toLowerCase()) || null
}

export function getRuntimeBase(projectRoot, isDev = false) {
    return path.join(projectRoot, isDev ? 'src' : 'dist')
}

export function getSessionPath(runtimeBase, sessionPath, email) {
    return path.join(runtimeBase, 'browser', sessionPath, email)
}

export async function loadCookies(sessionBase, type = 'desktop') {
    const cookiesFile = path.join(sessionBase, `session_${type}.json`)

    if (!fs.existsSync(cookiesFile)) {
        return []
    }

    try {
        const content = await fs.promises.readFile(cookiesFile, 'utf8')
        return JSON.parse(content)
    } catch (error) {
        log('WARN', `Failed to load cookies from: ${cookiesFile}`)
        log('WARN', `Error: ${error.message}`)
        return []
    }
}

export async function loadFingerprint(sessionBase, type = 'desktop') {
    const fpFile = path.join(sessionBase, `session_fingerprint_${type}.json`)

    if (!fs.existsSync(fpFile)) {
        return null
    }

    try {
        const content = await fs.promises.readFile(fpFile, 'utf8')
        return JSON.parse(content)
    } catch (error) {
        log('WARN', `Failed to load fingerprint from: ${fpFile}`)
        log('WARN', `Error: ${error.message}`)
        return null
    }
}

export function getUserAgent(fingerprint) {
    if (!fingerprint) return null
    return fingerprint?.fingerprint?.userAgent || fingerprint?.userAgent || null
}

export function buildProxyConfig(account) {
    if (!account.proxy || !account.proxy.url || !account.proxy.port) {
        return null
    }

    const proxy = {
        server: `${account.proxy.url}:${account.proxy.port}`
    }

    if (account.proxy.username && account.proxy.password) {
        proxy.username = account.proxy.username
        proxy.password = account.proxy.password
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

export function validateDeletionPath(targetPath, projectRoot) {
    const normalizedTarget = path.normalize(targetPath)
    const normalizedRoot = path.normalize(projectRoot)

    if (!normalizedTarget.startsWith(normalizedRoot)) {
        return {
            valid: false,
            error: 'Path is outside project root'
        }
    }

    if (normalizedTarget === normalizedRoot) {
        return {
            valid: false,
            error: 'Cannot delete project root'
        }
    }

    const pathSegments = normalizedTarget.split(path.sep)
    if (pathSegments.length < 3) {
        return {
            valid: false,
            error: 'Path is too shallow (safety check failed)'
        }
    }

    return { valid: true, error: null }
}

export function safeRemoveDirectory(dirPath, projectRoot) {
    const validation = validateDeletionPath(dirPath, projectRoot)

    if (!validation.valid) {
        log('ERROR', 'Directory deletion failed - safety check:')
        log('ERROR', `  Reason: ${validation.error}`)
        log('ERROR', `  Target: ${dirPath}`)
        log('ERROR', `  Project root: ${projectRoot}`)
        return false
    }

    if (!fs.existsSync(dirPath)) {
        log('INFO', `Directory does not exist: ${dirPath}`)
        return true
    }

    try {
        fs.rmSync(dirPath, { recursive: true, force: true })
        log('SUCCESS', `Directory removed: ${dirPath}`)
        return true
    } catch (error) {
        log('ERROR', `Failed to remove directory: ${dirPath}`)
        log('ERROR', `Error: ${error.message}`)
        return false
    }
}