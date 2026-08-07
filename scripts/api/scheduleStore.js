import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

// 与 rewards-dashboard/lib/cron.js 的 isValidCron 保持同步，使用相同的五字段语法。
// 由于机器人和仪表盘是两个不共享软件包的独立项目，因此在此重复实现。
const CRON_FIELD_RANGES = [
    { min: 0, max: 59 }, // 分钟
    { min: 0, max: 23 }, // 小时
    { min: 1, max: 31 }, // 每月日期
    { min: 1, max: 12 }, // 月份
    { min: 0, max: 7 } // 星期（7 表示星期日）
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

// 覆盖文件位于 compose.yaml 已配置的 ./config 绑定挂载中，
// 因此无需新增卷即可使其跨容器重启持久保留。
export function scheduleFilePath(projectRoot) {
    return process.env.SCHEDULE_FILE || path.join(projectRoot, 'config', 'schedule.json')
}

/**
 * 返回实际生效的计划：如果已通过 PUT /schedule 写入持久化覆盖，则返回该覆盖；
 * 否则返回容器启动时设置的 CRON_SCHEDULE 环境变量。
 * 这样即使机器人没有连接前端也能报告合理信息，并将其标记为 `source: 'env'`，
 * 让调用方知道在先调用 PUT 之前无法实时编辑。
 */
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

/**
 * 使用给定计划渲染 crontab 模板，并通过 `crontab <file>` 实时加载。
 * 这与 entrypoint.sh 启动时使用的机制相同，因此 cron 无需重启容器即可读取。
 * 请注意，模板没有 `user` 字段，所以只能通过 `crontab` 加载，
 * 不能由 cron.d 自身的目录自动扫描加载。
 */
export function applyCrontab({ enabled, cron }) {
    if (!enabled || !cron) {
        try {
            execFileSync('crontab', ['-r'], { stdio: 'ignore' })
        } catch {
            // 没有需要移除的内容，属于正常情况
        }
        try {
            fs.unlinkSync(CRON_FILE)
        } catch {
            // 已经不存在，属于正常情况
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
