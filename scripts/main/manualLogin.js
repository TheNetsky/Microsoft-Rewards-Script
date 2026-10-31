import { buildBrowserProxy } from '../lib/proxy.cjs'
import BROWSER_ARGS from '../lib/browser-args.json' with { type: 'json' }
/* global window */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { FingerprintGenerator } from 'fingerprint-generator'
import ms from 'ms'
import { chromium } from 'patchright'

import {
    closeSessionDb,
    ensureSessionSchema,
    findUnknownOptions,
    findAccountByEmail,
    getDirname,
    getProjectRoot,
    getSessionDbPath,
    loadAccountsFromEnv,
    loadConfig,
    loadResolvedRegionRow,
    loadSessionRow,
    log,
    exitWithUsage,
    openSessionDb,
    parseArgs,
    resolveEmailArgument,
    saveSessionRow
} from '../lib/commandUtils.js'

const REWARDS_LOGIN_URL = 'https://rewards.bing.com/auth/login'
const REWARDS_HOST = 'rewards.bing.com'
const STABLE_REWARDS_MS = 5000
const POLL_INTERVAL_MS = 250

const MANUAL_CONFIG_ENV_OVERRIDES = [
    { env: 'CONFIG_GLOBAL_TIMEOUT', path: ['globalTimeout'], type: 'string' },
    { env: 'CONFIG_EXPERIMENTAL_BLOCK_MEDIA', path: ['experimental', 'blockMedia'], type: 'bool' },
    {
        env: 'CONFIG_PROXY_IGNORE_CERTIFICATE_ERRORS',
        path: ['proxy', 'ignoreCertificateErrors'],
        type: 'bool'
    }
]

const __dirname = getDirname(import.meta.url)
const projectRoot = getProjectRoot(__dirname)

function printHelp() {
    console.log(`
Microsoft Rewards manual login

Usage:
  npm run manual-login -- <account-email> [--platform mobile|desktop|both] [--fresh]
  npm run manual-login -- --email <account-email> [--platform mobile|desktop|both] [--fresh]

Options:
  --email       Optional named form of the account email.
  --platform    Session to create. Defaults to mobile; "both" opens them sequentially.
  --fresh       Do not restore existing cookies. An enabled saved fingerprint is still reused.
  --help        Show this help.

Examples:
  npm run manual-login -- user@example.com
  npm run manual-login -- user@example.com --platform desktop
  npm run manual-login -- user@example.com --platform mobile
  npm run manual-login -- --email user@example.com --platform both --fresh

The browser stays open while you sign in manually. After five continuous
seconds on a Microsoft Rewards page, Bing sign-in is verified, the session is
saved and the browser closes. Failed or cancelled logins keep saved sessions.
`)
}

const failUsage = message => exitWithUsage(message, printHelp, log)

function parsePlatforms(value) {
    if (value === undefined) return ['mobile']
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error('--platform requires mobile, desktop, or both after it')
    }

    const platform = value.trim().toLowerCase()
    if (platform === 'mobile') return ['mobile']
    if (platform === 'desktop') return ['desktop']
    if (platform === 'both') return ['mobile', 'desktop']
    throw new Error('--platform must be mobile, desktop, or both')
}

function isRewardsPage(rawUrl) {
    try {
        const url = new URL(rawUrl)
        const pathname = url.pathname.replace(/\/+$/, '') || '/'
        return url.protocol === 'https:' && url.hostname.toLowerCase() === REWARDS_HOST && !pathname.startsWith('/auth')
    } catch {
        return false
    }
}

function setConfigValue(config, pathParts, value) {
    let current = config
    for (const key of pathParts.slice(0, -1)) {
        if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) current[key] = {}
        current = current[key]
    }
    current[pathParts.at(-1)] = value
}

function applyManualConfigEnvOverrides(rawConfig, env = process.env) {
    const config = structuredClone(rawConfig)
    const applied = []

    for (const override of MANUAL_CONFIG_ENV_OVERRIDES) {
        const raw = env[override.env]
        if (raw === undefined || raw === '') continue

        let value = raw
        if (override.type === 'bool') {
            if (raw !== 'true' && raw !== 'false') {
                throw new Error(`${override.env} expects true or false, got '${raw}'.`)
            }
            value = raw === 'true'
        }

        setConfigValue(config, override.path, value)
        applied.push(override.env)
    }

    return { config, applied }
}

function resolveGlobalTimeoutMs(value) {
    const timeout = typeof value === 'number' ? value : ms(String(value))
    if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 2147483647) {
        throw new Error(`config.globalTimeout must be a positive duration of at most 2147483647ms, got '${value}'`)
    }
    return timeout
}

function createFingerprint(isMobile, locale, operatingSystem) {
    return new FingerprintGenerator().getFingerprint({
        devices: isMobile ? ['mobile'] : ['desktop'],
        operatingSystems: isMobile ? ['android'] : [operatingSystem],
        browsers: [{ name: 'chrome' }],
        locales: locale.acceptedLocales
    })
}

function loadStoredSession(dbPath, email, platform, fresh) {
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
            storageState: fresh ? null : (session?.storageState ?? null),
            fingerprint: session?.fingerprint ?? null,
            resolvedCountry: loadResolvedRegionRow(db, email)
        }
    } finally {
        closeSessionDb(db)
    }
}

async function waitForStableRewardsPage(page, browser) {
    let stableSince = null
    let lastReportedSecond = -1

    while (browser.isConnected()) {
        if (page.isClosed()) throw new Error('Browser page was closed before login completed')

        if (isRewardsPage(page.url())) {
            if (stableSince === null) {
                stableSince = Date.now()
                lastReportedSecond = 0
                log('INFO', 'Rewards page detected; verifying it remains open for 5 seconds...')
            }

            const elapsed = Date.now() - stableSince
            const elapsedSecond = Math.min(5, Math.floor(elapsed / 1000))
            if (elapsedSecond > lastReportedSecond && elapsedSecond < 5) {
                lastReportedSecond = elapsedSecond
                log('INFO', `Rewards page stable for ${elapsedSecond}/5 seconds`)
            }
            if (elapsed >= STABLE_REWARDS_MS) return
        } else if (stableSince !== null) {
            stableSince = null
            lastReportedSecond = -1
            log('INFO', 'Rewards-page timer reset because navigation continued')
        }

        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
    }

    throw new Error('Browser was closed before login completed')
}

function saveManualSession(dbPath, email, platform, storageState, fingerprint, persistFingerprint) {
    const sessionDir = path.dirname(dbPath)
    fs.mkdirSync(sessionDir, { recursive: true, mode: 0o700 })
    try {
        fs.chmodSync(sessionDir, 0o700)
    } catch {}

    const db = openSessionDb(dbPath)
    try {
        ensureSessionSchema(db)
        saveSessionRow(db, email, platform, storageState, fingerprint, persistFingerprint)
        db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    } finally {
        closeSessionDb(db)
    }

    try {
        fs.chmodSync(dbPath, 0o600)
    } catch {}
}

async function runPlatform({ account, config, dbPath, platform, fresh }) {
    const { newRewardsBrowserContext } = await import('../../dist/browser/RewardsBrowserContext.js').catch(() => {
        throw new Error('Run npm run build before using manual-login')
    })
    const { createSessionState } = await import('../../dist/session/SessionState.js')
    const isMobile = platform === 'mobile'
    const stored = loadStoredSession(dbPath, account.email, platform, fresh)
    if (stored.storageState) stored.storageState = createSessionState(stored.storageState.cookies)
    const { resolveAccountLocale, fingerprintMatchesLocale } = await import('../../dist/util/Locale.js')
    const locale = resolveAccountLocale(account, stored.resolvedCountry)
    const savesFingerprint = isMobile ? account.saveFingerprint.mobile : account.saveFingerprint.desktop
    const { UserAgentManager } = await import('../../dist/browser/UserAgent.js')
    const { createAppIdentity } = await import('../../dist/rewards/app/AppIdentity.js')
    const { fingerprintOperatingSystem, browserLocaleArgs, requireGraphicalDisplay } =
        await import('../../dist/browser/BrowserRuntime.js')
    requireGraphicalDisplay()
    const { getBingSignInEvidence } = await import('../../dist/browser/auth/LoginSession.js')
    const { URLs } = await import('../../dist/constants/urls.js')
    const userAgentManager = new UserAgentManager({ appIdentity: createAppIdentity(account.email) })
    const profileMatches = stored.fingerprint && userAgentManager.matchesFingerprint(stored.fingerprint, isMobile)
    const canReuseFingerprint =
        savesFingerprint && stored.fingerprint && profileMatches && fingerprintMatchesLocale(stored.fingerprint, locale)
    const fingerprint = canReuseFingerprint
        ? stored.fingerprint
        : createFingerprint(isMobile, locale, fingerprintOperatingSystem())
    if (!canReuseFingerprint) stored.storageState = null
    const screen = fingerprint.fingerprint.screen
    const proxy = buildBrowserProxy(account.proxy)

    if (account.proxy.url && !proxy) {
        throw new Error('Account proxy is configured but invalid (needs proxy URL and port)')
    }

    if (!savesFingerprint) {
        log(
            'WARN',
            `ACCOUNT_N_SAVE_FINGERPRINT_${platform.toUpperCase()} is disabled. Enable it so automated runs reuse this manual-login fingerprint.`
        )
    }

    log('INFO', `Opening ${platform} manual login for ${account.email}`)
    log(
        'INFO',
        `Locale: ${locale.locale} | Proxy: ${proxy ? 'yes' : 'no'} | Existing cookies: ${stored.storageState?.cookies?.length ?? 0}`
    )

    const runningAsRoot = typeof process.getuid === 'function' && process.getuid() === 0
    const sandboxArgs =
        process.platform === 'linux' && runningAsRoot ? ['--no-sandbox', '--disable-setuid-sandbox'] : []
    const ignoreCertificateErrors = Boolean(proxy && config.proxy?.ignoreCertificateErrors)
    const globalTimeout = resolveGlobalTimeoutMs(config.globalTimeout)
    const certArgs = ignoreCertificateErrors
        ? ['--ignore-certificate-errors', '--ignore-certificate-errors-spki-list', '--ignore-ssl-errors']
        : []

    const browser = await chromium.launch({
        headless: false,
        handleSIGINT: false,
        handleSIGTERM: false,
        ...(proxy ? { proxy } : {}),
        args: [...BROWSER_ARGS, ...sandboxArgs, ...certArgs, ...browserLocaleArgs(locale)]
    })

    let interrupted = false
    const stop = async signal => {
        if (interrupted) return
        interrupted = true
        process.exitCode = signal === 'SIGINT' ? 130 : 143
        log('WARN', `${signal} received; closing without saving an incomplete login`)
        await browser.close().catch(() => {})
    }
    const onSigInt = () => void stop('SIGINT')
    const onSigTerm = () => void stop('SIGTERM')
    process.once('SIGINT', onSigInt)
    process.once('SIGTERM', onSigTerm)

    try {
        userAgentManager.setEngineVersion(browser.version())
        await userAgentManager.updateFingerprintUserAgent(fingerprint, isMobile)
        log(
            'INFO',
            `Browser identity | engine=${browser.version()} | platform=${fingerprint.fingerprint.navigator.userAgentData.platform}`
        )
        const context = await newRewardsBrowserContext(browser, fingerprint, {
            permissions: [],
            ignoreHTTPSErrors: ignoreCertificateErrors,
            ...(stored.storageState ? { storageState: stored.storageState } : {}),
            ...(isMobile
                ? {
                      isMobile: true,
                      hasTouch: true,
                      deviceScaleFactor: screen.devicePixelRatio,
                      viewport: { width: screen.width, height: screen.height },
                      screen: { width: screen.width, height: screen.height }
                  }
                : {})
        })
        context.setDefaultTimeout(globalTimeout)

        if (proxy) {
            await context.addInitScript(() => {
                delete window.RTCPeerConnection
                delete window.webkitRTCPeerConnection
                delete window.RTCDataChannel
            })
        }

        const page = await context.newPage()
        await page.goto(REWARDS_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: globalTimeout }).catch(error => {
            log('WARN', `Initial Rewards navigation did not finish cleanly: ${error.message}`)
        })

        log('INFO', 'Complete the Microsoft sign-in manually in the browser window')
        await waitForStableRewardsPage(page, browser)
        if (interrupted) throw new Error('Manual login was interrupted')

        log('INFO', 'Verifying the signed-in Bing session before saving...')
        await page.goto(URLs.auth.bingSignIn, { waitUntil: 'domcontentloaded', timeout: globalTimeout })
        if (!(await getBingSignInEvidence(page, globalTimeout))) {
            throw new Error('Could not verify the signed-in Bing session; existing saved sessions were kept')
        }
        if (interrupted) throw new Error('Manual login was interrupted')

        const storageState = createSessionState(await context.cookies())
        if (!storageState.cookies.length) {
            throw new Error('Rewards page was detected, but the browser had no cookies to save')
        }
        if (interrupted) throw new Error('Manual login was interrupted')

        saveManualSession(dbPath, account.email, platform, storageState, fingerprint, savesFingerprint)
        log(
            'SUCCESS',
            `Saved ${platform} session for ${account.email} | cookies=${storageState.cookies.length} | origins=${storageState.origins.length}`
        )
    } finally {
        process.removeListener('SIGINT', onSigInt)
        process.removeListener('SIGTERM', onSigTerm)
        await browser.close().catch(() => {})
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2), { boolean: ['fresh', 'help', 'h'] })
    if (args.help || args.h) {
        printHelp()
        return
    }

    const unknownOptions = findUnknownOptions(args, ['email', 'platform', 'fresh', 'help', 'h'])
    if (unknownOptions.length) {
        failUsage(
            `Unknown option${unknownOptions.length === 1 ? '' : 's'}: ${unknownOptions.map(v => `--${v}`).join(', ')}`
        )
    }

    let email
    let platforms
    try {
        email = resolveEmailArgument(args)
        platforms = parsePlatforms(args.platform)
    } catch (error) {
        failUsage(error?.message ?? String(error))
    }

    if (args.fresh !== undefined && args.fresh !== true) {
        failUsage('--fresh is a switch and does not accept a value.')
    }

    const accounts = loadAccountsFromEnv(projectRoot)
    const fresh = args.fresh === true
    const { data: fileConfig } = loadConfig(projectRoot)
    const { config, applied: appliedConfigOverrides } = applyManualConfigEnvOverrides(fileConfig)
    const account = findAccountByEmail(accounts, email)
    if (!account) {
        throw new Error(`No ACCOUNT_N_* block found in .env for ${email}`)
    }

    const { dbPath } = getSessionDbPath(projectRoot, config.sessionPath)

    log('INFO', `Configuration loaded from config.json | CONFIG_* overrides=${appliedConfigOverrides.length}`)
    if (config.headless) {
        log('INFO', 'config.headless=true is overridden because manual login requires a visible browser')
    }
    if (config.experimental?.blockMedia) {
        log('INFO', 'experimental.blockMedia=true is deferred so authentication images and media remain available')
    }

    for (const platform of platforms) {
        await runPlatform({ account, config, dbPath, platform, fresh })
    }

    log('SUCCESS', `Manual login completed for ${account.email}`)
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
    main().catch(error => {
        if (process.exitCode === 130 || process.exitCode === 143) {
            log('WARN', 'Manual login cancelled; existing saved sessions were kept')
        } else {
            log('ERROR', `manualLogin failed: ${error?.message ?? error}`)
            process.exitCode = 1
        }
    })
}
