import path from 'path'
import fs from 'fs'
import {
    getDirname,
    getProjectRoot,
    log,
    loadJsonFile,
    safeRemoveDirectory
} from '../utils.js'

const __dirname = getDirname(import.meta.url)
const projectRoot = getProjectRoot(__dirname)

const possibleConfigPaths = [
    path.join(projectRoot, 'config.json'),
    path.join(projectRoot, 'src', 'config.json'),
    path.join(projectRoot, 'dist', 'config.json')
]

log('DEBUG', 'Project root:', projectRoot)
log('DEBUG', 'Searching for config.json...')

const configResult = loadJsonFile(possibleConfigPaths, true)
const config = configResult.data
const configPath = configResult.path

log('INFO', 'Using config:', configPath)

if (!config.sessionPath) {
    log('ERROR', 'Invalid config.json - missing required field: sessionPath')
    log('ERROR', `Config file: ${configPath}`)
    process.exit(1)
}

log('INFO', 'Session path from config:', config.sessionPath)

const configDir = path.dirname(configPath)
const possibleSessionDirs = [
    path.resolve(configDir, config.sessionPath),
    path.join(projectRoot, 'src/browser', config.sessionPath),
    path.join(projectRoot, 'dist/browser', config.sessionPath)
]

log('DEBUG', 'Searching for session directory...')

let sessionDir = null
for (const p of possibleSessionDirs) {
    log('DEBUG', 'Checking:', p)
    if (fs.existsSync(p)) {
        sessionDir = p
        log('DEBUG', 'Found session directory at:', p)
        break
    }
}

if (!sessionDir) {
    sessionDir = path.resolve(configDir, config.sessionPath)
    log('DEBUG', 'Using fallback session directory:', sessionDir)
}

const success = safeRemoveDirectory(sessionDir, projectRoot)

if (!success) {
    process.exit(1)
}

log('INFO', 'Done.')