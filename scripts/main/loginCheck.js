/* global window */

/**
 * Headless login health-check + live balance probe for one account.
 *
 * Restores the saved mobile/desktop session, opens rewards.bing.com and
 * verifies the session still lands on the Rewards page (not a login redirect),
 * then reads the live balance from the Rewards user-info API. Refreshed cookies
 * are saved back to the session store so a passing check also extends the
 * session's life.
 *
 * Usage:
 *   node scripts/main/loginCheck.js --email user@example.com [--platform mobile|desktop|both]
 *
 * Output: the last stdout line is machine-readable:
 *   LOGINCHECK_RESULT {"email":"...","balance":1234,"platforms":{...}}
 * Everything before it is human-readable progress logging.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { FingerprintGenerator } from 'fingerprint-generator'
import { newInjectedContext } from 'fingerprint-injector'
import ms from 'ms'
import { chromium } from 'patchright'

import {
    buildProxyConfig,
    closeSessionDb,
    ensureSessionSchema,
    findAccountByEmail,
    getDirname,
    getProjectRoot,
    getSessionDbPath,
    loadAccountsFromEnv,
    loadConfig,
    loadResolvedRegionRow,
    loadSessionRow,
    log,
    openSessionDb,
    parseArgs,
    resolveEmailArgument,
    saveSessionRow
} from '../utils.js'
import { isRewardsPage, parsePlatforms, resolveGlobalTimeoutMs } from './manualLogin.js'

const REWARDS_URL = 'https://rewards.bing.com/'
const USER_INFO_PATH = '/api/getuserinfo'
const OVERALL_TIMEOUT_MS = 150000

const BROWSER_ARGS = [
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding'
]

const __dirname = getDirname(import.meta.url)
const projectRoot = getProjectRoot(__dirname)

function normalizeCountry(value) {
    if (!value) return undefined
    const country = String(value).trim().toUpperCase()
    return /^[A-Z]{2}$/.test(country) ? country : undefined
}

function resolveLocale(account, resolvedCountry) {
    const languageTag = new Intl.Locale(account.langCode || 'en').toString()
    const language = new Intl.Locale(languageTag).language.toLowerCase()
    const configuredCountry = account.geoLocale.toLowerCase() === 'auto' ? undefined : normalizeCountry(account.geoLocale)
    const country = configuredCountry ?? normalizeCountry(resolvedCountry) ?? normalizeCountry(new Intl.Locale(languageTag).region)
    const locale = country ? new Intl.Locale(languageTag, { region: country }).toString() : languageTag
    return { locale, acceptedLocales: [locale] }
}

function createFingerprint(isMobile, locale) {
    const hostOs = process.platform === 'darwin' ? 'macos' : process.platform === 'linux' ? 'linux' : 'windows'
    return new FingerprintGenerator().getFingerprint({
        devices: isMobile ? ['mobile'] : ['desktop'],
        operatingSystems: isMobile ? ['android'] : [hostOs],
        browsers: [{ name: 'edge' }],
        locales: locale.acceptedLocales
    })
}

function loadStoredSession(dbPath, email, platform) {
    if (!fs.existsSync(dbPath)) return { storageState: null, fingerprint: null, resolvedCountry: undefined }
    const db = openSessionDb(dbPath, { readonly: true })
    try {
        let session = null
        try {
            session = loadSessionRow(db, email, platform)
        } catch (error) {
            if (!String(error?.message ?? error).includes('no such table: sessions')) throw error
        }
        return {
            storageState: session?.storageState ?? null,
            fingerprint: session?.fingerprint ?? null,
            resolvedCountry: loadResolvedRegionRow(db, email)
        }
    } finally {
        closeSessionDb(db)
    }
}

function saveCheckedSession(dbPath, email, platform, storageState, fingerprint, persistFingerprint) {
    const sessionDir = path.dirname(dbPath)
    fs.mkdirSync(sessionDir, { recursive: true, mode: 0o700 })
    const db = openSessionDb(dbPath)
    try {
        ensureSessionSchema(db)
        saveSessionRow(db, email, platform, storageState, fingerprint, persistFingerprint)
    } finally {
        closeSessionDb(db)
    }
}

async function readBalance(page) {
    // 与主脚本 BrowserFunc.getDashboardData 同源:rewards.bing.com 的 user-info API,
    // 结构上兼容 {dashboard:{userStatus:{availablePoints}}} 与 {userInfo:{balance}}
    return await page.evaluate(async userInfoPath => {
        try {
            const res = await fetch(userInfoPath, { credentials: 'include' })
            if (!res.ok) return { ok: false, status: res.status }
            const json = await res.json()
            const dashboard = json?.dashboard ?? {}
            const points =
                dashboard?.userStatus?.availablePoints ??
                json?.userInfo?.balance ??
                json?.userStatus?.availablePoints ??
                null
            return { ok: true, points: points === null ? null : Number(points) }
        } catch (error) {
            return { ok: false, error: String(error?.message ?? error) }
        }
    }, USER_INFO_PATH)
}

async function checkPlatform({ account, config, dbPath, platform }) {
    const result = { platform, loggedIn: false, balance: null, cookies: 0, reason: '' }
    const stored = loadStoredSession(dbPath, account.email, platform)
    if (!stored.storageState || !stored.storageState.cookies?.length) {
        result.reason = 'no-saved-session'
        return result
    }

    const isMobile = platform === 'mobile'
    const locale = resolveLocale(account, stored.resolvedCountry)
    const savesFingerprint = isMobile ? account.saveFingerprint.mobile : account.saveFingerprint.desktop
    const fingerprint =
        savesFingerprint && stored.fingerprint ? stored.fingerprint : createFingerprint(isMobile, locale)
    const screen = fingerprint.fingerprint.screen
    const proxy = buildProxyConfig(account)
    const runningAsRoot = typeof process.getuid === 'function' && process.getuid() === 0
    const sandboxArgs = process.platform === 'linux' && runningAsRoot ? ['--no-sandbox', '--disable-setuid-sandbox'] : []
    const globalTimeout = resolveGlobalTimeoutMs(config.globalTimeout)

    const browser = await chromium.launch({
        headless: true,
        ...(proxy ? { proxy } : {}),
        args: [...BROWSER_ARGS, ...sandboxArgs]
    })

    try {
        const context = await newInjectedContext(browser, {
            fingerprint,
            newContextOptions: {
                ignoreHTTPSErrors: Boolean(proxy && config.proxy?.ignoreCertificateErrors),
                storageState: stored.storageState,
                ...(isMobile
                    ? {
                          isMobile: true,
                          hasTouch: true,
                          deviceScaleFactor: screen.devicePixelRatio,
                          viewport: { width: screen.width, height: screen.height },
                          screen: { width: screen.width, height: screen.height }
                      }
                    : {})
            }
        })
        context.setDefaultTimeout(globalTimeout)

        const page = await context.newPage()
        await page.goto(REWARDS_URL, { waitUntil: 'domcontentloaded', timeout: globalTimeout }).catch(error => {
            log('WARN', `Navigation to ${REWARDS_URL} did not finish cleanly: ${error.message}`)
        })

        await page.waitForLoadState('domcontentloaded', { timeout: globalTimeout }).catch(() => {})
        const finalUrl = page.url()
        if (!isRewardsPage(finalUrl)) {
            result.reason = 'redirected-to-login'
            result.cookies = stored.storageState.cookies?.length ?? 0
            log('WARN', `${platform} session is NOT logged in (landed on ${finalUrl})`)
            return result
        }

        result.loggedIn = true
        result.cookies = stored.storageState.cookies?.length ?? 0

        const balance = await readBalance(page)
        if (balance.ok && balance.points != null) result.balance = balance.points

        // 回写刷新后的 cookie, 顺带续期会话
        try {
            const storageState = await context.storageState()
            if (storageState.cookies?.length) {
                saveCheckedSession(dbPath, account.email, platform, storageState, fingerprint, savesFingerprint)
                result.sessionRefreshed = true
            }
        } catch (error) {
            log('WARN', `Failed to persist refreshed session: ${error.message}`)
        }
        return result
    } finally {
        await browser.close().catch(() => {})
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2), { boolean: ['help', 'h'] })
    if (args.help || args.h) {
        console.log('Usage: node scripts/main/loginCheck.js --email <account-email> [--platform mobile|desktop|both]')
        return
    }
    const email = resolveEmailArgument(args)
    const platforms = parsePlatforms(args.platform)

    const accounts = loadAccountsFromEnv(projectRoot)
    const account = findAccountByEmail(accounts, email)
    if (!account) throw new Error(`No ACCOUNT_N_* block found in .env for ${email}`)

    const { data: fileConfig } = loadConfig(projectRoot)
    const { dbPath } = getSessionDbPath(projectRoot, fileConfig.sessionPath)

    const overallTimer = setTimeout(() => {
        log('ERROR', `loginCheck timed out after ${OVERALL_TIMEOUT_MS / 1000}s`)
        process.exit(3)
    }, OVERALL_TIMEOUT_MS)
    overallTimer.unref?.()

    const platformsResult = {}
    for (const platform of platforms) {
        log('INFO', `Checking ${platform} session for ${account.email}...`)
        try {
            platformsResult[platform] = await checkPlatform({ account, config: fileConfig, dbPath, platform })
        } catch (error) {
            log('ERROR', `${platform} check failed: ${error.message}`)
            platformsResult[platform] = { platform, loggedIn: false, balance: null, reason: 'error', error: error.message }
        }
    }

    const values = Object.values(platformsResult)
    const balance = values.map(r => r.balance).find(v => v != null) ?? null
    const loggedIn = values.some(r => r.loggedIn)
    const payload = {
        email: account.email,
        balance,
        loggedIn,
        platforms: platformsResult,
        checkedAt: new Date().toISOString()
    }
    console.log('LOGINCHECK_RESULT ' + JSON.stringify(payload))
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
    main().catch(error => {
        log('ERROR', `loginCheck failed: ${error?.message ?? error}`)
        process.exitCode = 1
    })
}
