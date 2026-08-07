/* global window */

import { chromium } from 'patchright'
import { newInjectedContext } from 'fingerprint-injector'
import {
    getDirname,
    getProjectRoot,
    log,
    parseArgs,
    validateEmail,
    loadConfig,
    loadAccountsFromEnv,
    findAccountByEmail,
    buildProxyConfig,
    getSessionDbPath,
    openSessionDb,
    loadSessionRow,
    closeSessionDb,
    setupCleanupHandlers
} from '../utils.js'

const REWARDS_URL = 'https://rewards.bing.com'

const BROWSER_ARGS = [
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-web-authentication-ui',
    '--disable-external-intent-requests',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=WebAuthentication,PasswordManagerOnboarding,PasswordManager,EnablePasswordsAccountStorage,Passkeys,WebAuthenticationProxy,U2F',
    '--disable-save-password-bubble',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding'
]

const __dirname = getDirname(import.meta.url)
const projectRoot = getProjectRoot(__dirname)

const args = parseArgs()

validateEmail(args.email)

const { data: config } = loadConfig(projectRoot)

const accounts = loadAccountsFromEnv(projectRoot)
const account = findAccountByEmail(accounts, args.email)
if (!account) {
    log('WARN', `No ACCOUNT_N_* block found in .env for ${args.email} - opening without a proxy`)
}

function platformsToTry() {
    const p = typeof args.platform === 'string' ? args.platform.toLowerCase() : ''
    if (p === 'mobile' || p === 'desktop') return [p]
    return ['desktop', 'mobile'] // prefer desktop, fall back to mobile
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
    const { dbPath, exists } = getSessionDbPath(projectRoot, config.sessionPath)
    if (!exists) {
        log('ERROR', `No sessions.db found (looked for ${dbPath})`)
        log('ERROR', 'Run the bot at least once so a session is stored for this account.')
        process.exit(1)
    }

    const db = openSessionDb(dbPath, { readonly: true })

    let session = null
    let platform = null
    for (const p of platformsToTry()) {
        try {
            const row = loadSessionRow(db, args.email, p)
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
        log('ERROR', `No stored session for ${args.email} in ${dbPath}`)
        log('ERROR', 'Run the bot first, or double-check the email.')
        process.exit(1)
    }

    const isMobile = platform === 'mobile'
    const { storageState, fingerprint } = session
    const useInjector = Boolean(fingerprint)
    const cookieCount = storageState?.cookies?.length ?? 0
    const screen = fingerprint?.fingerprint?.screen
    const userAgent = fingerprint?.fingerprint?.navigator?.userAgent || fingerprint?.fingerprint?.userAgent || null

    const proxy = account ? buildProxyConfig(account) : null
    if (account?.proxy?.url && (!proxy || !proxy.server)) {
        log('ERROR', 'Account proxy is configured but invalid (needs proxy url + port)')
        process.exit(1)
    }

    log('INFO', `Session: ${args.email} (${platform})`)
    log('INFO', '  Engine: bundled patched Chromium')
    log('INFO', `  Cookies: ${cookieCount}`)
    log('INFO', `  Fingerprint: ${fingerprint ? 'Yes' : 'No'}`)
    log('INFO', `  Fingerprint injector: ${useInjector ? 'Yes' : 'No (real browser)'}`)
    log('INFO', `  User-Agent: ${userAgent || 'Default'}`)
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
        ...(proxy ? { proxy } : {}),
        args: [...BROWSER_ARGS, ...sandboxArgs, ...certArgs]
    })

    let context
    if (useInjector && fingerprint) {
        context = await newInjectedContext(browser, {
            fingerprint,
            newContextOptions: {
                permissions: [],
                ignoreHTTPSErrors: ignoreCertificateErrors,
                ...(storageState ? { storageState } : {}),
                ...(isMobile && screen
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
        log('SUCCESS', 'Fingerprint injected into browser context')
    } else {
        context = await browser.newContext({
            permissions: [],
            ignoreHTTPSErrors: ignoreCertificateErrors,
            ...(storageState ? { storageState } : {}),
            ...(isMobile
                ? {
                      isMobile: true,
                      hasTouch: true,
                      ...(userAgent ? { userAgent } : {}),
                      ...(screen
                          ? {
                                deviceScaleFactor: screen.devicePixelRatio,
                                viewport: { width: screen.width, height: screen.height },
                                screen: { width: screen.width, height: screen.height }
                            }
                          : { viewport: { width: 375, height: 667 } })
                  }
                : {})
        })
    }

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

    setupCleanupHandlers(async () => {
        if (browser?.isConnected?.()) {
            await browser.close()
        }
    })
}

main().catch(error => {
    log('ERROR', 'browserSession failed:', error?.message ?? error)
    process.exit(1)
})
