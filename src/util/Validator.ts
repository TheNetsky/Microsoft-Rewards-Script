import { z } from 'zod'
import semver from 'semver'
import ms, { StringValue } from 'ms'
import pkg from '../../package.json'

import { Config } from '../interface/Config'
import { Account } from '../interface/Account'
import { normalizeCountry, normalizeLanguageTag } from './Locale'

const NumberOrString = z.union([z.number(), z.string()])

const LogFilterSchema = z.object({
    enabled: z.boolean(),
    mode: z.enum(['whitelist', 'blacklist']),
    levels: z.array(z.enum(['debug', 'info', 'warn', 'error'])).optional(),
    keywords: z.array(z.string()).optional(),
    regexPatterns: z.array(z.string()).optional()
})

function durationToMs(value: number | string): number | undefined {
    return typeof value === 'number' ? value : ms(value as StringValue)
}

const DurationValue = NumberOrString.refine(value => {
    const parsed = durationToMs(value)
    return parsed !== undefined && Number.isFinite(parsed) && parsed >= 0
}, 'Expected a non-negative duration')

const DelaySchema = z
    .object({
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

// Webhook
const WebhookSchema = z.object({
    discord: z
        .object({
            enabled: z.boolean(),
            url: z.string()
        })
        .optional(),
    ntfy: z
        .object({
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
        .object({
            enabled: z.boolean().optional(),
            botToken: z.string(),
            chatId: z.string()
        })
        .optional(),
    webhookLogFilter: LogFilterSchema
})

// Config
export const ConfigSchema = z.object({
    sessionPath: z.string(),
    headless: z.boolean(),
    clusters: z.number().int().nonnegative(),
    errorDiagnostics: z.boolean(),
    ensureStreakProtection: z.boolean(),
    autoClaimPunchcardRewards: z.boolean(),
    skipNonPointTasks: z.boolean().default(true),
    accountDelay: DelaySchema.default({ min: '1min', max: '3min' }),
    workers: z.object({
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
        doVisualSearch: z.boolean().default(false)
    }),
    activities: z
        .object({
            urlReward: z.boolean().default(true),
            searchOnBing: z.boolean().default(true)
        })
        .default({ urlReward: true, searchOnBing: true }),
    searchOnBingLocalQueries: z.boolean(),
    globalTimeout: NumberOrString,
    searchSettings: z.object({
        scrollRandomResults: z.boolean(),
        clickRandomResults: z.boolean(),
        runOnZeroPoints: z.boolean().default(false),
        maxBonusSearches: z.number().default(110),
        parallelSearching: z.boolean(),
        clusterSearch: z.boolean().default(true),
        queryEngines: z.array(QueryEngineSchema),
        searchResultVisitTime: NumberOrString,
        searchDelay: DelaySchema,
        readDelay: DelaySchema
    }),
    experimental: z
        .object({
            apiSearch: z.boolean().default(false),
            apiSearchOnBing: z.boolean().default(false)
        })
        .default({ apiSearch: false, apiSearchOnBing: false }),
    debugLogs: z.boolean(),
    proxy: z.object({
        queryEngine: z.boolean()
    }),
    consoleLogFilter: LogFilterSchema,
    webhook: WebhookSchema
})

// Account
export const AccountSchema = z.object({
    email: z.string(),
    password: z.string(),
    totpSecret: z.string().optional(),
    recoveryEmail: z.string(),
    geoLocale: AccountCountrySchema,
    langCode: AccountLanguageSchema,
    proxy: z.object({
        proxyHttp: z.boolean(),
        url: z.string(),
        port: z.number(),
        password: z.string(),
        username: z.string()
    }),
    saveFingerprint: z.object({
        mobile: z.boolean(),
        desktop: z.boolean()
    })
})

const defaultConfig: Config = {
    sessionPath: 'sessions',
    headless: true,
    clusters: 1,
    errorDiagnostics: true,
    ensureStreakProtection: true,
    autoClaimPunchcardRewards: false,
    skipNonPointTasks: true,
    accountDelay: { min: '1min', max: '3min' },
    workers: {
        doDailySet: true,
        doMorePromotions: true,
        doClaimBonusPoints: true,
        doPunchCards: true,
        doAppPromotions: true,
        doDesktopSearch: true,
        doMobileSearch: true,
        doBonusSearches: false,
        doDailyCheckIn: true,
        doReadToEarn: true,
        doActivateSearchPerk: true,
        doVisualSearch: false
    },
    activities: {
        urlReward: true,
        searchOnBing: true
    },
    searchOnBingLocalQueries: false,
    globalTimeout: '30sec',
    searchSettings: {
        scrollRandomResults: true,
        clickRandomResults: true,
        runOnZeroPoints: false,
        maxBonusSearches: 110,
        parallelSearching: true,
        clusterSearch: true,
        queryEngines: ['google', 'wikipedia', 'wikirandom', 'hackernews', 'reddit', 'local'],
        searchResultVisitTime: '10sec',
        searchDelay: { min: '30sec', max: '1min' },
        readDelay: { min: '30sec', max: '1min' }
    },
    experimental: {
        apiSearch: false,
        apiSearchOnBing: false
    },
    debugLogs: false,
    proxy: { queryEngine: true },
    consoleLogFilter: {
        enabled: false,
        mode: 'whitelist',
        levels: ['info', 'warn', 'error'],
        keywords: [],
        regexPatterns: []
    },
    webhook: {
        webhookLogFilter: {
            enabled: false,
            mode: 'whitelist',
            levels: ['warn', 'error'],
            keywords: [],
            regexPatterns: []
        }
    }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function getByPath(obj: unknown, path: ReadonlyArray<string | number>): unknown {
    return path.reduce<unknown>((acc, key) => {
        if (acc == null) return undefined
        return (acc as Record<string | number, unknown>)[key]
    }, obj)
}

function setByPath<T>(obj: T, path: ReadonlyArray<string | number>, value: unknown): T {
    if (path.length === 0) return value as T
    const head = path[0]
    if (head === undefined) return value as T
    const rest = path.slice(1)
    const base = obj ?? (typeof head === 'number' ? [] : {})
    const cloned = (Array.isArray(base) ? [...base] : { ...(base as object) }) as Record<string | number, unknown>
    cloned[head] = setByPath((base as Record<string | number, unknown>)[head], rest, value)
    return cloned as T
}

function fillMissing(data: unknown, defaults: unknown, path = ''): unknown {
    if (!isPlainObject(defaults)) return data
    if (!isPlainObject(data)) {
        if (data === undefined) {
            console.warn(`[Config] "${path || '<root>'}" missing, using default`)
            return defaults
        }
        return data
    }
    const result: Record<string, unknown> = { ...data }
    for (const key of Object.keys(defaults)) {
        const p = path ? `${path}.${key}` : key
        if (!(key in result)) {
            console.warn(`[Config] "${p}" not found, using default: ${JSON.stringify(defaults[key])}`)
            result[key] = defaults[key]
        } else if (isPlainObject(defaults[key])) {
            result[key] = fillMissing(result[key], defaults[key], p)
        }
    }
    return result
}

export function validateConfig(data: unknown): Config {
    const filled = fillMissing(data, defaultConfig)
    let result = ConfigSchema.safeParse(filled)
    if (result.success) return result.data as Config

    let patched: unknown = filled
    for (const issue of result.error.issues) {
        const def = getByPath(defaultConfig, issue.path as (string | number)[])
        console.warn(
            `[Config] "${issue.path.join('.') || '<root>'}" invalid (${issue.message}), using default: ${JSON.stringify(def)}`
        )
        patched = setByPath(patched, issue.path as (string | number)[], def)
    }
    result = ConfigSchema.safeParse(patched)
    if (!result.success) {
        console.error('[Config] still invalid after applying defaults:', result.error.issues)
        throw new Error('Config validation failed')
    }
    return result.data as Config
}

export function validateAccounts(data: unknown): Account[] {
    const result = z.array(AccountSchema).safeParse(data)
    if (result.success) return result.data

    for (const issue of result.error.issues) {
        const path = issue.path.join('.') || '<root>'
        if (issue.code === 'invalid_type') {
            if (issue.input === undefined) {
                console.error(`[Accounts] "${path}" is missing (expected ${issue.expected})`)
            } else {
                console.error(
                    `[Accounts] "${path}" has wrong type: expected ${issue.expected}, got ${typeof issue.input}`
                )
            }
        } else if (issue.code === 'invalid_union') {
            console.error(`[Accounts] "${path}" does not match any allowed type: ${issue.message}`)
        } else {
            console.error(`[Accounts] "${path}" ${issue.message} (code: ${issue.code})`)
        }
    }
    throw new Error(`Accounts validation failed: ${result.error.issues.length} issue(s) - see logs above`)
}

export function checkNodeVersion(): void {
    try {
        const requiredVersion = pkg.engines?.node

        if (!requiredVersion) {
            console.warn('No Node.js version requirement found in package.json "engines" field.')
            return
        }

        if (!semver.satisfies(process.version, requiredVersion)) {
            console.error(`Current Node.js version ${process.version} does not satisfy requirement: ${requiredVersion}`)
            process.exit(1)
        }
    } catch (error) {
        console.error('Failed to validate Node.js version:', error)
        process.exit(1)
    }
}
