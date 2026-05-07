import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const projectRoot = path.resolve(__dirname, '..')

const possibleConfigPaths = [
    path.join(projectRoot, 'config.json'),
    path.join(projectRoot, 'src', 'config.json'),
    path.join(projectRoot, 'dist', 'config.json')
]

console.log('[DEBUG] Project root:', projectRoot)
console.log('[DEBUG] Searching for config.json...')

let configPath = null
for (const p of possibleConfigPaths) {
    console.log('[DEBUG] Checking:', p)
    if (fs.existsSync(p)) {
        configPath = p
        console.log('[DEBUG] Found config at:', p)
        break
    }
}

if (!configPath) {
    console.error('[ERROR] config.json not found in any expected location!')
    console.error('[ERROR] Searched:', possibleConfigPaths)
    process.exit(1)
}

console.log('[INFO] Using config:', configPath)
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))

if (!config.sessionPath) {
    console.error("[ERROR] config.json missing 'sessionPath' key!")
    process.exit(1)
}

console.log('[INFO] Session path from config:', config.sessionPath)

const configDir = path.dirname(configPath)
const possibleSessionDirs = [
    path.resolve(configDir, config.sessionPath),
    path.join(projectRoot, 'src/browser', config.sessionPath),
    path.join(projectRoot, 'dist/browser', config.sessionPath)
]

console.log('[DEBUG] Searching for session directory...')

let sessionDir = null
for (const p of possibleSessionDirs) {
    console.log('[DEBUG] Checking:', p)
    if (fs.existsSync(p)) {
        sessionDir = p
        console.log('[DEBUG] Found session directory at:', p)
        break
    }
}

if (!sessionDir) {
    sessionDir = path.resolve(configDir, config.sessionPath)
    console.log('[DEBUG] Using fallback session directory:', sessionDir)
}

const normalizedSessionDir = path.normalize(sessionDir)
const normalizedProjectRoot = path.normalize(projectRoot)

if (!normalizedSessionDir.startsWith(normalizedProjectRoot)) {
    console.error('[ERROR] Session directory is outside project root!')
    console.error('[ERROR] Project root:', normalizedProjectRoot)
    console.error('[ERROR] Session directory:', normalizedSessionDir)
    process.exit(1)
}

if (normalizedSessionDir === normalizedProjectRoot) {
    console.error('[ERROR] Session directory cannot be the project root!')
    process.exit(1)
}

const pathSegments = normalizedSessionDir.split(path.sep)
if (pathSegments.length < 3) {
    console.error('[ERROR] Session path is too shallow (safety check failed)!')
    console.error('[ERROR] Path:', normalizedSessionDir)
    process.exit(1)
}

if (fs.existsSync(sessionDir)) {
    console.log('[INFO] Removing session folder:', sessionDir)
    try {
        fs.rmSync(sessionDir, { recursive: true, force: true })
        console.log('[SUCCESS] Session folder removed successfully')
    } catch (error) {
        console.error('[ERROR] Failed to remove session folder:', error.message)
        process.exit(1)
    }
} else {
    console.log('[INFO] Session folder does not exist:', sessionDir)
}

console.log('[INFO] Done.')
