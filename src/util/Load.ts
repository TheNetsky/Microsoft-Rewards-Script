import fs from 'fs'
import path from 'path'

import { Account } from '../interface/Account'
import { Config } from '../interface/Config'


export function loadAccounts(): Account[] {
    try {
        let file = 'accounts.json'

        // If dev mode, use dev account(s)
        if (process.argv.includes('-dev')) {
            file = 'accounts.dev.json'
        }

        const accountDir = path.join(__dirname, '../', file)
        const accounts = fs.readFileSync(accountDir, 'utf-8')

        return JSON.parse(accounts)
    } catch (error) {
        throw new Error(error as string)
    }
}

export function loadConfig(): Config {
    try {
        const configDir = path.join(__dirname, '../', 'config.json')
        const config = fs.readFileSync(configDir, 'utf-8')

        return JSON.parse(config)
    } catch (error) {
        throw new Error(error as string)
    }
}

export async function loadSesion(sessionPath: string, email: string): Promise<string> {
    try {
        // Fetch path
        const sessionDir = path.join(__dirname, '../browser/', sessionPath, email)

        // Create session dir
        if (!fs.existsSync(sessionDir)) {
            await fs.promises.mkdir(sessionDir, { recursive: true })
        }

        return sessionDir
    } catch (error) {
        throw new Error(error as string)
    }
}