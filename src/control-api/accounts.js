import { requestError } from './http.js'
import { accountIndexesFromEnv, envStrFrom, normalizeGeoLocale, normalizeLanguageCode } from '../../scripts/lib/env.js'
import { normalizeAccountLevel } from '../rewards/shared/parsers/NormalizeRewards.js'

function sanitizeProxyUrl(value) {
    try {
        const url = new URL(value)
        url.username = ''
        url.password = ''
        return url.toString().replace(/\/$/, '')
    } catch {
        return value.replace(/^(?:[^/@\s]+@|([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@)/i, '$1')
    }
}

export function loadAccounts(sourceEnv = process.env) {
    const accounts = []

    for (const i of accountIndexesFromEnv(sourceEnv)) {
        const email = envStrFrom(sourceEnv, `ACCOUNT_${i}_EMAIL`)
        if (!email) continue

        const proxyUrl = envStrFrom(sourceEnv, `ACCOUNT_${i}_PROXY_URL`)
        accounts.push({
            index: i,
            email,
            emailKey: email, // internal history join key; removed before returning the response
            geoLocale: normalizeGeoLocale(envStrFrom(sourceEnv, `ACCOUNT_${i}_GEO_LOCALE`) ?? 'auto'),
            langCode: normalizeLanguageCode(envStrFrom(sourceEnv, `ACCOUNT_${i}_LANG_CODE`) ?? 'en'),
            hasRecoveryEmail: Boolean(envStrFrom(sourceEnv, `ACCOUNT_${i}_RECOVERY_EMAIL`)),
            hasTotp: Boolean(envStrFrom(sourceEnv, `ACCOUNT_${i}_TOTP_SECRET`)),
            proxy: proxyUrl
                ? {
                      url: sanitizeProxyUrl(proxyUrl),
                      port: envStrFrom(sourceEnv, `ACCOUNT_${i}_PROXY_PORT`) ?? null,
                      hasCredentials: Boolean(
                          envStrFrom(sourceEnv, `ACCOUNT_${i}_PROXY_USERNAME`) &&
                          envStrFrom(sourceEnv, `ACCOUNT_${i}_PROXY_PASSWORD`)
                      )
                  }
                : null
        })
    }
    return accounts
}

function buildSingleAccountEnv(accountIndex, sourceEnv = process.env) {
    const index = accountIndex
    if (!Number.isSafeInteger(index) || index < 1) {
        throw requestError('`accountIndex` must be a positive integer.')
    }

    const selectedPrefix = `ACCOUNT_${index}_`
    const selected = Object.entries(sourceEnv).filter(([key]) => key.startsWith(selectedPrefix))
    const email = envStrFrom(sourceEnv, `${selectedPrefix}EMAIL`)
    if (!email) {
        throw requestError(`ACCOUNT_${index} is not configured.`)
    }

    const env = {}

    for (const key of Object.keys(sourceEnv)) {
        if (/^ACCOUNT_\d+_/.test(key)) env[key] = ''
    }

    for (const [key, value] of selected) {
        const suffix = key.slice(selectedPrefix.length)
        env[`ACCOUNT_1_${suffix}`] = value
    }

    return {
        env,
        account: { index, email }
    }
}

export function buildExcludedAccountsEnv(excludedAccountIndexes, sourceEnv = process.env) {
    if (!Array.isArray(excludedAccountIndexes)) {
        throw requestError('`excludedAccountIndexes` must be an array of positive integers.')
    }

    const excluded = [...new Set(excludedAccountIndexes)]
    if (excluded.some(index => !Number.isSafeInteger(index) || index < 1)) {
        throw requestError('`excludedAccountIndexes` must contain only positive integers.')
    }

    const accounts = loadAccounts(sourceEnv)
    const knownIndexes = new Set(accounts.map(account => account.index))
    const unknown = excluded.filter(index => !knownIndexes.has(index))
    if (unknown.length) {
        throw requestError(
            `Unknown account slot${unknown.length === 1 ? '' : 's'}: ${unknown.map(index => `ACCOUNT_${index}`).join(', ')}.`
        )
    }

    const excludedSet = new Set(excluded)
    const included = accounts.filter(account => !excludedSet.has(account.index))
    if (!included.length) {
        throw requestError('A scheduled run cannot exclude every configured account.')
    }

    const env = {}
    for (const key of Object.keys(sourceEnv)) {
        if (/^ACCOUNT_\d+_/.test(key)) env[key] = ''
    }

    included.forEach((account, position) => {
        const sourcePrefix = `ACCOUNT_${account.index}_`
        const targetPrefix = `ACCOUNT_${position + 1}_`
        for (const [key, value] of Object.entries(sourceEnv)) {
            if (!key.startsWith(sourcePrefix)) continue
            env[`${targetPrefix}${key.slice(sourcePrefix.length)}`] = value
        }
    })

    return {
        env,
        excludedAccounts: accounts
            .filter(account => excludedSet.has(account.index))
            .map(({ index, email }) => ({ index, email })),
        includedAccounts: included.map(({ index, email }) => ({ index, email }))
    }
}

export function resolveAccountSelection(body, sourceEnv = process.env) {
    if (body.accountIndex != null && body.excludedAccountIndexes != null) {
        throw requestError('`accountIndex` and `excludedAccountIndexes` cannot be used together.')
    }
    if (body.accountIndex != null) {
        const selection = buildSingleAccountEnv(body.accountIndex, sourceEnv)
        return {
            env: selection.env,
            selectedAccount: selection.account,
            excludedAccounts: [],
            accounts: [selection.account]
        }
    }
    if (body.excludedAccountIndexes != null) {
        const selection = buildExcludedAccountsEnv(body.excludedAccountIndexes, sourceEnv)
        return {
            env: selection.env,
            selectedAccount: null,
            excludedAccounts: selection.excludedAccounts,
            accounts: selection.includedAccounts
        }
    }
    return {
        env: {},
        selectedAccount: null,
        excludedAccounts: [],
        accounts: loadAccounts(sourceEnv).map(({ index, email }) => ({ index, email }))
    }
}

export function mergeAccountStats(accounts, runs, liveAccounts = []) {
    // Index history results by email.
    const byEmail = new Map()
    for (const run of runs) {
        if (run.operation === 'session-regeneration') continue
        const when = run.endedAt || run.startedAt || null
        for (const acc of run.accounts || []) {
            if (!byEmail.has(acc.email.toLowerCase())) byEmail.set(acc.email.toLowerCase(), [])
            byEmail.get(acc.email.toLowerCase()).push({ ...acc, when })
        }
    }

    return accounts.map(a => {
        const results = byEmail.get(a.emailKey.toLowerCase()) || [] // already most-recent-first
        const last = results[0] || null
        const observations = [
            ...liveAccounts.filter(account => account.email.toLowerCase() === a.emailKey.toLowerCase()),
            ...results
        ]
        const level =
            observations.map(account => normalizeAccountLevel(account.level)).find(value => value !== null) ?? null
        const latestPoints = key =>
            observations.find(
                account => typeof account[key] === 'number' && Number.isFinite(account[key]) && account[key] >= 0
            )?.[key] ?? null
        const streakProtection = observations.find(result => result.streakProtection != null)?.streakProtection ?? null
        const edgeBrowsing = observations.find(result => result.edgeBrowsing != null)?.edgeBrowsing ?? null

        const pointsKnown = results.every(result => result.pointsKnown !== false && Number.isFinite(result.collected))
        const verifiedCollected = results.reduce(
            (total, result) =>
                total + (result.pointsKnown !== false && Number.isFinite(result.collected) ? result.collected : 0),
            0
        )

        let successStreak = 0
        for (const r of results) {
            if (r.success === true) successStreak++
            else break
        }

        const { emailKey, ...safe } = a
        void emailKey
        return {
            ...safe,
            level,
            pointsProgress: latestPoints('pointsProgress'),
            pointsRemaining: latestPoints('pointsRemaining'),
            lifetimeEarn: latestPoints('lifetimeEarn'),
            accountUpdatedAt: observations.find(account => account.accountUpdatedAt != null)?.accountUpdatedAt ?? null,
            resetAt: observations.find(account => account.resetAt != null)?.resetAt ?? null,
            resetAtSource: observations.find(account => account.resetAt != null)?.resetAtSource ?? null,
            runs: results.length,
            totalCollected: pointsKnown ? verifiedCollected : null,
            pointsKnown,
            verifiedCollected,
            successStreak,
            lastRunAt: last?.when ?? null,
            lastCollected: last?.pointsKnown === false ? null : (last?.collected ?? null),
            lastSuccess: last ? last.success : null,
            lastError: last?.error ?? null,
            lastCompletion: last?.completion ?? null,
            lastPointsBySource: last?.bySource ?? null,
            streaks: observations.find(account => account.streaks?.length)?.streaks ?? [],
            punchCards: observations.find(account => account.punchCards?.length)?.punchCards ?? [],
            streakProtection,
            edgeBrowsing
        }
    })
}
