import { BrowserContext, Cookie } from 'rebrowser-playwright'
import { BrowserFingerprintWithHeaders } from 'fingerprint-generator'
import fs from 'fs'
import path from 'path'


import { Account } from '../interface/Account'
import { Config, ConfigSaveFingerprint } from '../interface/Config'

let configCache: Config
let configSourcePath = ''

// Basic JSON comment stripper (supports // line and /* block */ comments while preserving strings)
function stripJsonComments(input: string): string {
    let out = ''
    let inString = false
    let stringChar = ''
    let inLine = false
    let inBlock = false
    for (let i = 0; i < input.length; i++) {
        const ch = input[i]!
        const next = input[i + 1]
        if (inLine) {
            if (ch === '\n' || ch === '\r') {
                inLine = false
                out += ch
            }
            continue
        }
        if (inBlock) {
            if (ch === '*' && next === '/') {
                inBlock = false
                i++
            }
            continue
        }
        if (inString) {
            out += ch
            if (ch === '\\') { // escape next char
                i++
                if (i < input.length) out += input[i]
                continue
            }
            if (ch === stringChar) {
                inString = false
            }
            continue
        }
        if (ch === '"' || ch === '\'') {
            inString = true
            stringChar = ch
            out += ch
            continue
        }
        if (ch === '/' && next === '/') {
            inLine = true
            i++
            continue
        }
        if (ch === '/' && next === '*') {
            inBlock = true
            i++
            continue
        }
        out += ch
    }
    return out
}

// Normalize both legacy (flat) and new (nested) config schemas into the flat Config interface
function normalizeConfig(raw: unknown): Config {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const n: any = (raw as any) || {}

    // Browser / execution
    const headless = n.browser?.headless ?? n.headless ?? false
    const globalTimeout = n.browser?.globalTimeout ?? n.globalTimeout ?? '30s'
    const parallel = n.execution?.parallel ?? n.parallel ?? false
    const runOnZeroPoints = n.execution?.runOnZeroPoints ?? n.runOnZeroPoints ?? false
    const clusters = n.execution?.clusters ?? n.clusters ?? 1
    const passesPerRun = n.execution?.passesPerRun ?? n.passesPerRun

    // Search
    const useLocalQueries = n.search?.useLocalQueries ?? n.searchOnBingLocalQueries ?? false
    const searchSettingsSrc = n.search?.settings ?? n.searchSettings ?? {}
    const delaySrc = searchSettingsSrc.delay ?? searchSettingsSrc.searchDelay ?? { min: '3min', max: '5min' }
    const searchSettings = {
        useGeoLocaleQueries: !!(searchSettingsSrc.useGeoLocaleQueries ?? false),
        scrollRandomResults: !!(searchSettingsSrc.scrollRandomResults ?? false),
        clickRandomResults: !!(searchSettingsSrc.clickRandomResults ?? false),
        retryMobileSearchAmount: Number(searchSettingsSrc.retryMobileSearchAmount ?? 2),
        searchDelay: {
            min: delaySrc.min ?? '3min',
            max: delaySrc.max ?? '5min'
        },
        localFallbackCount: Number(searchSettingsSrc.localFallbackCount ?? 25),
        extraFallbackRetries: Number(searchSettingsSrc.extraFallbackRetries ?? 1)
    }

    // Workers
    const workers = n.workers ?? {
        doDailySet: true,
        doMorePromotions: true,
        doPunchCards: true,
        doDesktopSearch: true,
        doMobileSearch: true,
        doDailyCheckIn: true,
        doReadToEarn: true,
        bundleDailySetWithSearch: false
    }
    // Ensure missing flag gets a default
    if (typeof workers.bundleDailySetWithSearch !== 'boolean') workers.bundleDailySetWithSearch = false

    // Logging
    const logging = n.logging ?? {}
    const logExcludeFunc = Array.isArray(logging.excludeFunc) ? logging.excludeFunc : (n.logExcludeFunc ?? [])
    const webhookLogExcludeFunc = Array.isArray(logging.webhookExcludeFunc) ? logging.webhookExcludeFunc : (n.webhookLogExcludeFunc ?? [])

    // Notifications
    const notifications = n.notifications ?? {}
    const webhook = notifications.webhook ?? n.webhook ?? { enabled: false, url: '' }
    const conclusionWebhook = notifications.conclusionWebhook ?? n.conclusionWebhook ?? { enabled: false, url: '' }
    const ntfy = notifications.ntfy ?? n.ntfy ?? { enabled: false, url: '', topic: '', authToken: '' }

    // Buy Mode
    const buyMode = n.buyMode ?? {}
    const buyModeEnabled = typeof buyMode.enabled === 'boolean' ? buyMode.enabled : false
    const buyModeMax = typeof buyMode.maxMinutes === 'number' ? buyMode.maxMinutes : 45

    // Fingerprinting
    const saveFingerprint = (n.fingerprinting?.saveFingerprint ?? n.saveFingerprint) ?? { mobile: false, desktop: false }

    // Humanization defaults (single on/off)
    if (!n.humanization) n.humanization = {}
    if (typeof n.humanization.enabled !== 'boolean') n.humanization.enabled = true
    if (typeof n.humanization.stopOnBan !== 'boolean') n.humanization.stopOnBan = false
    if (typeof n.humanization.immediateBanAlert !== 'boolean') n.humanization.immediateBanAlert = true
    if (typeof n.humanization.randomOffDaysPerWeek !== 'number') {
        n.humanization.randomOffDaysPerWeek = 1
    }
    // Strong default gestures when enabled (explicit values still win)
    if (typeof n.humanization.gestureMoveProb !== 'number') {
        n.humanization.gestureMoveProb = n.humanization.enabled === false ? 0 : 0.5
    }
    if (typeof n.humanization.gestureScrollProb !== 'number') {
        n.humanization.gestureScrollProb = n.humanization.enabled === false ? 0 : 0.25
    }

    // Vacation mode (monthly contiguous off-days)
    if (!n.vacation) n.vacation = {}
    if (typeof n.vacation.enabled !== 'boolean') n.vacation.enabled = false
    const vMin = Number(n.vacation.minDays)
    const vMax = Number(n.vacation.maxDays)
    n.vacation.minDays = isFinite(vMin) && vMin > 0 ? Math.floor(vMin) : 3
    n.vacation.maxDays = isFinite(vMax) && vMax > 0 ? Math.floor(vMax) : 5
    if (n.vacation.maxDays < n.vacation.minDays) {
        const t = n.vacation.minDays; n.vacation.minDays = n.vacation.maxDays; n.vacation.maxDays = t
    }

    const cfg: Config = {
        baseURL: n.baseURL ?? 'https://rewards.bing.com',
        sessionPath: n.sessionPath ?? 'sessions',
        headless,
        parallel,
        runOnZeroPoints,
        clusters,
        saveFingerprint,
        workers,
        searchOnBingLocalQueries: !!useLocalQueries,
        globalTimeout,
        searchSettings,
    humanization: n.humanization,
        retryPolicy: n.retryPolicy,
        jobState: n.jobState,
        logExcludeFunc,
        webhookLogExcludeFunc,
    logging, // retain full logging object for live webhook usage
    proxy: n.proxy ?? { proxyGoogleTrends: true, proxyBingTerms: true },
        webhook,
        conclusionWebhook,
        ntfy,
        diagnostics: n.diagnostics,
        update: n.update,
        schedule: n.schedule,
    passesPerRun: passesPerRun,
        vacation: n.vacation,
        buyMode: { enabled: buyModeEnabled, maxMinutes: buyModeMax },
        crashRecovery: n.crashRecovery || {}
    }

    return cfg
}

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
            // Try multiple locations to support both root mounts and dist mounts
            const candidates = [
                path.join(__dirname, '../', file),               // root/accounts.json (preferred)
                path.join(__dirname, '../src', file),            // fallback: file kept inside src/
                path.join(process.cwd(), file),                  // cwd override
                path.join(process.cwd(), 'src', file),           // cwd/src/accounts.json
                path.join(__dirname, file)                       // dist/accounts.json (legacy)
            ]
            let chosen: string | null = null
            for (const p of candidates) {
                try { if (fs.existsSync(p)) { chosen = p; break } } catch { /* ignore */ }
            }
            if (!chosen) throw new Error(`accounts file not found in: ${candidates.join(' | ')}`)
            raw = fs.readFileSync(chosen, 'utf-8')
        }

        // Support comments in accounts file (same as config)
        const cleaned = stripJsonComments(raw)
        const parsedUnknown = JSON.parse(cleaned)
        // Accept either a root array or an object with an `accounts` array, ignore `_note`
        const parsed = Array.isArray(parsedUnknown) ? parsedUnknown : (parsedUnknown && typeof parsedUnknown === 'object' && Array.isArray((parsedUnknown as { accounts?: unknown }).accounts) ? (parsedUnknown as { accounts: unknown[] }).accounts : null)
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

export function getConfigPath(): string { return configSourcePath }

export function loadConfig(): Config {
    try {
        if (configCache) {
            return configCache
        }

        // Resolve config.json from common locations
        const candidates = [
            path.join(__dirname, '../', 'config.json'),          // root/config.json when compiled (expected primary)
            path.join(__dirname, '../src', 'config.json'),       // fallback: running compiled dist but file still in src/
            path.join(process.cwd(), 'config.json'),             // cwd root
            path.join(process.cwd(), 'src', 'config.json'),      // running from repo root but config left in src/
            path.join(__dirname, 'config.json')                  // last resort: dist/util/config.json
        ]
    let cfgPath: string | null = null
        for (const p of candidates) {
            try { if (fs.existsSync(p)) { cfgPath = p; break } } catch { /* ignore */ }
        }
        if (!cfgPath) throw new Error(`config.json not found in: ${candidates.join(' | ')}`)
        const config = fs.readFileSync(cfgPath, 'utf-8')
        const text = config.replace(/^\uFEFF/, '')
        const raw = JSON.parse(stripJsonComments(text))
    const normalized = normalizeConfig(raw)
    configCache = normalized // Set as cache
    configSourcePath = cfgPath

    return normalized
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