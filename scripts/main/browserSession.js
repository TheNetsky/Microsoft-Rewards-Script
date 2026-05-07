import fs from 'fs'
import { chromium } from 'patchright'
import { newInjectedContext } from 'fingerprint-injector'
import {
    getDirname,
    getProjectRoot,
    log,
    parseArgs,
    validateEmail,
    loadConfig,
    loadAccounts,
    findAccountByEmail,
    getRuntimeBase,
    getSessionPath,
    loadCookies,
    loadFingerprint,
    buildProxyConfig,
    setupCleanupHandlers
} from '../utils.js'

const __dirname = getDirname(import.meta.url)
const projectRoot = getProjectRoot(__dirname)

const args = parseArgs()
args.dev = args.dev || false

validateEmail(args.email)

const { data: config } = loadConfig(projectRoot, args.dev)
const { data: accounts } = loadAccounts(projectRoot, args.dev)

const account = findAccountByEmail(accounts, args.email)
if (!account) {
    log('ERROR', `Account not found: ${args.email}`)
    log('ERROR', 'Available accounts:')
    accounts.forEach(acc => {
        if (acc?.email) log('ERROR', `  - ${acc.email}`)
    })
    process.exit(1)
}

async function main() {
    const runtimeBase = getRuntimeBase(projectRoot, args.dev)
    const sessionBase = getSessionPath(runtimeBase, config.sessionPath, args.email)

    log('INFO', 'Validating session data...')

    if (!fs.existsSync(sessionBase)) {
        log('ERROR', `Session directory does not exist: ${sessionBase}`)
        log('ERROR', 'Please ensure the session has been created for this account')
        process.exit(1)
    }

    if (!config.baseURL) {
        log('ERROR', 'baseURL is not set in config.json')
        process.exit(1)
    }

    let cookies = await loadCookies(sessionBase, 'desktop')
    let sessionType = 'desktop'

    if (cookies.length === 0) {
        log('WARN', 'No desktop session cookies found, trying mobile session...')
        cookies = await loadCookies(sessionBase, 'mobile')
        sessionType = 'mobile'

        if (cookies.length === 0) {
            log('ERROR', 'No cookies found in desktop or mobile session')
            log('ERROR', `Session directory: ${sessionBase}`)
            log('ERROR', 'Please ensure a valid session exists for this account')
            process.exit(1)
        }

        log('INFO', `Using mobile session (${cookies.length} cookies)`)
    }

    const isMobile = sessionType === 'mobile'
    const fingerprintEnabled = isMobile ? account.saveFingerprint?.mobile : account.saveFingerprint?.desktop

    let fingerprint = null
    if (fingerprintEnabled) {
        fingerprint = await loadFingerprint(sessionBase, sessionType)
        if (!fingerprint) {
            log('ERROR', `Fingerprint is enabled for ${sessionType} but fingerprint file not found`)
            log('ERROR', `Expected file: ${sessionBase}/session_fingerprint_${sessionType}.json`)
            log('ERROR', 'Cannot start browser without fingerprint when it is explicitly enabled')
            process.exit(1)
        }
        log('INFO', `Loaded ${sessionType} fingerprint`)
    }

    const proxy = buildProxyConfig(account)

    if (account.proxy && account.proxy.url && (!proxy || !proxy.server)) {
        log('ERROR', 'Proxy is configured in account but proxy data is invalid or incomplete')
        log('ERROR', 'Account proxy config:', JSON.stringify(account.proxy, null, 2))
        log('ERROR', 'Required fields: proxy.url, proxy.port')
        log('ERROR', 'Cannot start browser without proxy when it is explicitly configured')
        process.exit(1)
    }

    const userAgent = fingerprint?.fingerprint?.navigator?.userAgent || fingerprint?.fingerprint?.userAgent || null

    log('INFO', `Session: ${args.email} (${sessionType})`)
    log('INFO', `  Cookies: ${cookies.length}`)
    log('INFO', `  Fingerprint: ${fingerprint ? 'Yes' : 'No'}`)
    log('INFO', `  User-Agent: ${userAgent || 'Default'}`)
    log('INFO', `  Proxy: ${proxy ? 'Yes' : 'No'}`)
    log('INFO', 'Launching browser...')

    const browser = await chromium.launch({
        headless: false,
        ...(proxy ? { proxy } : {}),
        args: [
            '--no-sandbox',
            '--mute-audio',
            '--disable-setuid-sandbox',
            '--ignore-certificate-errors',
            '--ignore-certificate-errors-spki-list',
            '--ignore-ssl-errors',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-user-media-security=true',
            '--disable-blink-features=Attestation',
            '--disable-features=WebAuthentication,PasswordManagerOnboarding,PasswordManager,EnablePasswordsAccountStorage,Passkeys',
            '--disable-save-password-bubble'
        ]
    })

    let context
    if (fingerprint) {
        context = await newInjectedContext(browser, { fingerprint })

        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'credentials', {
                value: {
                    create: () => Promise.reject(new Error('WebAuthn disabled')),
                    get: () => Promise.reject(new Error('WebAuthn disabled'))
                }
            })
        })

        log('SUCCESS', 'Fingerprint injected into browser context')
    } else {
        context = await browser.newContext({
            viewport: isMobile ? { width: 375, height: 667 } : { width: 1366, height: 768 }
        })
    }

    if (cookies.length) {
        await context.addCookies(cookies)
        log('INFO', `Added ${cookies.length} cookies to context`)
    }

    const page = await context.newPage()
    await page.goto(config.baseURL, { waitUntil: 'domcontentloaded' })

    log('SUCCESS', 'Browser opened with session loaded')
    log('INFO', `Navigated to: ${config.baseURL}`)

    setupCleanupHandlers(async () => {
        if (browser?.isConnected?.()) {
            await browser.close()
        }
    })
}

main()