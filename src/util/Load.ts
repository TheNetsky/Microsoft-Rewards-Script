import { BrowserContext, Cookie } from 'playwright'
import { BrowserFingerprintWithHeaders } from 'fingerprint-generator'
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

export async function loadSessionData(sessionPath: string, email: string, isMobile: boolean, getFingerprint: boolean) {
    try {
        // Fetch cookie file
        const cookieFile = path.join(__dirname, '../browser/', sessionPath, email, `${isMobile ? 'mobile_cookies' : 'desktop_cookies'}.json`)

        let cookies: Cookie[] = []
        if (fs.existsSync(cookieFile)) {
            const cookiesData = await fs.promises.readFile(cookieFile, 'utf-8')
            cookies = JSON.parse(cookiesData)
        }

        // Fetch fingerprint file
        const fingerprintFile = path.join(__dirname, '../browser/', sessionPath, email, `${isMobile ? 'mobile_fingerpint' : 'desktop_fingerpint'}.json`)

        let fingerprint!: BrowserFingerprintWithHeaders
        if (getFingerprint && fs.existsSync(fingerprintFile)) {
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

export async function saveFingerprintData(sessionPath: string, email: string, isMobile: boolean, fingerpint: BrowserFingerprintWithHeaders): Promise<string> {
    try {
        // Fetch path
        const sessionDir = path.join(__dirname, '../browser/', sessionPath, email)

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