const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

function getProjectRoot(startDir = process.cwd()) {
    let dir = path.resolve(startDir)
    let nearest
    while (true) {
        const file = path.join(dir, 'package.json')
        if (fs.existsSync(file)) {
            nearest ??= dir
            try {
                if (JSON.parse(fs.readFileSync(file, 'utf8')).name) return dir
            } catch {
                /* Continue to the parent project when package metadata is incomplete. */
            }
        }
        const parent = path.dirname(dir)
        if (parent === dir) break
        dir = parent
    }
    if (nearest) return nearest
    throw new Error('Could not locate project root (package.json not found)')
}

function resolveProjectFile(filename, root = getProjectRoot()) {
    return [
        path.resolve(process.cwd(), filename),
        path.join(root, filename),
        path.join(root, 'dist', filename),
        path.join(root, 'src', filename)
    ].find(file => fs.existsSync(file))
}

function loadEnvFile(root) {
    const file = resolveProjectFile('.env', root)
    if (!file) return null
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const text = line.trim()
        if (!text || text.startsWith('#')) continue
        const separator = text.indexOf('=')
        if (separator < 1) continue
        const key = text.slice(0, separator).trim()
        let value = text.slice(separator + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
            value = value.slice(1, -1)
        if (process.env[key] === undefined) process.env[key] = value
    }
    return file
}

function writeJsonAtomic(requested, value, { backup = true } = {}) {
    const target = fs.existsSync(requested) ? fs.realpathSync(requested) : requested
    fs.mkdirSync(path.dirname(target), { recursive: true })
    let backupPath
    if (backup && fs.existsSync(target)) {
        backupPath = `${target}.bak`
        fs.copyFileSync(target, backupPath)
        fs.chmodSync(backupPath, 0o600)
    }
    const tmp = `${target}.${process.pid}.${randomUUID()}.tmp`
    try {
        fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
        fs.renameSync(tmp, target)
    } finally {
        fs.rmSync(tmp, { force: true })
    }
    return { backupPath }
}

module.exports = { getProjectRoot, resolveProjectFile, loadEnvFile, writeJsonAtomic }
