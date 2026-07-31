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
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

export function envInt(key, fallback, sourceEnv = process.env) {
    const value = envStr(key, sourceEnv)
    if (value === undefined) return fallback

    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : fallback
}

export function accountIndexesFromEnv(sourceEnv = process.env) {
    return Object.keys(sourceEnv)
        .map(key => /^ACCOUNT_([1-9]\d*)_EMAIL$/.exec(key)?.[1])
        .filter(index => index && envStrFrom(sourceEnv, `ACCOUNT_${index}_EMAIL`))
        .map(Number)
        .sort((a, b) => a - b)
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
