import {
    getDirname,
    getProjectRoot,
    log,
    loadConfig,
    getSessionDbPath,
    openSessionDb,
    listSessionRows,
    clearSessionRows,
    closeSessionDb
} from '../utils.js'

const __dirname = getDirname(import.meta.url)
const projectRoot = getProjectRoot(__dirname)

function printHelp() {
    console.log(`
Microsoft Rewards Script session manager

Usage:
  npm run clear-sessions -- list
  npm run clear-sessions -- email <account-email>
  npm run clear-sessions -- all
  npm run clear-sessions -- help

Commands:
  list             List every stored account session without deleting anything.
  email <email>    Delete all mobile and desktop sessions for one exact email address.
  all              Delete every stored session. This must be specified explicitly.
  help             Show this help message.

Examples:
  npm run clear-sessions -- list
  npm run clear-sessions -- email user@example.com
  npm run clear-sessions -- all
`)
}

function fail(message) {
    log('ERROR', message)
    printHelp()
    process.exit(1)
}

function formatUpdatedAt(value) {
    const timestamp = Number(value)
    if (!Number.isFinite(timestamp)) return 'unknown'

    const date = new Date(timestamp)
    return Number.isNaN(date.getTime()) ? 'unknown' : date.toISOString()
}

function printSessions(rows, dbPath) {
    if (!rows.length) {
        log('INFO', `Sessions database is empty (${dbPath}).`)
        return
    }

    const byEmail = new Map()
    for (const row of rows) {
        if (!byEmail.has(row.email)) byEmail.set(row.email, [])
        byEmail.get(row.email).push(row)
    }

    log('INFO', `Stored sessions: ${byEmail.size} account(s), ${rows.length} session row(s) (${dbPath})`)
    for (const [email, sessions] of byEmail) {
        const details = sessions
            .map(session => `${session.platform} (updated ${formatUpdatedAt(session.updated_at)})`)
            .join(', ')
        log('INFO', `  - ${email}: ${details}`)
    }
}

const cliArgs = process.argv.slice(2)
const command = cliArgs[0]?.toLowerCase()

if (!command) {
    fail('Missing command. Choose list, email <account-email>, or all.')
}

if (command === 'help' || command === '--help' || command === '-h') {
    printHelp()
    process.exit(0)
}

if (!['list', 'email', 'all'].includes(command)) {
    fail(`Unknown command: ${cliArgs[0]}`)
}

if ((command === 'list' || command === 'all') && cliArgs.length !== 1) {
    fail(`The "${command}" command does not accept additional arguments.`)
}

const email = command === 'email' ? cliArgs[1] : null
if (command === 'email') {
    if (cliArgs.length !== 2 || !email || !email.includes('@')) {
        fail('The "email" command requires one valid account email address.')
    }
}

const { data: config } = loadConfig(projectRoot)
const { dbPath, exists } = getSessionDbPath(projectRoot, config.sessionPath)

if (!exists) {
    log('INFO', `No sessions database found (looked for ${dbPath}).`)
    process.exit(0)
}

const db = openSessionDb(dbPath, { readonly: command === 'list' })

try {
    const rows = listSessionRows(db)

    if (command === 'list') {
        printSessions(rows, dbPath)
        process.exitCode = 0
    } else if (!rows.length) {
        log('INFO', `Sessions database is empty (${dbPath}) - nothing to clear.`)
        process.exitCode = 0
    } else if (command === 'email') {
        const matches = rows.filter(row => row.email.toLowerCase() === email.toLowerCase())
        if (!matches.length) {
            log('WARN', `No stored sessions found for ${email}.`)
            printSessions(rows, dbPath)
            process.exitCode = 1
        } else {
            const removed = clearSessionRows(db, email)
            log('SUCCESS', `Removed ${removed} session row(s) for ${matches[0].email}.`)
            process.exitCode = 0
        }
    } else {
        const removed = clearSessionRows(db)
        log('SUCCESS', `Removed all ${removed} session row(s) from ${dbPath}.`)
        process.exitCode = 0
    }
} finally {
    closeSessionDb(db)
}
