import logging from './logging.cjs'

export function envStrFrom(sourceEnv, key) {
    const value = sourceEnv[key]
    if (value === undefined) return undefined

    const trimmed = String(value).trim()
    return trimmed.length ? trimmed : undefined
}

export function envStr(key, sourceEnv = process.env) {
    return envStrFrom(sourceEnv, key)
}

export function envBool(key, fallback, sourceEnv = process.env) {
    const value = envStr(key, sourceEnv)
    if (value === undefined) return fallback
    if (!['1', 'true', 'yes', 'on', '0', 'false', 'no', 'off'].includes(value.toLowerCase()))
        throw new Error(`${key} must be a boolean`)
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function envInt(key, fallback, sourceEnv = process.env) {
    const value = envStr(key, sourceEnv)
    if (value === undefined) return fallback

    const parsed = Number(value)
    if (!Number.isSafeInteger(parsed)) throw new Error(`${key} must be an integer`)
    return parsed
}

function accountSlotsFromEnv(sourceEnv = process.env) {
    return Object.keys(sourceEnv)
        .map(key => /^ACCOUNT_([1-9]\d*)_EMAIL$/.exec(key)?.[1])
        .filter(index => index && envStrFrom(sourceEnv, `ACCOUNT_${index}_EMAIL`))
        .sort((a, b) => Number(a) - Number(b))
}

export function accountIndexesFromEnv(sourceEnv = process.env) {
    return accountSlotsFromEnv(sourceEnv).map(Number)
}

export function normalizeLanguageCode(value = 'en') {
    const trimmed = String(value).trim()
    try {
        return new Intl.Locale(trimmed).toString()
    } catch {
        return trimmed
    }
}

export function normalizeGeoLocale(value = 'auto') {
    const trimmed = String(value).trim()
    return trimmed.toLowerCase() === 'auto' ? 'auto' : trimmed.toUpperCase()
}

const deprecationWarned = new Set()

export function loadAccountSettings(
    sourceEnv = process.env,
    onWarning = message => logging.logMessage('ACCOUNTS', 'warn', message)
) {
    const legacyBool = (primary, legacy, fallback) => {
        if (envStr(primary, sourceEnv) !== undefined) return envBool(primary, fallback, sourceEnv)
        if (envStr(legacy, sourceEnv) === undefined) return fallback
        if (!deprecationWarned.has(legacy)) {
            deprecationWarned.add(legacy)
            onWarning(`${legacy} is deprecated; rename it to ${primary}.`)
        }
        return envBool(legacy, fallback, sourceEnv)
    }
    return accountSlotsFromEnv(sourceEnv).map(index => ({
        email: envStr(`ACCOUNT_${index}_EMAIL`, sourceEnv),
        password: envStr(`ACCOUNT_${index}_PASSWORD`, sourceEnv) ?? '',
        totpSecret: envStr(`ACCOUNT_${index}_TOTP_SECRET`, sourceEnv),
        recoveryEmail: envStr(`ACCOUNT_${index}_RECOVERY_EMAIL`, sourceEnv) ?? '',
        geoLocale: normalizeGeoLocale(envStr(`ACCOUNT_${index}_GEO_LOCALE`, sourceEnv) ?? 'auto'),
        langCode: normalizeLanguageCode(envStr(`ACCOUNT_${index}_LANG_CODE`, sourceEnv) ?? 'en'),
        proxy: {
            proxyHttp: legacyBool(`ACCOUNT_${index}_PROXY_HTTP`, `ACCOUNT_${index}_PROXY_AXIOS`, false),
            url: envStr(`ACCOUNT_${index}_PROXY_URL`, sourceEnv) ?? '',
            port: envInt(`ACCOUNT_${index}_PROXY_PORT`, 0, sourceEnv),
            username: envStr(`ACCOUNT_${index}_PROXY_USERNAME`, sourceEnv) ?? '',
            password: envStr(`ACCOUNT_${index}_PROXY_PASSWORD`, sourceEnv) ?? ''
        },
        saveFingerprint: {
            mobile: envBool(`ACCOUNT_${index}_SAVE_FINGERPRINT_MOBILE`, true, sourceEnv),
            desktop: envBool(`ACCOUNT_${index}_SAVE_FINGERPRINT_DESKTOP`, true, sourceEnv)
        }
    }))
}
