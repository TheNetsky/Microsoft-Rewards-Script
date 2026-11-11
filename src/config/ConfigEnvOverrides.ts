import { logSystemMessage } from '../logging/LogEvent'
import { readJson, writeConfigAtomic } from './ConfigSync'
import { validateConfig, type ConfigValidationOptions } from './Validator'
import type { Config } from './Config'

export type OverrideType = 'string' | 'bool' | 'number' | 'array'

export interface EnvOverrideEntry {
    env: string
    path: string // dotted path into config.json
    type: OverrideType
}

export const ENV_OVERRIDES: EnvOverrideEntry[] = [
    // General
    { env: 'CONFIG_HEADLESS', path: 'headless', type: 'bool' },
    { env: 'CONFIG_CLUSTERS', path: 'clusters', type: 'number' },
    { env: 'CONFIG_REWARDS_MODE', path: 'rewardsMode', type: 'string' },
    { env: 'CONFIG_DEBUG_LOGS', path: 'debugLogs', type: 'bool' },
    { env: 'CONFIG_ERROR_DIAGNOSTICS', path: 'errorDiagnostics', type: 'bool' },
    { env: 'CONFIG_ENSURE_STREAK_PROTECTION', path: 'ensureStreakProtection', type: 'bool' },
    { env: 'CONFIG_AUTO_CLAIM_PUNCHCARD_REWARDS', path: 'autoClaimPunchcardRewards', type: 'bool' },
    { env: 'CONFIG_CONTINTUE_ON_BOT_WARNING', path: 'continueOnBotWarning', type: 'bool' },
    { env: 'CONFIG_CONTINUE_ON_BOT_WARNING', path: 'continueOnBotWarning', type: 'bool' },
    { env: 'CONFIG_SKIP_NON_POINT_TASKS', path: 'skipNonPointTasks', type: 'bool' },
    { env: 'CONFIG_GLOBAL_TIMEOUT', path: 'globalTimeout', type: 'string' },
    { env: 'CONFIG_ACCOUNT_DELAY_MIN', path: 'accountDelay.min', type: 'string' },
    { env: 'CONFIG_ACCOUNT_DELAY_MAX', path: 'accountDelay.max', type: 'string' },
    { env: 'CONFIG_TASK_DELAY_MIN', path: 'taskDelay.min', type: 'string' },
    { env: 'CONFIG_TASK_DELAY_MAX', path: 'taskDelay.max', type: 'string' },

    // Workers
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

    // Search settings
    { env: 'CONFIG_SEARCH_SCROLL_RANDOM', path: 'searchSettings.scrollRandomResults', type: 'bool' },
    { env: 'CONFIG_SEARCH_CLICK_RANDOM', path: 'searchSettings.clickRandomResults', type: 'bool' },
    { env: 'CONFIG_SEARCH_PARALLEL', path: 'searchSettings.parallelSearching', type: 'bool' },
    { env: 'CONFIG_SEARCH_CLUSTER', path: 'searchSettings.clusterSearch', type: 'bool' },
    { env: 'CONFIG_SEARCH_USE_ACCOUNT_LOCALE', path: 'searchSettings.useAccountLocale', type: 'bool' },
    { env: 'CONFIG_SEARCH_DELAY_MIN', path: 'searchSettings.searchDelay.min', type: 'string' },
    { env: 'CONFIG_SEARCH_DELAY_MAX', path: 'searchSettings.searchDelay.max', type: 'string' },
    { env: 'CONFIG_SEARCH_READ_DELAY_MIN', path: 'searchSettings.readDelay.min', type: 'string' },
    { env: 'CONFIG_SEARCH_READ_DELAY_MAX', path: 'searchSettings.readDelay.max', type: 'string' },
    { env: 'CONFIG_SEARCH_VISIT_TIME', path: 'searchSettings.searchResultVisitTime', type: 'string' },
    { env: 'CONFIG_SEARCH_RUN_ON_ZERO_POINTS', path: 'searchSettings.runOnZeroPoints', type: 'bool' },
    { env: 'CONFIG_SEARCH_MAX_BONUS_SEARCHES', path: 'searchSettings.maxBonusSearches', type: 'number' },
    { env: 'CONFIG_SEARCH_ON_BING_MAX_ATTEMPTS', path: 'searchSettings.maxSearchOnBingAttempts', type: 'number' },
    { env: 'CONFIG_SEARCH_QUERY_ENGINES', path: 'searchSettings.queryEngines', type: 'array' },
    { env: 'CONFIG_SEARCH_ON_BING_LOCAL', path: 'searchOnBingLocalQueries', type: 'bool' },

    // Activities
    { env: 'CONFIG_ACTIVITY_URL_REWARD', path: 'activities.urlReward', type: 'bool' },
    { env: 'CONFIG_ACTIVITY_SEARCH_ON_BING', path: 'activities.searchOnBing', type: 'bool' },

    // Experimental
    { env: 'CONFIG_EXPERIMENTAL_BLOCK_MEDIA', path: 'experimental.blockMedia', type: 'bool' },
    { env: 'CONFIG_EXPERIMENTAL_EDGE_BROWSING', path: 'experimental.edgeBrowsing', type: 'bool' },
    { env: 'CONFIG_EXPERIMENTAL_BROWSER_SEARCH_API_REPORT', path: 'experimental.browserSearchApiReport', type: 'bool' },

    // Proxy
    { env: 'CONFIG_PROXY_QUERY_ENGINE', path: 'proxy.queryEngine', type: 'bool' },
    { env: 'CONFIG_PROXY_IGNORE_CERTIFICATE_ERRORS', path: 'proxy.ignoreCertificateErrors', type: 'bool' },

    // Console log filter (levels/keywords are comma-separated)
    { env: 'CONFIG_LOG_FILTER_ENABLED', path: 'consoleLogFilter.enabled', type: 'bool' },
    { env: 'CONFIG_LOG_FILTER_MODE', path: 'consoleLogFilter.mode', type: 'string' },
    { env: 'CONFIG_LOG_FILTER_LEVELS', path: 'consoleLogFilter.levels', type: 'array' },
    { env: 'CONFIG_LOG_FILTER_KEYWORDS', path: 'consoleLogFilter.keywords', type: 'array' },

    // Discord webhook
    { env: 'CONFIG_FEISHU_ENABLED', path: 'webhook.feishu.enabled', type: 'bool' },
    { env: 'CONFIG_FEISHU_URL', path: 'webhook.feishu.url', type: 'string' },
    { env: 'CONFIG_FEISHU_SIGNING_SECRET', path: 'webhook.feishu.signingSecret', type: 'string' },
    { env: 'CONFIG_DISCORD_ENABLED', path: 'webhook.discord.enabled', type: 'bool' },
    { env: 'CONFIG_DISCORD_URL', path: 'webhook.discord.url', type: 'string' },

    // Telegram webhook
    { env: 'CONFIG_TELEGRAM_ENABLED', path: 'webhook.telegram.enabled', type: 'bool' },
    { env: 'CONFIG_TELEGRAM_BOTTOKEN', path: 'webhook.telegram.botToken', type: 'string' },
    { env: 'CONFIG_TELEGRAM_CHATID', path: 'webhook.telegram.chatId', type: 'string' },

    // ntfy webhook (tags are comma-separated e.g. "bot,notify")
    { env: 'CONFIG_NTFY_ENABLED', path: 'webhook.ntfy.enabled', type: 'bool' },
    { env: 'CONFIG_NTFY_URL', path: 'webhook.ntfy.url', type: 'string' },
    { env: 'CONFIG_NTFY_TOPIC', path: 'webhook.ntfy.topic', type: 'string' },
    { env: 'CONFIG_NTFY_TOKEN', path: 'webhook.ntfy.token', type: 'string' },
    { env: 'CONFIG_NTFY_TITLE', path: 'webhook.ntfy.title', type: 'string' },
    { env: 'CONFIG_NTFY_PRIORITY', path: 'webhook.ntfy.priority', type: 'number' },
    { env: 'CONFIG_NTFY_TAGS', path: 'webhook.ntfy.tags', type: 'array' },

    // Webhook log filter
    { env: 'CONFIG_WEBHOOK_LOG_FILTER_ENABLED', path: 'webhook.webhookLogFilter.enabled', type: 'bool' },
    { env: 'CONFIG_WEBHOOK_LOG_FILTER_MODE', path: 'webhook.webhookLogFilter.mode', type: 'string' },
    { env: 'CONFIG_WEBHOOK_LOG_FILTER_LEVELS', path: 'webhook.webhookLogFilter.levels', type: 'array' },
    { env: 'CONFIG_WEBHOOK_LOG_FILTER_KEYWORDS', path: 'webhook.webhookLogFilter.keywords', type: 'array' }
]

function computeForcedOverrides(env: NodeJS.ProcessEnv = process.env): { path: string; value: unknown }[] {
    const forceHeadless = env.FORCE_HEADLESS?.trim().toLowerCase()
    return forceHeadless && ['1', 'true', 'yes', 'on'].includes(forceHeadless)
        ? [{ path: 'headless', value: true }]
        : []
}

function setConfigOverride(obj: Record<string, unknown>, dottedPath: string, value: unknown): void {
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
            if (!['true', 'false', '1', '0', 'yes', 'no', 'on', 'off'].includes(raw.trim().toLowerCase())) {
                throw new Error(`${env} expects a boolean.`)
            }
            return ['true', '1', 'yes', 'on'].includes(raw.trim().toLowerCase())
        case 'number': {
            const n = Number(raw)
            if (!raw.trim() || !Number.isFinite(n)) throw new Error(`${env} expects a finite number.`)
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

function computeOverrides(env: NodeJS.ProcessEnv = process.env): {
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
            applied.push({ env: entry.env, path: entry.path, value: raw })
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

export function resolveConfigOverrides(
    data: unknown,
    env: NodeJS.ProcessEnv = process.env,
    options: ConfigValidationOptions = {}
): Config {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Config must be a JSON object')
    const config = structuredClone(data) as Record<string, unknown>
    for (const override of [...computeOverrides(env).applied, ...computeForcedOverrides(env)]) {
        setConfigOverride(config, override.path, override.value)
    }
    return validateConfig(config, options)
}

function applyEnvOverrides(configPath: string, env: NodeJS.ProcessEnv = process.env): ApplyReport {
    const { applied, errors } = computeOverrides(env)

    const forced = computeForcedOverrides(env)
    writeConfigAtomic(configPath, resolveConfigOverrides(readJson(configPath), env), { backup: false })

    return { configPath, forced, applied, errors }
}

if (require.main === module) {
    const args = process.argv.slice(2)
    const command = args[0]

    const printHelp = (): void => {
        console.log(`
Microsoft Rewards CONFIG_* environment overrides

Usage:
  node dist/config/ConfigEnvOverrides.js list [--format table|env]
  node dist/config/ConfigEnvOverrides.js apply --config <path>

Commands:
  list         Show every supported environment override.
  apply        Apply configured overrides to one config.json file.

Options:
  --format     Output format for list. Defaults to table.
  --config     Required config.json path for apply.
  --help       Show this help.

Examples:
  node dist/config/ConfigEnvOverrides.js list
  node dist/config/ConfigEnvOverrides.js list --format env
  node dist/config/ConfigEnvOverrides.js apply --config ./config.json
`)
    }

    const failUsage = (message: string): never => {
        logSystemMessage('error', 'CONFIG-OVERRIDES', `${message}`)
        printHelp()
        process.exit(1)
    }

    const readOnlyOption = (flag: string): string | undefined => {
        const index = args.indexOf(flag)
        if (index === -1) return undefined
        const value = args[index + 1]
        if (!value || value.startsWith('-')) failUsage(`${flag} requires a value after it.`)
        return value
    }

    if (args.includes('--help') || args.includes('-h')) {
        printHelp()
        process.exit(0)
    }
    if (!command) failUsage('Missing command. Choose "list" or "apply".')
    if (command !== 'list' && command !== 'apply') failUsage(`Unknown command "${command}".`)

    if (command === 'list') {
        const format = readOnlyOption('--format') ?? 'table'
        const expectedLength = args.includes('--format') ? 3 : 1
        if (args.length !== expectedLength || !['table', 'env'].includes(format)) {
            failUsage('The list command only accepts --format table or --format env.')
        }
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
        const configPath = readOnlyOption('--config') ?? failUsage('The apply command requires --config <path>.')
        if (args.length !== 3) failUsage('The apply command only accepts --config <path>.')
        try {
            const report = applyEnvOverrides(configPath)
            report.forced.forEach(f => logSystemMessage('info', 'CONFIG-OVERRIDES', `.${f.path} = ${f.value} (forced)`))
            report.applied.forEach(a => logSystemMessage('info', 'CONFIG-OVERRIDES', `.${a.path} = [set]`))
            logSystemMessage('info', 'CONFIG-OVERRIDES', `Applied ${report.applied.length} override(s).`)
            process.exit(0)
        } catch (err) {
            logSystemMessage('error', 'CONFIG-OVERRIDES', `${err instanceof Error ? err.message : String(err)}`)
            process.exit(1)
        }
    }
}
