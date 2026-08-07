/**
 * ConfigEnvOverrides.ts
 *
 * CONFIG_* 环境变量覆盖的唯一事实来源；每次 Docker 容器启动时，
 * 这些覆盖都会应用到 config.json。此前该映射在 entrypoint.sh 中存在两份：
 * 一份是手写的文档注释，另一份是实际的 `_cfg`/`_cfg_array` 调用列表，
 * 两者必须手动保持同步。现在只保留一个表（ENV_OVERRIDES），
 * 应用逻辑和 `list` 输出均由此生成。
 *
 * 裸机运行完全不使用此模块，Load.ts/Validator.ts 不受影响。
 *
 * 用法：
 *   node dist/util/ConfigEnvOverrides.js apply --config <path>
 *   node dist/util/ConfigEnvOverrides.js list [--format table|env]
 */

import { readJson, writeConfigAtomic } from './ConfigSync'

export type OverrideType = 'string' | 'bool' | 'number' | 'array'

export interface EnvOverrideEntry {
    env: string
    path: string // config.json 中以点分隔的路径
    type: OverrideType
}

export const ENV_OVERRIDES: EnvOverrideEntry[] = [
    // 常规
    { env: 'CONFIG_CLUSTERS', path: 'clusters', type: 'number' },
    { env: 'CONFIG_DEBUG_LOGS', path: 'debugLogs', type: 'bool' },
    { env: 'CONFIG_ERROR_DIAGNOSTICS', path: 'errorDiagnostics', type: 'bool' },
    { env: 'CONFIG_ENSURE_STREAK_PROTECTION', path: 'ensureStreakProtection', type: 'bool' },
    { env: 'CONFIG_AUTO_CLAIM_PUNCHCARD_REWARDS', path: 'autoClaimPunchcardRewards', type: 'bool' },
    { env: 'CONFIG_SKIP_NON_POINT_TASKS', path: 'skipNonPointTasks', type: 'bool' },
    { env: 'CONFIG_GLOBAL_TIMEOUT', path: 'globalTimeout', type: 'string' },
    { env: 'CONFIG_ACCOUNT_DELAY_MIN', path: 'accountDelay.min', type: 'string' },
    { env: 'CONFIG_ACCOUNT_DELAY_MAX', path: 'accountDelay.max', type: 'string' },

    // 工作器
    { env: 'CONFIG_WORKER_DAILY_SET', path: 'workers.doDailySet', type: 'bool' },
    { env: 'CONFIG_WORKER_CLAIM_BONUS_POINTS', path: 'workers.doClaimBonusPoints', type: 'bool' },
    { env: 'CONFIG_WORKER_MORE_PROMOTIONS', path: 'workers.doMorePromotions', type: 'bool' },
    { env: 'CONFIG_WORKER_PUNCH_CARDS', path: 'workers.doPunchCards', type: 'bool' },
    { env: 'CONFIG_WORKER_APP_PROMOTIONS', path: 'workers.doAppPromotions', type: 'bool' },
    { env: 'CONFIG_WORKER_DESKTOP_SEARCH', path: 'workers.doDesktopSearch', type: 'bool' },
    { env: 'CONFIG_WORKER_MOBILE_SEARCH', path: 'workers.doMobileSearch', type: 'bool' },
    { env: 'CONFIG_WORKER_BONUS_SEARCHES', path: 'workers.doBonusSearches', type: 'bool' },
    { env: 'CONFIG_WORKER_DAILY_CHECKIN', path: 'workers.doDailyCheckIn', type: 'bool' },
    { env: 'CONFIG_WORKER_READ_TO_EARN', path: 'workers.doReadToEarn', type: 'bool' },
    { env: 'CONFIG_WORKER_ACTIVATE_SEARCH_PERK', path: 'workers.doActivateSearchPerk', type: 'bool' },
    { env: 'CONFIG_WORKER_VISUAL_SEARCH', path: 'workers.doVisualSearch', type: 'bool' },

    // 搜索设置
    { env: 'CONFIG_SEARCH_SCROLL_RANDOM', path: 'searchSettings.scrollRandomResults', type: 'bool' },
    { env: 'CONFIG_SEARCH_CLICK_RANDOM', path: 'searchSettings.clickRandomResults', type: 'bool' },
    { env: 'CONFIG_SEARCH_PARALLEL', path: 'searchSettings.parallelSearching', type: 'bool' },
    { env: 'CONFIG_SEARCH_CLUSTER', path: 'searchSettings.clusterSearch', type: 'bool' },
    { env: 'CONFIG_SEARCH_DELAY_MIN', path: 'searchSettings.searchDelay.min', type: 'string' },
    { env: 'CONFIG_SEARCH_DELAY_MAX', path: 'searchSettings.searchDelay.max', type: 'string' },
    { env: 'CONFIG_SEARCH_READ_DELAY_MIN', path: 'searchSettings.readDelay.min', type: 'string' },
    { env: 'CONFIG_SEARCH_READ_DELAY_MAX', path: 'searchSettings.readDelay.max', type: 'string' },
    { env: 'CONFIG_SEARCH_VISIT_TIME', path: 'searchSettings.searchResultVisitTime', type: 'string' },
    { env: 'CONFIG_SEARCH_RUN_ON_ZERO_POINTS', path: 'searchSettings.runOnZeroPoints', type: 'bool' },
    { env: 'CONFIG_SEARCH_MAX_BONUS_SEARCHES', path: 'searchSettings.maxBonusSearches', type: 'number' },
    { env: 'CONFIG_SEARCH_QUERY_ENGINES', path: 'searchSettings.queryEngines', type: 'array' },
    { env: 'CONFIG_SEARCH_ON_BING_LOCAL', path: 'searchOnBingLocalQueries', type: 'bool' },

    // 活动
    { env: 'CONFIG_ACTIVITY_URL_REWARD', path: 'activities.urlReward', type: 'bool' },
    { env: 'CONFIG_ACTIVITY_SEARCH_ON_BING', path: 'activities.searchOnBing', type: 'bool' },

    // 实验性功能
    { env: 'CONFIG_EXPERIMENTAL_API_SEARCH', path: 'experimental.apiSearch', type: 'bool' },
    { env: 'CONFIG_EXPERIMENTAL_API_SEARCH_ON_BING', path: 'experimental.apiSearchOnBing', type: 'bool' },

    // 代理
    { env: 'CONFIG_PROXY_QUERY_ENGINE', path: 'proxy.queryEngine', type: 'bool' },

    // 控制台日志过滤器（级别/关键词以逗号分隔）
    { env: 'CONFIG_LOG_FILTER_ENABLED', path: 'consoleLogFilter.enabled', type: 'bool' },
    { env: 'CONFIG_LOG_FILTER_MODE', path: 'consoleLogFilter.mode', type: 'string' },
    { env: 'CONFIG_LOG_FILTER_LEVELS', path: 'consoleLogFilter.levels', type: 'array' },
    { env: 'CONFIG_LOG_FILTER_KEYWORDS', path: 'consoleLogFilter.keywords', type: 'array' },

    // Discord Webhook 配置
    { env: 'CONFIG_DISCORD_ENABLED', path: 'webhook.discord.enabled', type: 'bool' },
    { env: 'CONFIG_DISCORD_URL', path: 'webhook.discord.url', type: 'string' },

    // Telegram Webhook 配置
    { env: 'CONFIG_TELEGRAM_ENABLED', path: 'webhook.telegram.enabled', type: 'bool' },
    { env: 'CONFIG_TELEGRAM_BOTTOKEN', path: 'webhook.telegram.botToken', type: 'string' },
    { env: 'CONFIG_TELEGRAM_CHATID', path: 'webhook.telegram.chatId', type: 'string' },

    // ntfy webhook（标签以逗号分隔，例如 "bot,notify"）
    { env: 'CONFIG_NTFY_ENABLED', path: 'webhook.ntfy.enabled', type: 'bool' },
    { env: 'CONFIG_NTFY_URL', path: 'webhook.ntfy.url', type: 'string' },
    { env: 'CONFIG_NTFY_TOPIC', path: 'webhook.ntfy.topic', type: 'string' },
    { env: 'CONFIG_NTFY_TOKEN', path: 'webhook.ntfy.token', type: 'string' },
    { env: 'CONFIG_NTFY_TITLE', path: 'webhook.ntfy.title', type: 'string' },
    { env: 'CONFIG_NTFY_PRIORITY', path: 'webhook.ntfy.priority', type: 'number' },
    { env: 'CONFIG_NTFY_TAGS', path: 'webhook.ntfy.tags', type: 'array' },

    // Webhook 日志过滤器
    { env: 'CONFIG_WEBHOOK_LOG_FILTER_ENABLED', path: 'webhook.webhookLogFilter.enabled', type: 'bool' },
    { env: 'CONFIG_WEBHOOK_LOG_FILTER_MODE', path: 'webhook.webhookLogFilter.mode', type: 'string' },
    { env: 'CONFIG_WEBHOOK_LOG_FILTER_LEVELS', path: 'webhook.webhookLogFilter.levels', type: 'array' },
    { env: 'CONFIG_WEBHOOK_LOG_FILTER_KEYWORDS', path: 'webhook.webhookLogFilter.keywords', type: 'array' }
]

// Docker 中始终强制将 headless 设为 true；它不由环境变量驱动，因此不在上表中，
// 但每次启动时会以相同方式应用。
const FORCED_OVERRIDES: { path: string; value: unknown }[] = [{ path: 'headless', value: true }]

function setDeep(obj: Record<string, unknown>, dottedPath: string, value: unknown): void {
    const parts = dottedPath.split('.')
    let cur = obj
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i] as string
        const next = cur[key]
        if (typeof next !== 'object' || next === null || Array.isArray(next)) {
            cur[key] = {}
        }
        cur = cur[key] as Record<string, unknown>
    }
    cur[parts[parts.length - 1] as string] = value
}

function coerceScalar(raw: string, type: 'bool' | 'number' | 'string', env: string): unknown {
    switch (type) {
        case 'bool':
            if (raw !== 'true' && raw !== 'false') {
                throw new Error(`${env} expects true or false, got '${raw}'.`)
            }
            return raw === 'true'
        case 'number': {
            const n = Number(raw)
            if (!Number.isFinite(n)) throw new Error(`${env} expects a JSON number, got '${raw}'.`)
            return n
        }
        case 'string':
        default:
            return raw
    }
}

export interface ComputedOverride {
    env: string
    path: string
    value: unknown
}

export interface OverrideError {
    env: string
    message: string
}

/**
 * 根据 `env` 读取 ENV_OVERRIDES，并返回要应用的值。
 * 与之前的 bash 语义一致：未设置或设为空字符串的标量变量会被跳过
 * （`_cfg` 无法区分这两种情况）；未设置的数组变量会被跳过，
 * 但设为空字符串时会应用 `[]`。
 */
export function computeOverrides(env: NodeJS.ProcessEnv = process.env): {
    applied: ComputedOverride[]
    errors: OverrideError[]
} {
    const applied: ComputedOverride[] = []
    const errors: OverrideError[] = []

    for (const entry of ENV_OVERRIDES) {
        if (entry.type === 'array') {
            if (!(entry.env in env)) continue
            const raw = env[entry.env] ?? ''
            const value = raw === '' ? [] : raw.split(',').map(s => s.trim())
            applied.push({ env: entry.env, path: entry.path, value })
            continue
        }

        const raw = env[entry.env]
        if (raw === undefined || raw === '') continue
        try {
            const value = coerceScalar(raw, entry.type, entry.env)
            applied.push({ env: entry.env, path: entry.path, value })
        } catch (err) {
            errors.push({ env: entry.env, message: err instanceof Error ? err.message : String(err) })
        }
    }

    return { applied, errors }
}

export interface ApplyReport {
    configPath: string
    forced: { path: string; value: unknown }[]
    applied: ComputedOverride[]
    errors: OverrideError[]
}

/**
 * 通过一次原子写入，将 FORCED_OVERRIDES 和 ENV_OVERRIDES 应用到 config.json。
 * 与旧版 bash 实现不同（旧版会按变量逐个写入，因此无效值会在磁盘上留下部分更改），
 * 此实现会先验证全部内容，只有不存在错误时才写入。
 */
export function applyEnvOverrides(configPath: string, env: NodeJS.ProcessEnv = process.env): ApplyReport {
    const { applied, errors } = computeOverrides(env)
    if (errors.length > 0) {
        return { configPath, forced: [], applied: [], errors }
    }

    const config = readJson(configPath) as Record<string, unknown>
    for (const { path: p, value } of FORCED_OVERRIDES) setDeep(config, p, value)
    for (const { path: p, value } of applied) setDeep(config, p, value)

    // 此处不生成 .bak：它会在每次容器启动时运行，不同于较少执行的默认值同步补丁，
    // 因此每次启动都备份只会产生无用文件。
    writeConfigAtomic(configPath, config, { backup: false })

    return { configPath, forced: FORCED_OVERRIDES, applied, errors: [] }
}

// ── entrypoint.sh 使用的 CLI 入口点 ──
if (require.main === module) {
    const args = process.argv.slice(2)
    const command = args[0]
    const getArg = (flag: string) => {
        const i = args.indexOf(flag)
        return i !== -1 ? args[i + 1] : undefined
    }

    if (command === 'list') {
        const format = getArg('--format') ?? 'table'
        if (format === 'env') {
            for (const e of ENV_OVERRIDES) console.log(e.env)
        } else {
            console.log('ENV VAR'.padEnd(42) + 'CONFIG PATH'.padEnd(42) + 'TYPE')
            for (const e of ENV_OVERRIDES) {
                console.log(e.env.padEnd(42) + ('.' + e.path).padEnd(42) + e.type)
            }
        }
        process.exit(0)
    }

    if (command === 'apply') {
        const configPath = getArg('--config')
        if (!configPath) {
            console.error('Usage: node dist/util/ConfigEnvOverrides.js apply --config <path>')
            process.exit(1)
        }
        try {
            const report = applyEnvOverrides(configPath)
            if (report.errors.length > 0) {
                console.error('[entrypoint] Invalid CONFIG_* override value(s) - no changes were written:')
                report.errors.forEach(e => console.error(`[entrypoint]   ${e.message}`))
                process.exit(1)
            }
            report.forced.forEach(f => console.log(`[entrypoint]   .${f.path} = ${f.value} (forced)`))
            report.applied.forEach(a => console.log(`[entrypoint]   .${a.path} = ${JSON.stringify(a.value)}`))
            console.log(`[entrypoint] Applied ${report.applied.length} override(s).`)
            process.exit(0)
        } catch (err) {
            console.error(`[entrypoint] ERROR: ${err instanceof Error ? err.message : String(err)}`)
            process.exit(1)
        }
    }

    if (!command) {
        console.error('Usage: node dist/util/ConfigEnvOverrides.js <apply|list> [options]')
        process.exit(1)
    }
}
