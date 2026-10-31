import {
    getSessionDbPath,
    openSessionDb,
    closeSessionDb,
    clearSessionRows
} from '../../scripts/lib/sessionDatabase.cjs'

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
    const { dbPath, exists } = getSessionDbPath(projectRoot, sessionPath)
    if (!exists) {
        return { databaseExists: false, sessions: [], count: 0, accounts: 0 }
    }

    const db = openSessionDb(dbPath, { readonly: true })
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
            accounts: new Set(rows.map(row => String(row.email).toLowerCase())).size
        }
    } finally {
        closeSessionDb(db)
    }
}

export function deleteStoredSessions(projectRoot, sessionPath, email) {
    const { dbPath, exists } = getSessionDbPath(projectRoot, sessionPath)
    if (!exists) return { found: false, removed: 0, email, platforms: [] }

    const db = openSessionDb(dbPath)
    try {
        const matches = db
            .prepare('SELECT email, platform FROM sessions WHERE LOWER(email) = LOWER(?) ORDER BY platform')
            .all(email)

        if (!matches.length) return { found: false, removed: 0, email, platforms: [] }

        const removed = clearSessionRows(db, email)

        return {
            found: true,
            removed,
            email: matches[0]?.email ?? email,
            platforms: [...new Set(matches.map(row => row.platform))]
        }
    } finally {
        closeSessionDb(db, { checkpoint: true })
    }
}
