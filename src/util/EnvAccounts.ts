import fs from 'fs'

import type { Account, AccountProxy, ConfigSaveFingerprint } from '../interface/Account'

const ACCOUNT_KEY_RE = /^ACCOUNT_(\d+)_([A-Z0-9_]+)$/
const ACCOUNT_ASSIGNMENT_RE = /^ACCOUNT_(\d+)_([A-Z0-9_]+)\s*=(.*)$/
const ACCOUNT_HEADER_RE = /^#\s*Account\s+\d+\b/i

interface PartialAccountRecord {
    email?: string
    password?: string
    totpSecret?: string
    recoveryEmail?: string
    geoLocale?: string
    langCode?: string
    proxy?: Partial<AccountProxy>
    saveFingerprint?: Partial<ConfigSaveFingerprint>
}

function parseEnvValue(rawValue: string): string {
    const value = rawValue.trim()
    if (
        (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
        (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
        return value.slice(1, -1)
    }
    return value
}

function envBool(value: string | undefined, fallback: boolean): boolean {
    if (!value) return fallback
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function envInt(value: string | undefined, fallback: number): number {
    if (!value) return fallback
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : fallback
}

function ensureRecord(target: PartialAccountRecord | undefined): PartialAccountRecord {
    return target ?? {}
}

function ensureProxy(target: Partial<AccountProxy> | undefined): Partial<AccountProxy> {
    return target ?? {}
}

function ensureFingerprint(target: Partial<ConfigSaveFingerprint> | undefined): Partial<ConfigSaveFingerprint> {
    return target ?? {}
}

function assignAccountField(record: PartialAccountRecord, envKey: string, value: string): void {
    switch (envKey) {
        case 'EMAIL':
            record.email = value
            break
        case 'PASSWORD':
            record.password = value
            break
        case 'TOTP_SECRET':
            record.totpSecret = value
            break
        case 'RECOVERY_EMAIL':
            record.recoveryEmail = value
            break
        case 'GEO_LOCALE':
            record.geoLocale = value
            break
        case 'LANG_CODE':
            record.langCode = value
            break
        case 'PROXY_HTTP':
            record.proxy = ensureProxy(record.proxy)
            record.proxy.proxyHttp = envBool(value, false)
            break
        case 'PROXY_AXIOS':
            record.proxy = ensureProxy(record.proxy)
            record.proxy.proxyHttp = envBool(value, false)
            break
        case 'PROXY_URL':
            record.proxy = ensureProxy(record.proxy)
            record.proxy.url = value
            break
        case 'PROXY_PORT':
            record.proxy = ensureProxy(record.proxy)
            record.proxy.port = envInt(value, 0)
            break
        case 'PROXY_USERNAME':
            record.proxy = ensureProxy(record.proxy)
            record.proxy.username = value
            break
        case 'PROXY_PASSWORD':
            record.proxy = ensureProxy(record.proxy)
            record.proxy.password = value
            break
        case 'SAVE_FINGERPRINT_MOBILE':
            record.saveFingerprint = ensureFingerprint(record.saveFingerprint)
            record.saveFingerprint.mobile = envBool(value, false)
            break
        case 'SAVE_FINGERPRINT_DESKTOP':
            record.saveFingerprint = ensureFingerprint(record.saveFingerprint)
            record.saveFingerprint.desktop = envBool(value, false)
            break
        default:
            break
    }
}

function buildAccount(index: number, record: PartialAccountRecord): Account {
    const hasAnyField = Object.values(record).some(value => value !== undefined)
    if (!hasAnyField) {
        throw new Error(`Account block ${index} is empty.`)
    }

    if (!record.email) {
        throw new Error(`ACCOUNT_${index}_EMAIL is missing in .env.`)
    }

    return {
        email: record.email,
        password: record.password ?? '',
        totpSecret: record.totpSecret || undefined,
        recoveryEmail: record.recoveryEmail ?? '',
        geoLocale: record.geoLocale ?? 'auto',
        langCode: record.langCode ?? 'en',
        proxy: {
            proxyHttp: record.proxy?.proxyHttp ?? false,
            url: record.proxy?.url ?? '',
            port: record.proxy?.port ?? 0,
            username: record.proxy?.username ?? '',
            password: record.proxy?.password ?? ''
        },
        saveFingerprint: {
            mobile: record.saveFingerprint?.mobile ?? false,
            desktop: record.saveFingerprint?.desktop ?? false
        }
    }
}

function sanitizeValue(value: string | number | boolean | undefined): string {
    if (value === undefined) return ''
    return String(value).replace(/\r?\n/g, ' ')
}

function renderAccountBlock(account: Account, index: number): string[] {
    const accountIndex = index + 1
    return [
        `# Account ${accountIndex}`,
        `ACCOUNT_${accountIndex}_EMAIL=${sanitizeValue(account.email)}`,
        `ACCOUNT_${accountIndex}_PASSWORD=${sanitizeValue(account.password)}`,
        `ACCOUNT_${accountIndex}_TOTP_SECRET=${sanitizeValue(account.totpSecret)}`,
        `ACCOUNT_${accountIndex}_RECOVERY_EMAIL=${sanitizeValue(account.recoveryEmail)}`,
        `ACCOUNT_${accountIndex}_GEO_LOCALE=${sanitizeValue(account.geoLocale)}`,
        `ACCOUNT_${accountIndex}_LANG_CODE=${sanitizeValue(account.langCode)}`,
        `ACCOUNT_${accountIndex}_PROXY_HTTP=${sanitizeValue(account.proxy.proxyHttp)}`,
        `ACCOUNT_${accountIndex}_PROXY_URL=${sanitizeValue(account.proxy.url)}`,
        `ACCOUNT_${accountIndex}_PROXY_PORT=${sanitizeValue(account.proxy.port)}`,
        `ACCOUNT_${accountIndex}_PROXY_USERNAME=${sanitizeValue(account.proxy.username)}`,
        `ACCOUNT_${accountIndex}_PROXY_PASSWORD=${sanitizeValue(account.proxy.password)}`,
        `ACCOUNT_${accountIndex}_SAVE_FINGERPRINT_MOBILE=${sanitizeValue(account.saveFingerprint.mobile)}`,
        `ACCOUNT_${accountIndex}_SAVE_FINGERPRINT_DESKTOP=${sanitizeValue(account.saveFingerprint.desktop)}`
    ]
}

function trimTrailingBlankLines(lines: string[]): string[] {
    const copy = [...lines]
    while (copy.length > 0 && copy[copy.length - 1]?.trim() === '') {
        copy.pop()
    }
    return copy
}

export function createEmptyAccount(): Account {
    return {
        email: '',
        password: '',
        recoveryEmail: '',
        geoLocale: 'auto',
        langCode: 'en',
        proxy: {
            proxyHttp: false,
            url: '',
            port: 0,
            username: '',
            password: ''
        },
        saveFingerprint: {
            mobile: false,
            desktop: false
        }
    }
}

export function parseAccountsFromEnvContent(content: string): Account[] {
    const accountMap = new Map<number, PartialAccountRecord>()

    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) {
            continue
        }

        const match = trimmed.match(ACCOUNT_ASSIGNMENT_RE)
        if (!match) {
            continue
        }

        const indexRaw = match[1]
        const keyRaw = match[2]
        const valueRaw = match[3]
        if (!indexRaw || !keyRaw || valueRaw === undefined) {
            continue
        }

        const index = Number.parseInt(indexRaw, 10)
        const key = keyRaw.trim()
        const value = parseEnvValue(valueRaw)

        const current = ensureRecord(accountMap.get(index))
        assignAccountField(current, key, value)
        accountMap.set(index, current)
    }

    return [...accountMap.entries()]
        .sort(([left], [right]) => left - right)
        .map(([index, record]) => buildAccount(index, record))
}

export function readAccountsFromEnvFile(filePath: string): Account[] {
    if (!fs.existsSync(filePath)) {
        return []
    }

    const content = fs.readFileSync(filePath, 'utf-8')
    return parseAccountsFromEnvContent(content)
}

export function saveAccountsToEnvFile(filePath: string, accounts: Account[]): void {
    let preservedLines: string[] = [
        '# Account Credentials',
        '# Managed by npm run manage.',
        '# This file stays local and should not be committed.'
    ]

    if (fs.existsSync(filePath)) {
        const currentContent = fs.readFileSync(filePath, 'utf-8')
        preservedLines = currentContent
            .split(/\r?\n/)
            .filter(line => {
                const trimmed = line.trim()
                if (ACCOUNT_HEADER_RE.test(trimmed)) {
                    return false
                }
                if (trimmed.startsWith('#') && ACCOUNT_KEY_RE.test(trimmed.slice(1).trim())) {
                    return false
                }
                return !ACCOUNT_ASSIGNMENT_RE.test(trimmed)
            })
    }

    const outputLines = trimTrailingBlankLines(preservedLines)
    if (outputLines.length > 0) {
        outputLines.push('')
    }

    accounts.forEach((account, index) => {
        outputLines.push(...renderAccountBlock(account, index))
        outputLines.push('')
    })

    fs.writeFileSync(filePath, `${trimTrailingBlankLines(outputLines).join('\n')}\n`, 'utf-8')
}
