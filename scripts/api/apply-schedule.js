import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getProjectRoot } from './lib.js'
import { readSchedule, applyCrontab } from './scheduleStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = getProjectRoot(__dirname)

try {
    const schedule = readSchedule(projectRoot)
    if (schedule.enabled && schedule.cron) {
        applyCrontab(schedule)
        console.log(`[apply-schedule] Applied schedule.json override: "${schedule.cron}" (TZ=${schedule.timezone})`)
    } else {
        console.log('[apply-schedule] schedule.json override present but disabled - no crontab installed.')
    }
} catch (err) {
    console.error(`[apply-schedule] ERROR: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
}
