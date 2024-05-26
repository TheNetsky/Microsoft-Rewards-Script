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
        const configDir = path.join(__dirname, '../', 'config.json');
        const configContent = fs.readFileSync(configDir, 'utf-8');
        const config: Config = JSON.parse(configContent);

        // Override with environment variables if provided
        config.baseURL = process.env.BASE_URL || config.baseURL;
        config.sessionPath = process.env.SESSION_PATH || config.sessionPath;
        config.headless = process.env.HEADLESS ? process.env.HEADLESS === 'true' : config.headless;
        config.runOnZeroPoints = process.env.RUN_ON_ZERO_POINTS ? process.env.RUN_ON_ZERO_POINTS === 'true' : config.runOnZeroPoints;
        config.clusters = process.env.CLUSTERS ? parseInt(process.env.CLUSTERS) : config.clusters;
        config.saveFingerprint = process.env.SAVE_FINGERPRINT ? process.env.SAVE_FINGERPRINT === 'true' : config.saveFingerprint;

        config.workers.doDailySet = process.env.DO_DAILY_SET ? process.env.DO_DAILY_SET === 'true' : config.workers.doDailySet;
        config.workers.doMorePromotions = process.env.DO_MORE_PROMOTIONS ? process.env.DO_MORE_PROMOTIONS === 'true' : config.workers.doMorePromotions;
        config.workers.doPunchCards = process.env.DO_PUNCH_CARDS ? process.env.DO_PUNCH_CARDS === 'true' : config.workers.doPunchCards;
        config.workers.doDesktopSearch = process.env.DO_DESKTOP_SEARCH ? process.env.DO_DESKTOP_SEARCH === 'true' : config.workers.doDesktopSearch;
        config.workers.doMobileSearch = process.env.DO_MOBILE_SEARCH ? process.env.DO_MOBILE_SEARCH === 'true' : config.workers.doMobileSearch;

        config.globalTimeout = process.env.GLOBAL_TIMEOUT ? parseInt(process.env.GLOBAL_TIMEOUT) : config.globalTimeout;

        config.searchSettings.useGeoLocaleQueries = process.env.USE_GEO_LOCALE_QUERIES ? process.env.USE_GEO_LOCALE_QUERIES === 'true' : config.searchSettings.useGeoLocaleQueries;
        config.searchSettings.scrollRandomResults = process.env.SCROLL_RANDOM_RESULTS ? process.env.SCROLL_RANDOM_RESULTS === 'true' : config.searchSettings.scrollRandomResults;
        config.searchSettings.clickRandomResults = process.env.CLICK_RANDOM_RESULTS ? process.env.CLICK_RANDOM_RESULTS === 'true' : config.searchSettings.clickRandomResults;

        config.searchSettings.searchDelay.min = process.env.SEARCH_DELAY_MIN ? parseInt(process.env.SEARCH_DELAY_MIN) : config.searchSettings.searchDelay.min;
        config.searchSettings.searchDelay.max = process.env.SEARCH_DELAY_MAX ? parseInt(process.env.SEARCH_DELAY_MAX) : config.searchSettings.searchDelay.max;

        config.searchSettings.retryMobileSearch = process.env.RETRY_MOBILE_SEARCH ? process.env.RETRY_MOBILE_SEARCH === 'true' : config.searchSettings.retryMobileSearch;

        config.webhook.enabled = process.env.WEBHOOK_ENABLED ? process.env.WEBHOOK_ENABLED === 'true' : config.webhook.enabled;
        config.webhook.url = process.env.WEBHOOK_URL || config.webhook.url;

        return config;
    } catch (error) {
        throw new Error(error as string);
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