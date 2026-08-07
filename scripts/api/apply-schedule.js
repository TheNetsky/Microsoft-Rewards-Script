/**
 * 容器启动时，将持久化的 config/schedule.json 覆盖配置应用到当前 crontab。
 * 当 API_MODE=true 时由 entrypoint.sh 调用，但仅在 schedule.json 存在时执行
 *（即仪表板至少保存过一次远程计划）。始终只使用 CRON_SCHEDULE 的机器人
 * 不会访问此文件，而是继续使用 entrypoint.sh 中现有的 envsubst 流程。
 */

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
