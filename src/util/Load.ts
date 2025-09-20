import { BrowserContext, Cookie } from 'rebrowser-playwright'
import { BrowserFingerprintWithHeaders } from 'fingerprint-generator'
import fs from 'fs'
import path from 'path'


import { Account } from '../interface/Account'
import { Config, ConfigSaveFingerprint } from '../interface/Config'

let configCache: Config

export function loadAccounts(): Account[] {
    try {
        // 1) CLI dev override
        let file = 'accounts.json'
        if (process.argv.includes('-dev')) {
            file = 'accounts.dev.json'
        }

        // 2) Docker-friendly env overrides
        const envJson = process.env.ACCOUNTS_JSON
        const envFile = process.env.ACCOUNTS_FILE

        let raw: string | undefined
        if (envJson && envJson.trim().startsWith('[')) {
            raw = envJson
        } else if (envFile && envFile.trim()) {
            const full = path.isAbsolute(envFile) ? envFile : path.join(process.cwd(), envFile)
            if (!fs.existsSync(full)) {
                throw new Error(`ACCOUNTS_FILE not found: ${full}`)
            }
            raw = fs.readFileSync(full, 'utf-8')
        } else {
            const accountDir = path.join(__dirname, '../', file)
            raw = fs.readFileSync(accountDir, 'utf-8')
        }

        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) throw new Error('accounts must be an array')
        // minimal shape validation
        for (const a of parsed) {
            if (!a || typeof a.email !== 'string' || typeof a.password !== 'string') {
                throw new Error('each account must have email and password strings')
            }
        }
        return parsed as Account[]
    } catch (error) {
        throw new Error(error as string)
    }
}

export function loadConfig(): Config {
    try {
        if (configCache) {
            return configCache
        }

        const configDir = path.join(__dirname, '../', 'config.json')
        const config = fs.readFileSync(configDir, 'utf-8')

        const configData = JSON.parse(config)
        configCache = configData // Set as cache

        return configData
    } catch (error) {
        throw new Error(error as string)
    }
}

export async function loadSessionData(sessionPath: string, email: string, isMobile: boolean, saveFingerprint: ConfigSaveFingerprint) {
    try {
        // Fetch cookie file
        const cookieFile = path.join(__dirname, '../browser/', sessionPath, email, `${isMobile ? 'mobile_cookies' : 'desktop_cookies'}.json`)

        let cookies: Cookie[] = []
        if (fs.existsSync(cookieFile)) {
            const cookiesData = await fs.promises.readFile(cookieFile, 'utf-8')
            cookies = JSON.parse(cookiesData)
        }

        // Fetch fingerprint file (support both legacy typo "fingerpint" and corrected "fingerprint")
        const baseDir = path.join(__dirname, '../browser/', sessionPath, email)
        const legacyFile = path.join(baseDir, `${isMobile ? 'mobile_fingerpint' : 'desktop_fingerpint'}.json`)
        const correctFile = path.join(baseDir, `${isMobile ? 'mobile_fingerprint' : 'desktop_fingerprint'}.json`)

        let fingerprint!: BrowserFingerprintWithHeaders
        const shouldLoad = (saveFingerprint.desktop && !isMobile) || (saveFingerprint.mobile && isMobile)
        if (shouldLoad) {
            const chosen = fs.existsSync(correctFile) ? correctFile : (fs.existsSync(legacyFile) ? legacyFile : '')
            if (chosen) {
                const fingerprintData = await fs.promises.readFile(chosen, 'utf-8')
                fingerprint = JSON.parse(fingerprintData)
            }
        }

        return {
            cookies: cookies,
            fingerprint: fingerprint
        }

    } catch (error) {
        throw new Error(error as string)
    }
}

export async function saveSessionData(sessionPath: string, browser: BrowserContext, email: string, isMobile: boolean): Promise<string> {
    try {
        const cookies = await browser.cookies()

        // Fetch path
        const sessionDir = path.join(__dirname, '../browser/', sessionPath, email)

        // Create session dir
        if (!fs.existsSync(sessionDir)) {
            await fs.promises.mkdir(sessionDir, { recursive: true })
        }

        // Save cookies to a file
        await fs.promises.writeFile(path.join(sessionDir, `${isMobile ? 'mobile_cookies' : 'desktop_cookies'}.json`), JSON.stringify(cookies))

        return sessionDir
    } catch (error) {
        throw new Error(error as string)
    }
}

export async function saveFingerprintData(sessionPath: string, email: string, isMobile: boolean, fingerprint: BrowserFingerprintWithHeaders): Promise<string> {
    try {
        // Fetch path
        const sessionDir = path.join(__dirname, '../browser/', sessionPath, email)

        // Create session dir
        if (!fs.existsSync(sessionDir)) {
            await fs.promises.mkdir(sessionDir, { recursive: true })
        }

    // Save fingerprint to files (write both legacy and corrected names for compatibility)
    const legacy = path.join(sessionDir, `${isMobile ? 'mobile_fingerpint' : 'desktop_fingerpint'}.json`)
    const correct = path.join(sessionDir, `${isMobile ? 'mobile_fingerprint' : 'desktop_fingerprint'}.json`)
    const payload = JSON.stringify(fingerprint)
    await fs.promises.writeFile(correct, payload)
    try { await fs.promises.writeFile(legacy, payload) } catch { /* ignore */ }

        return sessionDir
    } catch (error) {
        throw new Error(error as string)
    }
}