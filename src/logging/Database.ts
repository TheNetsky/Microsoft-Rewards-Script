import { DatabaseSync } from 'node:sqlite'
import path from 'path'

import type { AccountStats } from '../index'
import type { ConfigSaveResults } from '../interface/Config'

export class Database {
    private db: DatabaseSync | null = null

    constructor(config?: ConfigSaveResults) {
        if (!config?.enabled) {
            return
        }

        const dbPath = config.dbPath || 'accounts.db'
        const fullPath = path.resolve(process.cwd(), dbPath)

        this.db = new DatabaseSync(fullPath)
        this.initDatabase()
    }

    private initDatabase() {
        this.db!.exec(`
            CREATE TABLE IF NOT EXISTS account_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                initialPoints INTEGER NOT NULL,
                finalPoints INTEGER NOT NULL,
                collectedPoints INTEGER NOT NULL,
                duration REAL NOT NULL,
                success INTEGER NOT NULL,
                error TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `)
    }

    public saveAccountResult(stats: AccountStats) {
        if (!this.db) {
            return
        }

        const stmt = this.db.prepare(`
            INSERT INTO account_results (
                email, initialPoints, finalPoints, collectedPoints, duration, success, error
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `)

        stmt.run(
            stats.email,
            stats.initialPoints,
            stats.finalPoints,
            stats.collectedPoints,
            stats.duration,
            stats.success ? 1 : 0,
            stats.error || null
        )
    }
}
