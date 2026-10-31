const fs = require('node:fs')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')

function getSessionDbPath(projectRoot, sessionPath) {
    const candidates = [
        path.resolve(process.cwd(), sessionPath, 'sessions.db'),
        ...[projectRoot, path.join(projectRoot, 'dist'), path.join(projectRoot, 'src')].map(root =>
            path.resolve(root, sessionPath, 'sessions.db')
        )
    ]
    const found = candidates.find(candidate => fs.existsSync(candidate))
    return { dbPath: found ?? candidates[0], exists: Boolean(found), candidates }
}

function openSessionDb(dbPath, { readonly = false } = {}) {
    const db = new DatabaseSync(dbPath, { readOnly: readonly })
    db.exec('PRAGMA busy_timeout = 5000')
    return db
}

function ensureSessionSchema(db) {
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA synchronous = NORMAL')
    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            email TEXT NOT NULL,
            platform TEXT NOT NULL,
            storage_state TEXT,
            fingerprint TEXT,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (email, platform)
        );
        CREATE TABLE IF NOT EXISTS account_metadata (
            email TEXT PRIMARY KEY COLLATE NOCASE,
            resolved_region TEXT,
            updated_at INTEGER NOT NULL
        );
    `)
}

function closeSessionDb(db, { checkpoint = false } = {}) {
    if (checkpoint) {
        try {
            db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
        } catch {
            /* Other readers may still hold the WAL. */
        }
    }
    try {
        db.close()
    } catch {
        /* A cleanup path may already have closed the connection. */
    }
}

function clearSessionRows(db, email) {
    const info = email
        ? db.prepare('DELETE FROM sessions WHERE LOWER(email) = LOWER(?)').run(email)
        : db.prepare('DELETE FROM sessions').run()
    try {
        if (email) db.prepare('DELETE FROM account_metadata WHERE LOWER(email) = LOWER(?)').run(email)
        else db.prepare('DELETE FROM account_metadata').run()
    } catch {
        /* Older databases may not have account metadata yet. */
    }
    return Number(info.changes)
}

module.exports = { getSessionDbPath, openSessionDb, ensureSessionSchema, closeSessionDb, clearSessionRows }
