import { BrowserContext, Cookie } from 'rebrowser-playwright'
import { BrowserFingerprintWithHeaders } from 'fingerprint-generator'
import fs from 'fs'
import path from 'path'


import { Account } from '../interface/Account'
import { Config, ConfigSaveFingerprint } from '../interface/Config'

let configCache: Config

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
        // 处理路径
        const basePath = path.isAbsolute(sessionPath) ? sessionPath : path.join(__dirname, '../browser/', sessionPath)
        
        // Fetch cookie file
        const cookieFile = path.join(basePath, email, `${isMobile ? 'mobile_cookies' : 'desktop_cookies'}.json`)

        let cookies: Cookie[] = []
        if (fs.existsSync(cookieFile)) {
            const cookiesData = await fs.promises.readFile(cookieFile, 'utf-8')
            cookies = JSON.parse(cookiesData)
        }

        // Fetch fingerprint file
        const fingerprintFile = path.join(basePath, email, `${isMobile ? 'mobile_fingerpint' : 'desktop_fingerpint'}.json`)

        let fingerprint!: BrowserFingerprintWithHeaders
        if (((saveFingerprint.desktop && !isMobile) || (saveFingerprint.mobile && isMobile)) && fs.existsSync(fingerprintFile)) {
            const fingerprintData = await fs.promises.readFile(fingerprintFile, 'utf-8')
            fingerprint = JSON.parse(fingerprintData)
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

        // 处理路径
        const sessionDir = path.isAbsolute(sessionPath) 
            ? path.join(sessionPath, email)
            : path.join(__dirname, '../browser/', sessionPath, email)

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

export async function saveFingerprintData(sessionPath: string, email: string, isMobile: boolean, fingerpint: BrowserFingerprintWithHeaders): Promise<string> {
    try {
        // 处理路径
        const sessionDir = path.isAbsolute(sessionPath)
            ? path.join(sessionPath, email)
            : path.join(__dirname, '../browser/', sessionPath, email)

        // Create session dir
        if (!fs.existsSync(sessionDir)) {
            await fs.promises.mkdir(sessionDir, { recursive: true })
        }

        // Save fingerprint to a file
        await fs.promises.writeFile(path.join(sessionDir, `${isMobile ? 'mobile_fingerpint' : 'desktop_fingerpint'}.json`), JSON.stringify(fingerpint))

        return sessionDir
    } catch (error) {
        throw new Error(error as string)
    }
}