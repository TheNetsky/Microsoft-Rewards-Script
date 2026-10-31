import type { DatabaseSync } from 'node:sqlite'
import { openSessionDb, ensureSessionSchema, closeSessionDb } from '../../scripts/lib/sessionDatabase.cjs'
import fs from 'node:fs'
import path from 'node:path'

import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator'
import { createSessionState, type StorageState } from './SessionState'

export type { StorageState } from './SessionState'

export interface LoadedSession {
    storageState: StorageState | null
    fingerprint: BrowserFingerprintWithHeaders | null
    updatedAt: number
    expiredCookiesRemoved: number
    unrelatedCookiesRemoved: number
    originsRemoved: number
}

interface SessionRow {
    storage_state: string | null
    fingerprint: string | null
    updated_at: number
}

let db: DatabaseSync | null = null
let activeDirectory = ''

function platformOf(isMobile: boolean): 'mobile' | 'desktop' {
    return isMobile ? 'mobile' : 'desktop'
}

function getDb(sessionPath: string): DatabaseSync {
    const requestedDirectory = path.resolve(process.cwd(), sessionPath)
    if (db && activeDirectory === requestedDirectory) return db
    if (db) closeSessionStore()
    activeDirectory = requestedDirectory

    const dir = path.resolve(process.cwd(), sessionPath)
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    try {
        fs.chmodSync(dir, 0o700)
    } catch {
        // Ignore
    }

    const dbPath = path.join(dir, 'sessions.db')
    db = openSessionDb(dbPath)
    try {
        fs.chmodSync(dbPath, 0o600)
    } catch {
        // Ignore
    }

    ensureSessionSchema(db)

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
    const storageState = storedState ? createSessionState(storedState.cookies) : null
    const now = Date.now() / 1000
    const expiredCookiesRemoved =
        storedState?.cookies.filter(
            cookie => cookie.expires !== -1 && Number.isFinite(cookie.expires) && cookie.expires <= now
        ).length ?? 0
    const unrelatedCookiesRemoved =
        (storedState?.cookies.length ?? 0) - (storageState?.cookies.length ?? 0) - expiredCookiesRemoved
    const originsRemoved = storedState?.origins.length ?? 0

    if (expiredCookiesRemoved || unrelatedCookiesRemoved || originsRemoved) {
        database
            .prepare('UPDATE sessions SET storage_state = ? WHERE email = ? AND platform = ?')
            .run(JSON.stringify(storageState), email, platformOf(isMobile))
    }

    return {
        storageState,
        fingerprint: row.fingerprint ? (JSON.parse(row.fingerprint) as BrowserFingerprintWithHeaders) : null,
        updatedAt: row.updated_at,
        expiredCookiesRemoved,
        unrelatedCookiesRemoved,
        originsRemoved
    }
}

export function saveStorageState(
    sessionPath: string,
    email: string,
    isMobile: boolean,
    storageState: StorageState
): void {
    const sanitized = createSessionState(storageState.cookies)

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
    closeSessionDb(db, { checkpoint: true })
    db = null
    activeDirectory = ''
}
