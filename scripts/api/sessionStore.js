import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

function resolveSessionDb(projectRoot, sessionPath) {
    const candidates = [
        path.resolve(process.cwd(), sessionPath, 'sessions.db'),
        path.join(projectRoot, sessionPath, 'sessions.db'),
        path.join(projectRoot, 'dist', sessionPath, 'sessions.db'),
        path.join(projectRoot, 'src', sessionPath, 'sessions.db')
    ]
    const dbPath = candidates.find(candidate => fs.existsSync(candidate)) ?? candidates[0]
    return { dbPath, exists: fs.existsSync(dbPath) }
}

function openDatabase(dbPath, readOnly) {
    const db = new DatabaseSync(dbPath, { readOnly })
    db.exec('PRAGMA busy_timeout = 5000')
    return db
}

function closeDatabase(db) {
    try {
        db.close()
    } catch {}
}

function cookieCount(storageState) {
    if (!storageState) return 0
    try {
        const parsed = JSON.parse(storageState)
        return Array.isArray(parsed?.cookies) ? parsed.cookies.length : 0
    } catch {
        return null
    }
}

function toSession(row) {
    const updatedAt = Number(row.updated_at)
    const updatedDate = new Date(updatedAt)
    return {
        email: row.email,
        platform: row.platform,
        updatedAt:
            Number.isFinite(updatedAt) && !Number.isNaN(updatedDate.getTime()) ? updatedDate.toISOString() : null,
        hasStorageState: Boolean(row.storage_state),
        hasFingerprint: Boolean(row.fingerprint),
        cookieCount: cookieCount(row.storage_state)
    }
}

export function listStoredSessions(projectRoot, sessionPath) {
    const { dbPath, exists } = resolveSessionDb(projectRoot, sessionPath)
    if (!exists) {
        return { databaseExists: false, sessions: [], count: 0, accounts: 0 }
    }

    const db = openDatabase(dbPath, true)
    try {
        const rows = db
            .prepare(
                `SELECT email, platform, storage_state, fingerprint, updated_at
                 FROM sessions
                 ORDER BY LOWER(email), platform`
            )
            .all()
        return {
            databaseExists: true,
            sessions: rows.map(toSession),
            count: rows.length,
            accounts: new Set(rows.map(row => row.email.toLowerCase())).size
        }
    } finally {
        closeDatabase(db)
    }
}

export function deleteStoredSessions(projectRoot, sessionPath, email) {
    const { dbPath, exists } = resolveSessionDb(projectRoot, sessionPath)
    if (!exists) return { found: false, removed: 0, email, platforms: [] }

    const db = openDatabase(dbPath, false)
    try {
        const matches = db
            .prepare('SELECT email, platform FROM sessions WHERE LOWER(email) = LOWER(?) ORDER BY platform')
            .all(email)

        if (!matches.length) return { found: false, removed: 0, email, platforms: [] }

        const result = db.prepare('DELETE FROM sessions WHERE LOWER(email) = LOWER(?)').run(email)
        try {
            db.prepare('DELETE FROM account_metadata WHERE LOWER(email) = LOWER(?)').run(email)
        } catch {}
        try {
            db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
        } catch {}

        return {
            found: true,
            removed: Number(result.changes ?? 0),
            email: matches[0].email,
            platforms: [...new Set(matches.map(row => row.platform))]
        }
    } finally {
        closeDatabase(db)
    }
}
