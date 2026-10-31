import { buildBrowserProxy } from '../lib/proxy.cjs'
import BROWSER_ARGS from '../lib/browser-args.json' with { type: 'json' }
/* global window */

import { chromium } from 'patchright'
import {
    getDirname,
    getProjectRoot,
    findUnknownOptions,
    log,
    exitWithUsage,
    parseArgs,
    resolveEmailArgument,
    loadConfig,
    loadAccountsFromEnv,
    findAccountByEmail,
    getSessionDbPath,
    openSessionDb,
    loadSessionRow,
    closeSessionDb,
    setupCleanupHandlers
} from '../lib/commandUtils.js'

const REWARDS_URL = 'https://rewards.bing.com'

const __dirname = getDirname(import.meta.url)
const projectRoot = getProjectRoot(__dirname)

function printHelp() {
    console.log(`
Microsoft Rewards saved-session browser

Usage:
  npm run open-session -- <account-email> [--platform desktop|mobile]
  npm run open-session -- --email <account-email> [--platform desktop|mobile]

Options:
  --email       Optional named form of the account email.
  --platform    Open a specific stored session. Defaults to desktop, then mobile.
  --help        Show this help.

Examples:
  npm run open-session -- user@example.com
  npm run open-session -- user@example.com --platform mobile
  npm run open-session -- --email user@example.com --platform desktop
`)
}

const failUsage = message => exitWithUsage(message, printHelp, log)

const args = parseArgs(process.argv.slice(2), { boolean: ['help', 'h'] })
if (args.help || args.h) {
    printHelp()
    process.exit(0)
}

const unknownOptions = findUnknownOptions(args, ['email', 'platform', 'help', 'h'])
if (unknownOptions.length) {
    failUsage(
        `Unknown option${unknownOptions.length === 1 ? '' : 's'}: ${unknownOptions.map(v => `--${v}`).join(', ')}`
    )
}

let accountEmail
try {
    accountEmail = resolveEmailArgument(args)
} catch (error) {
    failUsage(error?.message ?? String(error))
}

const { data: config } = loadConfig(projectRoot)

const accounts = loadAccountsFromEnv(projectRoot)
const account = findAccountByEmail(accounts, accountEmail)
if (account) accountEmail = account.email
if (!account) {
    log('WARN', `No ACCOUNT_N_* block found in .env for ${accountEmail} - opening without a proxy`)
}

function platformsToTry() {
    if (args.platform === undefined) return ['desktop', 'mobile']
    if (args.platform === true) failUsage('--platform requires either desktop or mobile after it.')

    const p = String(args.platform).trim().toLowerCase()
    if (p === 'mobile' || p === 'desktop') return [p]
    failUsage(`Invalid --platform value "${args.platform}"; expected desktop or mobile.`)
}

async function configureMediaBlocking(context) {
    if (!config.experimental?.blockMedia) return

    await context.route('**/*', async route => {
        const resourceType = route.request().resourceType()
        if (resourceType === 'image' || resourceType === 'media') {
            await route.abort()
            return
        }

        await route.fallback()
    })

    log('INFO', 'Media loading disabled (image/media requests blocked; HTTP cache disabled by routing)')
}

async function main() {
    const platforms = platformsToTry()
    const { dbPath, exists } = getSessionDbPath(projectRoot, config.sessionPath)
    if (!exists) {
        log('ERROR', `No sessions.db found (looked for ${dbPath})`)
        log('ERROR', 'Run the bot at least once so a session is stored for this account.')
        process.exit(1)
    }

    const db = openSessionDb(dbPath, { readonly: true })

    let session = null
    let platform = null
    for (const p of platforms) {
        try {
            const row = loadSessionRow(db, accountEmail, p)
            if (row && (row.storageState || row.fingerprint)) {
                session = row
                platform = p
                break
            }
        } catch (error) {
            log('WARN', `Could not read ${p} session: ${error.message}`)
        }
    }
    closeSessionDb(db)

    if (!session) {
        log('ERROR', `No stored session for ${accountEmail} in ${dbPath}`)
        log('ERROR', 'Run the bot first, or double-check the email.')
        process.exit(1)
    }

    const isMobile = platform === 'mobile'
    const { createSessionState } = await import('../../dist/session/SessionState.js').catch(() => {
        throw new Error('Run npm run build before using open-session')
    })
    const { fingerprint } = session
    const { browserLocaleArgs, requireGraphicalDisplay } = await import('../../dist/browser/BrowserRuntime.js')
    requireGraphicalDisplay()
    const storageState = session.storageState ? createSessionState(session.storageState.cookies) : null
    const { UserAgentManager } = await import('../../dist/browser/UserAgent.js')
    const { createAppIdentity } = await import('../../dist/rewards/app/AppIdentity.js')
    const userAgentManager = new UserAgentManager({ appIdentity: createAppIdentity(accountEmail) })
    if (!fingerprint || !userAgentManager.matchesFingerprint(fingerprint, isMobile)) {
        throw new Error(
            'Saved browser identity is missing or belongs to the previous profile. Run the bot or manual-login once to refresh this session.'
        )
    }
    const cookieCount = storageState?.cookies?.length ?? 0
    const screen = fingerprint.fingerprint.screen

    const proxy = account ? buildBrowserProxy(account.proxy) : null
    if (account?.proxy?.url && (!proxy || !proxy.server)) {
        log('ERROR', 'Account proxy is configured but invalid (needs proxy url + port)')
        process.exit(1)
    }

    log('INFO', `Session: ${accountEmail} (${platform})`)
    log('INFO', '  Engine: bundled patched Chromium')
    log('INFO', `  Cookies: ${cookieCount}`)
    log('INFO', `  Saved User-Agent: ${fingerprint.fingerprint.navigator.userAgent}`)
    log('INFO', `  Proxy: ${proxy ? 'Yes' : 'No'}`)
    log('INFO', `  Updated: ${session.updatedAt ? new Date(session.updatedAt).toISOString() : 'unknown'}`)
    log('INFO', 'Launching browser...')

    const runningAsRoot = typeof process.getuid === 'function' && process.getuid() === 0
    const sandboxArgs =
        process.platform === 'linux' && runningAsRoot ? ['--no-sandbox', '--disable-setuid-sandbox'] : []
    const ignoreCertificateErrors = Boolean(proxy && config.proxy?.ignoreCertificateErrors)
    const certArgs = ignoreCertificateErrors
        ? ['--ignore-certificate-errors', '--ignore-certificate-errors-spki-list', '--ignore-ssl-errors']
        : []

    const browser = await chromium.launch({
        headless: false,
        handleSIGINT: false,
        handleSIGTERM: false,
        ...(proxy ? { proxy } : {}),
        args: [
            ...BROWSER_ARGS,
            ...sandboxArgs,
            ...certArgs,
            ...browserLocaleArgs({
                locale: fingerprint.fingerprint.navigator.language,
                acceptedLocales: fingerprint.fingerprint.navigator.languages
            })
        ]
    })

    setupCleanupHandlers(async () => {
        if (browser.isConnected()) await browser.close()
    })

    try {
        userAgentManager.setEngineVersion(browser.version())
        await userAgentManager.updateFingerprintUserAgent(fingerprint, isMobile)
        log(
            'INFO',
            `Browser identity | engine=${browser.version()} | platform=${fingerprint.fingerprint.navigator.userAgentData.platform}`
        )
        const { newRewardsBrowserContext } = await import('../../dist/browser/RewardsBrowserContext.js')
        const context = await newRewardsBrowserContext(browser, fingerprint, {
            permissions: [],
            ignoreHTTPSErrors: ignoreCertificateErrors,
            ...(storageState ? { storageState } : {}),
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

        if (proxy) {
            await context.addInitScript(() => {
                delete window.RTCPeerConnection
                delete window.webkitRTCPeerConnection
                delete window.RTCDataChannel
            })
        }

        await configureMediaBlocking(context)

        const page = await context.newPage()
        await page.goto(REWARDS_URL, { waitUntil: 'domcontentloaded' })

        log('SUCCESS', 'Browser opened with session loaded')
        log('INFO', `Navigated to: ${REWARDS_URL}`)
        log('INFO', 'Press Ctrl+C to close.')
    } catch (error) {
        await browser.close().catch(() => {})
        throw error
    }
}

main().catch(error => {
    log('ERROR', 'browserSession failed:', error?.message ?? error)
    process.exit(1)
})
