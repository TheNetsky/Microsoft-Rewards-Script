// Persisted override, stored inside the already-mounted ./config volume,
// so no new compose mount is required.
const SCHEDULE_FILE = envStr('SCHEDULE_FILE') ?? path.join(projectRoot, 'config', 'schedule.json')

function readSchedule() {
    if (fs.existsSync(SCHEDULE_FILE)) {
        return JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8')) // source: 'override'
    }
    // Fall back to the env-configured default so nothing breaks for
    // no-frontend users who only ever set CRON_SCHEDULE.
    return {
        enabled: Boolean(process.env.CRON_SCHEDULE),
        cron: process.env.CRON_SCHEDULE || null,
        skipIfRunning: true,
        excludedAccountIndexes: [],
        source: 'env'
    }
}

function writeSchedule(next) {
    writeConfigAtomic(SCHEDULE_FILE, next) // reuse the atomic-write helper already in configEditor.js
    applyCrontab(next) // regenerate /etc/cron.d file + `crontab` it live
}

function applyCrontab({ enabled, cron }) {
    if (!enabled || !cron) return execSync('crontab -r', { stdio: 'ignore' }) // no-op if none exists
    const template = fs.readFileSync('/etc/cron.d/microsoft-rewards-cron.template', 'utf8')
    const rendered = template.replace('${CRON_SCHEDULE}', cron).replace('${TZ}', process.env.TZ || 'UTC')
    fs.writeFileSync('/etc/cron.d/microsoft-rewards-cron', rendered, { mode: 0o644 })
    execSync('crontab /etc/cron.d/microsoft-rewards-cron')
}
