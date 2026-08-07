import { accountIndexesFromEnv, envStrFrom, normalizeGeoLocale, normalizeLanguageCode } from '../env.js'

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

/**
 * 返回已配置账号，但不公开密码、恢复地址、TOTP 密钥或代理凭据。
 * 此 API 面向本地仪表盘，因此会完整返回账号邮箱地址。
 */
export function loadAccounts(sourceEnv = process.env) {
    const accounts = []

    for (const i of accountIndexesFromEnv(sourceEnv)) {
        const email = envStrFrom(sourceEnv, `ACCOUNT_${i}_EMAIL`)
        if (!email) continue

        const proxyUrl = envStrFrom(sourceEnv, `ACCOUNT_${i}_PROXY_URL`)
        accounts.push({
            index: i,
            email,
            emailKey: email, // 内部历史关联键；返回响应前会移除
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

/**
 * 构建仅对子进程生效的环境变量覆盖，使其只运行一个已配置账号。
 * 选中的槽位会在隔离的子进程环境中重新映射为 ACCOUNT_1_*。
 * 任何机密值都不会离开 API 进程。
 */
export function buildSingleAccountEnv(accountIndex, sourceEnv = process.env) {
    const index = Number(accountIndex)
    if (!Number.isSafeInteger(index) || index < 1) {
        const err = new Error('`accountIndex` must be a positive integer.')
        err.code = 'BAD_REQUEST'
        throw err
    }

    const selectedPrefix = `ACCOUNT_${index}_`
    const selected = Object.entries(sourceEnv).filter(([key]) => key.startsWith(selectedPrefix))
    const email = envStrFrom(sourceEnv, `${selectedPrefix}EMAIL`)
    if (!email) {
        const err = new Error(`ACCOUNT_${index} is not configured.`)
        err.code = 'BAD_REQUEST'
        throw err
    }

    const env = {}

    // 先清空子进程环境中的所有已配置账号变量。
    // 机器人的环境变量解析器会将空字符串视为未设置。
    for (const key of Object.keys(sourceEnv)) {
        if (/^ACCOUNT_\d+_/.test(key)) env[key] = ''
    }

    // 将选定槽位复制到槽位 1，包括此 API 尚不了解的未来 ACCOUNT_N_* 字段
    // （密码、浏览器设置、代理字段等）。
    for (const [key, value] of selected) {
        const suffix = key.slice(selectedPrefix.length)
        env[`ACCOUNT_1_${suffix}`] = value
    }

    return {
        env,
        account: { index, email }
    }
}

/**
 * 构建排除所选已配置槽位的连续子进程账号环境。
 * 剩余槽位会重新映射为 ACCOUNT_1..N。
 */
export function buildExcludedAccountsEnv(excludedAccountIndexes, sourceEnv = process.env) {
    if (!Array.isArray(excludedAccountIndexes)) {
        const err = new Error('`excludedAccountIndexes` must be an array of positive integers.')
        err.code = 'BAD_REQUEST'
        throw err
    }

    const excluded = [...new Set(excludedAccountIndexes.map(Number))]
    if (excluded.some(index => !Number.isSafeInteger(index) || index < 1)) {
        const err = new Error('`excludedAccountIndexes` must contain only positive integers.')
        err.code = 'BAD_REQUEST'
        throw err
    }

    const accounts = loadAccounts(sourceEnv)
    const knownIndexes = new Set(accounts.map(account => account.index))
    const unknown = excluded.filter(index => !knownIndexes.has(index))
    if (unknown.length) {
        const err = new Error(
            `Unknown account slot${unknown.length === 1 ? '' : 's'}: ${unknown.map(index => `ACCOUNT_${index}`).join(', ')}.`
        )
        err.code = 'BAD_REQUEST'
        throw err
    }

    const excludedSet = new Set(excluded)
    const included = accounts.filter(account => !excludedSet.has(account.index))
    if (!included.length) {
        const err = new Error('A scheduled run cannot exclude every configured account.')
        err.code = 'BAD_REQUEST'
        throw err
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

export function mergeAccountStats(accounts, runs) {
    // 按邮箱为历史结果建立索引。
    const byEmail = new Map()
    for (const run of runs) {
        const when = run.endedAt || run.startedAt || null
        for (const acc of run.accounts || []) {
            if (!byEmail.has(acc.email)) byEmail.set(acc.email, [])
            byEmail.get(acc.email).push({ ...acc, when })
        }
    }

    return accounts.map(a => {
        const results = byEmail.get(a.emailKey) || [] // 已按最近优先排序
        const last = results[0] || null
        const streakProtection = results.find(result => result.streakProtection != null)?.streakProtection ?? null

        let totalCollected = 0
        for (const r of results) totalCollected += r.collected || 0

        // 从最近一次运行开始向前统计连续成功次数。
        let successStreak = 0
        for (const r of results) {
            if (r.success === true) successStreak++
            else break
        }

        const { emailKey, ...safe } = a
        void emailKey
        return {
            ...safe,
            runs: results.length,
            totalCollected,
            successStreak,
            lastRunAt: last?.when ?? null,
            lastCollected: last?.collected ?? null,
            lastSuccess: last ? last.success : null,
            lastError: last?.error ?? null,
            streakProtection
        }
    })
}
