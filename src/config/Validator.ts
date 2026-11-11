import { z } from 'zod'
import semver from 'semver'
import ms, { StringValue } from 'ms'
import pkg from '../../package.json'

import { Config } from './Config'
import { defaultConfig } from './Defaults'
import { Account } from '../core/Account'
import { normalizeCountry, normalizeLanguageTag } from '../util/Locale'
import { proxyValidationIssues } from '../../scripts/lib/proxy.cjs'
import { logConfigWarning, logSystemMessage } from '../logging/LogEvent'
import { isPlainObject } from '../util/Utils'

const NumberOrString = z.union([z.number(), z.string()])

const LogFilterSchema = z.strictObject({
    enabled: z.boolean(),
    mode: z.enum(['whitelist', 'blacklist']),
    levels: z.array(z.enum(['debug', 'info', 'warn', 'error'])).optional(),
    keywords: z.array(z.string()).optional(),
    regexPatterns: z
        .array(
            z.string().refine(value => {
                try {
                    new RegExp(value)
                    return true
                } catch {
                    return false
                }
            }, 'Invalid regular expression')
        )
        .optional()
})

function durationToMs(value: number | string): number | undefined {
    try {
        return typeof value === 'number' ? value : ms(value as StringValue)
    } catch {
        return undefined
    }
}

const DurationValue = NumberOrString.refine(value => {
    const parsed = durationToMs(value)
    return parsed !== undefined && Number.isFinite(parsed) && parsed >= 0 && parsed <= 2147483647
}, 'Expected a duration from 0 to 2147483647 milliseconds')

const DelaySchema = z
    .strictObject({
        min: DurationValue,
        max: DurationValue
    })
    .superRefine((delay, ctx) => {
        const min = durationToMs(delay.min)
        const max = durationToMs(delay.max)
        if (min !== undefined && max !== undefined && max < min) {
            ctx.addIssue({
                code: 'custom',
                message: 'Maximum delay must be greater than or equal to minimum delay'
            })
        }
    })

const QueryEngineSchema = z.union([
    z.enum(['google', 'wikipedia', 'wikirandom', 'hackernews', 'reddit', 'local']),
    z
        .string()
        .regex(/^rss(\.[A-Za-z0-9_-]+){0,2}$/, 'Invalid rss selector (use rss, rss.<site>, or rss.<site>.<endpoint>)')
])

const AccountLanguageSchema = z
    .string()
    .trim()
    .min(1)
    .refine(value => {
        try {
            normalizeLanguageTag(value)
            return true
        } catch {
            return false
        }
    }, 'Expected a valid BCP 47 language tag')
    .transform(normalizeLanguageTag)

const AccountCountrySchema = z
    .string()
    .trim()
    .transform(value => (value.toLowerCase() === 'auto' ? 'auto' : value.toUpperCase()))
    .refine(
        value => value === 'auto' || normalizeCountry(value) !== undefined,
        'Expected "auto" or a two-letter country code'
    )

const WebhookSchema = z.strictObject({
    feishu: z.strictObject({ enabled: z.boolean(), url: z.string(), signingSecret: z.string().optional() }).optional(),
    discord: z
        .strictObject({
            enabled: z.boolean(),
            url: z.string()
        })
        .optional(),
    ntfy: z
        .strictObject({
            enabled: z.boolean().optional(),
            url: z.string(),
            topic: z.string().optional(),
            token: z.string().optional(),
            title: z.string().optional(),
            tags: z.array(z.string()).optional(),
            priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional()
        })
        .optional(),
    telegram: z
        .strictObject({
            enabled: z.boolean().optional(),
            botToken: z.string(),
            chatId: z.union([z.string(), z.number()])
        })
        .optional(),
    webhookLogFilter: LogFilterSchema
})

const ConfigSchema = z.strictObject({
    sessionPath: z.string(),
    headless: z.boolean(),
    clusters: z.number().int().positive(),
    rewardsMode: z.enum(['api', 'browser']).default(defaultConfig.rewardsMode),
    errorDiagnostics: z.boolean(),
    ensureStreakProtection: z.boolean(),
    autoClaimPunchcardRewards: z.boolean(),
    continueOnBotWarning: z.boolean().default(defaultConfig.continueOnBotWarning),
    skipNonPointTasks: z.boolean().default(defaultConfig.skipNonPointTasks),
    accountDelay: DelaySchema.default(defaultConfig.accountDelay),
    taskDelay: DelaySchema.default(defaultConfig.taskDelay),
    workers: z.strictObject({
        doDailySet: z.boolean(),
        doMorePromotions: z.boolean(),
        doClaimBonusPoints: z.boolean(),
        doPunchCards: z.boolean(),
        doAppPromotions: z.boolean(),
        doDesktopSearch: z.boolean(),
        doMobileSearch: z.boolean(),
        doBonusSearches: z.boolean(),
        doDailyCheckIn: z.boolean(),
        doReadToEarn: z.boolean(),
        doActivateSearchPerk: z.boolean(),
        doVisualSearch: z.boolean().default(defaultConfig.workers.doVisualSearch)
    }),
    activities: z
        .strictObject({
            urlReward: z.boolean().default(defaultConfig.activities.urlReward),
            searchOnBing: z.boolean().default(defaultConfig.activities.searchOnBing)
        })
        .default(defaultConfig.activities),
    searchOnBingLocalQueries: z.boolean(),
    globalTimeout: DurationValue.refine(value => (durationToMs(value) ?? 0) > 0, 'Timeout must be greater than zero'),
    searchSettings: z.strictObject({
        scrollRandomResults: z.boolean(),
        clickRandomResults: z.boolean(),
        runOnZeroPoints: z.boolean().default(defaultConfig.searchSettings.runOnZeroPoints),
        maxBonusSearches: z
            .number()
            .int()
            .nonnegative()
            .max(1000)
            .default(defaultConfig.searchSettings.maxBonusSearches),
        maxSearchOnBingAttempts: z
            .number()
            .int()
            .positive()
            .default(defaultConfig.searchSettings.maxSearchOnBingAttempts),
        parallelSearching: z.boolean().default(defaultConfig.searchSettings.parallelSearching),
        clusterSearch: z.boolean().default(defaultConfig.searchSettings.clusterSearch),
        useAccountLocale: z.boolean().default(defaultConfig.searchSettings.useAccountLocale),
        queryEngines: z.array(QueryEngineSchema).min(1),
        searchResultVisitTime: DurationValue,
        searchDelay: DelaySchema,
        readDelay: DelaySchema
    }),
    experimental: z
        .strictObject({
            blockMedia: z.boolean().default(defaultConfig.experimental.blockMedia),
            edgeBrowsing: z.boolean().default(defaultConfig.experimental.edgeBrowsing),
            browserSearchApiReport: z.boolean().default(defaultConfig.experimental.browserSearchApiReport)
        })
        .default(defaultConfig.experimental),
    debugLogs: z.boolean(),
    proxy: z.strictObject({
        queryEngine: z.boolean(),
        ignoreCertificateErrors: z.boolean().default(defaultConfig.proxy.ignoreCertificateErrors)
    }),
    consoleLogFilter: LogFilterSchema,
    webhook: WebhookSchema
})

const AccountProxySchema = z
    .strictObject({
        proxyHttp: z.boolean(),
        url: z.string(),
        port: z.number(),
        password: z.string(),
        username: z.string()
    })
    .superRefine((proxy, ctx) => {
        for (const { field, message } of proxyValidationIssues(proxy))
            ctx.addIssue({ code: 'custom', path: [field], message })
    })

const AccountSchema = z.strictObject({
    email: z.string(),
    password: z.string(),
    totpSecret: z.string().optional(),
    recoveryEmail: z.string(),
    geoLocale: AccountCountrySchema,
    langCode: AccountLanguageSchema,
    proxy: AccountProxySchema,
    saveFingerprint: z.strictObject({
        mobile: z.boolean(),
        desktop: z.boolean()
    })
})

export interface ConfigValidationOptions {
    onWarning?: (message: string) => void
}

function formatConfigValue(path: string, value: unknown): string {
    if (/(?:password|token|secret|url|chatid)/i.test(path)) return '"[redacted]"'
    if (Array.isArray(value))
        return `[${value.map((item, index) => formatConfigValue(`${path}.${index}`, item)).join(',')}]`.slice(0, 500)
    if (isPlainObject(value)) {
        const parts = Object.entries(value).map(
            ([key, item]) => `${JSON.stringify(key)}:${formatConfigValue(`${path}.${key}`, item)}`
        )
        return `{${parts.join(',')}}`.slice(0, 500)
    }
    return (JSON.stringify(value) ?? 'undefined').slice(0, 500)
}

function fillMissing(data: unknown, fallback: unknown, warn: (message: string) => void, path = ''): unknown {
    if (!isPlainObject(fallback) || !isPlainObject(data)) return data
    const result: Record<string, unknown> = { ...data }
    for (const [key, value] of Object.entries(fallback)) {
        const field = path ? `${path}.${key}` : key
        if (result[key] === undefined) {
            result[key] = structuredClone(value)
            warn(`Missing config | key=${field} | fallback=${formatConfigValue(field, value)}`)
        } else if (isPlainObject(value)) {
            result[key] = fillMissing(result[key], value, warn, field)
        }
    }
    return result
}

export function validateConfig(data: unknown, { onWarning = logConfigWarning }: ConfigValidationOptions = {}): Config {
    if (!isPlainObject(data)) throw new Error('Config must be a JSON object')
    const input = { ...data }
    if (isPlainObject(input.experimental)) {
        const experimental = { ...input.experimental }
        input.experimental = experimental
        for (const key of ['apiSearch', 'apiSearchOnBing']) {
            if (key in experimental) {
                onWarning(`Obsolete config | key=experimental.${key} | ignored; search transport follows rewardsMode`)
                delete experimental[key]
            }
        }
    }
    if (input.contintueOnBotWarning !== undefined) {
        if (input.continueOnBotWarning === undefined) input.continueOnBotWarning = input.contintueOnBotWarning
        onWarning('Deprecated config | key=contintueOnBotWarning | replacement=continueOnBotWarning')
        delete input.contintueOnBotWarning
    }
    const normalized = fillMissing(input, defaultConfig, onWarning) as Record<string, unknown>

    for (let pass = 0; pass < 10; pass++) {
        const result = ConfigSchema.safeParse(normalized)
        if (result.success) return result.data as Config
        const repaired = new Set<string>()
        for (const issue of result.error.issues) {
            const parts = issue.path.map(String)
            if (parts.some((_, index) => repaired.has(parts.slice(0, index + 1).join('.')))) continue
            if (issue.code === 'unrecognized_keys') {
                let parent = normalized
                for (const key of parts) parent = parent[key] as Record<string, unknown>
                for (const key of issue.keys) {
                    const field = [...parts, key].join('.')
                    onWarning(
                        `Unknown config | key=${field} | entered=${formatConfigValue(field, parent[key])} | fallback=removed`
                    )
                    delete parent[key]
                }
                continue
            }
            let parent = normalized
            let fallback: unknown = defaultConfig
            for (let index = 0; index < parts.length; index++) {
                const key = parts[index]!
                if (!isPlainObject(fallback)) throw new Error(`No config fallback for ${parts.join('.')}`)
                const next = fallback[key]
                if (index === parts.length - 1 || !isPlainObject(next)) {
                    const field = parts.slice(0, index + 1).join('.')
                    if (repaired.has(field)) break
                    repaired.add(field)
                    const entered = parent[key]
                    if (next === undefined) delete parent[key]
                    else parent[key] = structuredClone(next)
                    onWarning(
                        `Invalid config | key=${field} | entered=${formatConfigValue(field, entered)} | fallback=${formatConfigValue(field, next)} | reason=${issue.message}`
                    )
                    break
                }
                parent = parent[key] as Record<string, unknown>
                fallback = next
            }
        }
    }
    throw new Error('Config could not be normalized to the documented defaults')
}

export function validateAccounts(data: unknown): Account[] {
    const result = z.array(AccountSchema).safeParse(data)
    if (result.success) return result.data

    for (const issue of result.error.issues) {
        const path = issue.path.join('.') || '<root>'
        if (issue.code === 'invalid_type') {
            if (issue.input === undefined) {
                logSystemMessage('error', 'ACCOUNTS', `"${path}" is missing (expected ${issue.expected})`)
            } else {
                logSystemMessage(
                    'error',
                    'ACCOUNTS',
                    `"${path}" has wrong type: expected ${issue.expected}, got ${typeof issue.input}`
                )
            }
        } else if (issue.code === 'invalid_union') {
            logSystemMessage('error', 'ACCOUNTS', `"${path}" does not match any allowed type: ${issue.message}`)
        } else {
            logSystemMessage('error', 'ACCOUNTS', `"${path}" ${issue.message} (code: ${issue.code})`)
        }
    }
    throw new Error(`Accounts validation failed: ${result.error.issues.length} issue(s) - see logs above`)
}

export function checkNodeVersion(): void {
    try {
        const requiredVersion = pkg.engines?.node

        if (!requiredVersion) {
            logSystemMessage(
                'warn',
                'VALIDATOR',
                'No Node.js version requirement found in package.json "engines" field.'
            )
            return
        }

        if (!semver.satisfies(process.version, requiredVersion)) {
            logSystemMessage(
                'error',
                'VALIDATOR',
                `Current Node.js version ${process.version} does not satisfy requirement: ${requiredVersion}`
            )
            process.exit(1)
        }
    } catch (error) {
        logSystemMessage(
            'error',
            'VALIDATOR',
            `Failed to validate Node.js version: ${error instanceof Error ? error.message : String(error)}`
        )
        process.exit(1)
    }
}
