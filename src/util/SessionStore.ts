import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'

import type { BrowserContext } from 'patchright'
import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator'

export type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>

export interface LoadedSession {
    storageState: StorageState | null
    fingerprint: BrowserFingerprintWithHeaders | null
    updatedAt: number
    expiredCookiesRemoved: number
}

interface SessionRow {
    storage_state: string | null
    fingerprint: string | null
    updated_at: number
}

let db: DatabaseSync | null = null

function platformOf(isMobile: boolean): 'mobile' | 'desktop' {
    return isMobile ? 'mobile' : 'desktop'
}

function removeExpiredCookies(storageState: StorageState): {
    storageState: StorageState
    expiredCookiesRemoved: number
} {
    const now = Date.now() / 1000
    const cookies = storageState.cookies.filter(
        cookie => cookie.expires === -1 || !Number.isFinite(cookie.expires) || cookie.expires > now
    )
    const expiredCookiesRemoved = storageState.cookies.length - cookies.length

    return {
        storageState: expiredCookiesRemoved ? { ...storageState, cookies } : storageState,
        expiredCookiesRemoved
    }
}

function getDb(sessionPath: string): DatabaseSync {
    if (db) return db

    const dir = path.resolve(process.cwd(), sessionPath)
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    try {
        fs.chmodSync(dir, 0o700)
    } catch {}

    const dbPath = path.join(dir, 'sessions.db')
    db = new DatabaseSync(dbPath)
    try {
        fs.chmodSync(dbPath, 0o600)
    } catch {}

    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA busy_timeout = 5000')
    db.exec('PRAGMA synchronous = NORMAL')
    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            email         TEXT NOT NULL,
            platform      TEXT NOT NULL,
            storage_state TEXT,
            fingerprint   TEXT,
            updated_at    INTEGER NOT NULL,
            PRIMARY KEY (email, platform)
        )
    `)
    db.exec(`
        CREATE TABLE IF NOT EXISTS account_metadata (
            email           TEXT PRIMARY KEY COLLATE NOCASE,
            resolved_region TEXT,
            updated_at      INTEGER NOT NULL
        )
    `)

    return db
}

export function loadSession(
    sessionPath: string,
    email: string,
    isMobile: boolean,
    maxAgeMs?: number
): LoadedSession | null {
    const database = getDb(sessionPath)
    const row = database
        .prepare('SELECT storage_state, fingerprint, updated_at FROM sessions WHERE email = ? AND platform = ?')
        .get(email, platformOf(isMobile)) as SessionRow | undefined

    if (!row) return null

    if (maxAgeMs && Date.now() - row.updated_at > maxAgeMs) {
        return null
    }

    const storedState = row.storage_state ? (JSON.parse(row.storage_state) as StorageState) : null
    const sanitized = storedState ? removeExpiredCookies(storedState) : { storageState: null, expiredCookiesRemoved: 0 }

    if (sanitized.expiredCookiesRemoved) {
        database
            .prepare('UPDATE sessions SET storage_state = ? WHERE email = ? AND platform = ?')
            .run(JSON.stringify(sanitized.storageState), email, platformOf(isMobile))
    }

    return {
        storageState: sanitized.storageState,
        fingerprint: row.fingerprint ? (JSON.parse(row.fingerprint) as BrowserFingerprintWithHeaders) : null,
        updatedAt: row.updated_at,
        expiredCookiesRemoved: sanitized.expiredCookiesRemoved
    }
}

export function saveStorageState(
    sessionPath: string,
    email: string,
    isMobile: boolean,
    storageState: StorageState
): void {
    const sanitized = removeExpiredCookies(storageState).storageState

    getDb(sessionPath)
        .prepare(
            `INSERT INTO sessions (email, platform, storage_state, updated_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(email, platform)
             DO UPDATE SET storage_state = excluded.storage_state, updated_at = excluded.updated_at`
        )
        .run(email, platformOf(isMobile), JSON.stringify(sanitized), Date.now())
}

export function clearStorageState(sessionPath: string, email: string, isMobile: boolean): void {
    getDb(sessionPath)
        .prepare(
            `UPDATE sessions
             SET storage_state = NULL, updated_at = ?
             WHERE email = ? AND platform = ?`
        )
        .run(Date.now(), email, platformOf(isMobile))
}

export function saveFingerprint(
    sessionPath: string,
    email: string,
    isMobile: boolean,
    fingerprint: BrowserFingerprintWithHeaders
): void {
    getDb(sessionPath)
        .prepare(
            `INSERT INTO sessions (email, platform, fingerprint, updated_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(email, platform)
             DO UPDATE SET fingerprint = excluded.fingerprint, updated_at = excluded.updated_at`
        )
        .run(email, platformOf(isMobile), JSON.stringify(fingerprint), Date.now())
}

export function loadResolvedRegion(sessionPath: string, email: string): string | undefined {
    const row = getDb(sessionPath)
        .prepare('SELECT resolved_region FROM account_metadata WHERE email = ?')
        .get(email) as { resolved_region?: string | null } | undefined

    return row?.resolved_region ?? undefined
}

export function saveResolvedRegion(sessionPath: string, email: string, region: string): void {
    if (!/^[A-Z]{2}$/.test(region)) {
        throw new Error(`Invalid resolved account region: ${region}`)
    }

    getDb(sessionPath)
        .prepare(
            `INSERT INTO account_metadata (email, resolved_region, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(email)
             DO UPDATE SET resolved_region = excluded.resolved_region, updated_at = excluded.updated_at`
        )
        .run(email, region, Date.now())
}

export function closeSessionStore(): void {
    if (!db) return
    try {
        db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
        db.close()
    } catch {}
    db = null
}
