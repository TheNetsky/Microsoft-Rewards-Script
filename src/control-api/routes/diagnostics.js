import fs from 'node:fs'
import path from 'node:path'
import { sendJson } from '../http.js'

const DIAGNOSTIC_FILES = {
    'screenshot.png': 'image/png',
    'error.txt': 'text/plain; charset=utf-8',
    'metadata.json': 'application/json',
    'dump.html': 'application/octet-stream'
}

function diagnosticPath(directory, name, file) {
    try {
        const root = fs.realpathSync(directory)
        const full = fs.realpathSync(path.join(root, name, file))
        const relative = path.relative(root, full)
        if (relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || !relative) return null
        return full
    } catch {
        return null
    }
}

function listDiagnostics(directory) {
    let entries
    try {
        entries = fs
            .readdirSync(directory, { withFileTypes: true })
            .filter(item => item.isDirectory() && item.name.startsWith('error-'))
            .map(item => {
                const full = path.join(directory, item.name)
                let files = []
                let createdAt = null
                let error = null
                try {
                    files = fs.readdirSync(full)
                    createdAt = fs.statSync(full).mtime.toISOString()
                    const errorFile = diagnosticPath(directory, item.name, 'error.txt')
                    if (errorFile) error = fs.readFileSync(errorFile, 'utf8').slice(0, 2000)
                } catch {
                    //Ignore
                }
                return {
                    name: item.name,
                    createdAt,
                    hasScreenshot: files.includes('screenshot.png'),
                    hasHtml: files.includes('dump.html'),
                    hasError: files.includes('error.txt'),
                    error
                }
            })
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    } catch {
        entries = []
    }
    return { dir: directory, count: entries.length, entries }
}

function serveDiagnosticFile(directory, res, pathname) {
    let parts
    try {
        parts = pathname.slice('/diagnostics/'.length).split('/').filter(Boolean).map(decodeURIComponent)
    } catch {
        return sendJson(res, 400, { error: 'Invalid diagnostics path encoding' })
    }
    if (parts.length !== 2) return sendJson(res, 404, { error: 'Not found' })
    const [name, file] = parts
    if (!/^error-[A-Za-z0-9._:-]+$/.test(name) || !Object.hasOwn(DIAGNOSTIC_FILES, file))
        return sendJson(res, 400, { error: 'Invalid diagnostics path' })
    const full = diagnosticPath(directory, name, file)
    if (!full) return sendJson(res, 404, { error: 'Not found' })
    const headers = { 'Content-Type': DIAGNOSTIC_FILES[file] }
    if (file === 'dump.html') headers['Content-Disposition'] = `attachment; filename="${name}-dump.html"`
    res.writeHead(200, headers)
    const stream = fs.createReadStream(full)
    stream.on('error', () => res.destroy())
    stream.pipe(res)
}

export function createDiagnosticRoutes(directory) {
    return (req, res, url, method, pathname) => {
        if (method === 'GET' && pathname === '/diagnostics') return sendJson(res, 200, listDiagnostics(directory))
        if (method === 'GET' && pathname.startsWith('/diagnostics/'))
            return serveDiagnosticFile(directory, res, pathname)
        return sendJson(res, 404, { error: 'Not found', path: pathname })
    }
}
