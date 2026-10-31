import type { DatabaseSync } from 'node:sqlite'
export function getSessionDbPath(
    projectRoot: string,
    sessionPath: string
): { dbPath: string; exists: boolean; candidates: string[] }
export function openSessionDb(dbPath: string, options?: { readonly?: boolean }): DatabaseSync
export function ensureSessionSchema(db: DatabaseSync): void
export function closeSessionDb(db: DatabaseSync, options?: { checkpoint?: boolean }): void
export function clearSessionRows(db: DatabaseSync, email?: string): number
