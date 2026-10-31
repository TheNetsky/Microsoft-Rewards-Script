import logging from '../../scripts/lib/logging.cjs'

const log = (level, ...args) => logging.logMessage('SCHEDULE', level, ...args)
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getProjectRoot } from './lib.js'
import { readSchedule, applyCrontab } from './scheduleStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = getProjectRoot(__dirname)

try {
    const schedule = readSchedule(projectRoot)
    applyCrontab(schedule)
    if (schedule.enabled && schedule.cron) {
        log('info', `Applied ${schedule.source} schedule: "${schedule.cron}" (TZ=${schedule.timezone})`)
    } else {
        log('info', 'Scheduling disabled - cleared any previously installed crontab.')
    }
} catch (err) {
    log('error', `${err instanceof Error ? err.message : err}`)
    process.exit(1)
}
