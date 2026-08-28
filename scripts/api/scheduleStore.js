import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const CRON_FIELD_RANGES = [
    { min: 0, max: 59 }, // minute
    { min: 0, max: 23 }, // hour
    { min: 1, max: 31 }, // day of month
    { min: 1, max: 12 }, // month
    { min: 0, max: 7 } // day of week (7 == Sunday)
]

function validateField(expr, { min, max }) {
    if (expr === '*') return true
    for (const part of expr.split(',')) {
        if (!/^(?:\*|\d+|\d+-\d+)(?:\/\d+)?$/.test(part)) return false

        const stepSplit = part.split('/')
        if (stepSplit.length > 2) return false

        const step = stepSplit.length === 2 ? Number(stepSplit[1]) : 1
        if (!Number.isInteger(step) || step < 1) return false

        const range = stepSplit[0]
        let lo
        let hi
        if (range === '*') {
            lo = min
            hi = max
        } else if (range.includes('-')) {
            const [a, b] = range.split('-')
            lo = Number(a)
            hi = Number(b)
        } else {
            lo = Number(range)
            hi = Number(range)
        }
        if (!Number.isInteger(lo) || !Number.isInteger(hi)) return false
        if (lo < min || hi > max || lo > hi) return false
    }
    return true
}

export function isValidCron(expr) {
    if (typeof expr !== 'string') return false
    const parts = expr.trim().split(/\s+/)
    if (parts.length !== 5) return false
    return parts.every((part, i) => validateField(part, CRON_FIELD_RANGES[i]))
}

export function scheduleFilePath(projectRoot) {
    return process.env.SCHEDULE_FILE || path.join(projectRoot, 'config', 'schedule.json')
}

export function readSchedule(projectRoot) {
    const file = scheduleFilePath(projectRoot)
    if (fs.existsSync(file)) {
        let saved
        try {
            saved = JSON.parse(fs.readFileSync(file, 'utf8'))
        } catch (err) {
            throw Object.assign(new Error(`schedule.json is corrupt: ${err.message}`), { code: 'CORRUPT_SCHEDULE' })
        }
        const enabled = saved.enabled === undefined ? false : saved.enabled
        const cron = saved.cron == null ? null : saved.cron
        const skipIfRunning = saved.skipIfRunning === undefined ? true : saved.skipIfRunning
        const excludedAccountIndexes = saved.excludedAccountIndexes ?? []

        if (typeof enabled !== 'boolean') {
            throw Object.assign(new Error('schedule.json has a non-boolean `enabled` value.'), {
                code: 'CORRUPT_SCHEDULE'
            })
        }
        if (cron !== null && (typeof cron !== 'string' || !isValidCron(cron))) {
            throw Object.assign(new Error('schedule.json has an invalid `cron` expression.'), {
                code: 'CORRUPT_SCHEDULE'
            })
        }
        if (typeof skipIfRunning !== 'boolean') {
            throw Object.assign(new Error('schedule.json has a non-boolean `skipIfRunning` value.'), {
                code: 'CORRUPT_SCHEDULE'
            })
        }
        if (
            !Array.isArray(excludedAccountIndexes) ||
            excludedAccountIndexes.some(index => !Number.isSafeInteger(index) || index < 1)
        ) {
            throw Object.assign(new Error('schedule.json has invalid `excludedAccountIndexes`.'), {
                code: 'CORRUPT_SCHEDULE'
            })
        }
        if (enabled && !cron) {
            throw Object.assign(new Error('schedule.json enables scheduling without a cron expression.'), {
                code: 'CORRUPT_SCHEDULE'
            })
        }

        return {
            enabled,
            cron: cron?.trim() ?? null,
            skipIfRunning,
            excludedAccountIndexes: [...new Set(excludedAccountIndexes)].sort((a, b) => a - b),
            updatedAt: saved.updatedAt || null,
            timezone: process.env.TZ || 'UTC',
            source: 'override'
        }
    }
    return {
        enabled: Boolean(process.env.CRON_SCHEDULE),
        cron: process.env.CRON_SCHEDULE || null,
        skipIfRunning: true,
        excludedAccountIndexes: [],
        updatedAt: null,
        timezone: process.env.TZ || 'UTC',
        source: 'env'
    }
}

export function writeSchedule(projectRoot, patch) {
    const current = readSchedule(projectRoot)
    const next = { ...current }

    if ('cron' in patch) {
        if (typeof patch.cron !== 'string' || !isValidCron(patch.cron)) {
            throw Object.assign(new Error('Invalid cron expression (5 fields, e.g. "0 9 * * *").'), {
                code: 'BAD_REQUEST'
            })
        }
        next.cron = patch.cron.trim()
    }
    if ('enabled' in patch) {
        if (typeof patch.enabled !== 'boolean') {
            throw Object.assign(new Error('enabled must be a boolean.'), { code: 'BAD_REQUEST' })
        }
        next.enabled = patch.enabled
    }
    if ('skipIfRunning' in patch) {
        if (typeof patch.skipIfRunning !== 'boolean') {
            throw Object.assign(new Error('skipIfRunning must be a boolean.'), { code: 'BAD_REQUEST' })
        }
        next.skipIfRunning = patch.skipIfRunning
    }
    if ('excludedAccountIndexes' in patch) {
        if (!Array.isArray(patch.excludedAccountIndexes)) {
            throw Object.assign(new Error('excludedAccountIndexes must be an array.'), { code: 'BAD_REQUEST' })
        }
        const indexes = [...new Set(patch.excludedAccountIndexes.map(Number))]
        if (indexes.some(i => !Number.isSafeInteger(i) || i < 1)) {
            throw Object.assign(new Error('excludedAccountIndexes must contain only positive integers.'), {
                code: 'BAD_REQUEST'
            })
        }
        next.excludedAccountIndexes = indexes.sort((a, b) => a - b)
    }
    if (next.enabled && !next.cron) {
        throw Object.assign(new Error('Cannot enable the schedule without a cron expression.'), { code: 'BAD_REQUEST' })
    }

    next.updatedAt = new Date().toISOString()
    next.timezone = process.env.TZ || 'UTC'
    delete next.source

    const file = scheduleFilePath(projectRoot)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2))
    fs.renameSync(tmp, file)

    applyCrontab(next)

    return { ...next, source: 'override' }
}

const CRON_FILE = '/etc/cron.d/microsoft-rewards-cron'
const CRON_TEMPLATE = '/etc/cron.d/microsoft-rewards-cron.template'

export function applyCrontab({ enabled, cron }) {
    if (!enabled || !cron) {
        try {
            execFileSync('crontab', ['-r'], { stdio: 'ignore' })
        } catch {
            // nothing to remove - fine
        }
        try {
            fs.unlinkSync(CRON_FILE)
        } catch {
            // already gone - fine
        }
        return
    }

    if (!fs.existsSync(CRON_TEMPLATE)) {
        throw Object.assign(new Error(`Cron template not found at ${CRON_TEMPLATE} - image may be corrupt.`), {
            code: 'TEMPLATE_MISSING'
        })
    }

    const tz = process.env.TZ || 'UTC'
    const rendered = fs
        .readFileSync(CRON_TEMPLATE, 'utf8')
        .replace(/\$\{CRON_SCHEDULE\}/g, cron)
        .replace(/\$\{TZ\}/g, tz)

    fs.writeFileSync(CRON_FILE, rendered, { mode: 0o644 })
    execFileSync('crontab', [CRON_FILE])
}
