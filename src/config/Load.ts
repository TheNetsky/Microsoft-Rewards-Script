import fs from 'node:fs'
import { getProjectRoot, resolveProjectFile, loadEnvFile } from '../../scripts/lib/projectFiles.cjs'
import { loadAccountSettings } from '../../scripts/lib/env.js'

import type { Account } from '../core/Account'
import type { Config } from './Config'
import { validateAccounts } from './Validator'
import { resolveConfigOverrides } from './ConfigEnvOverrides'
import { logSystemMessage } from '../logging/LogEvent'

let configCache: Config
let envLoaded = false

function ensureEnvLoaded(): void {
    if (envLoaded) return
    envLoaded = true
    loadEnvFile(getProjectRoot(__dirname))
}

export function loadAccounts(): Account[] {
    ensureEnvLoaded()
    const accounts = loadAccountSettings(process.env, message => logSystemMessage('warn', 'ACCOUNTS', message))
    if (!accounts.length)
        throw new Error('No accounts found in environment. Set at least one ACCOUNT_N_EMAIL (see env.example).')
    return validateAccounts(accounts)
}

export function loadConfig(): Config {
    try {
        if (configCache) {
            return configCache
        }

        // Check root -> dist -> src (not in dist, but root)
        const configPath = resolveProjectFile('config.json', getProjectRoot(__dirname))
        if (!configPath) {
            throw new Error(
                'config.json not found - place it in the project root (dist/ and src/ are also searched as fallbacks)'
            )
        }
        const config = fs.readFileSync(configPath, 'utf-8')

        const unverifiedConfig = JSON.parse(config)
        ensureEnvLoaded()
        const configData = resolveConfigOverrides(unverifiedConfig)

        configCache = configData

        return configData
    } catch (error) {
        if (error instanceof Error) throw error
        throw new Error(String(error))
    }
}
