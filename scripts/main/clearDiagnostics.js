import fs from 'node:fs'
import { log } from '../lib/commandUtils.js'

const args = process.argv.slice(2)
if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log(
        'npm run clear-diagnostics - delete the diagnostics directory in the current project. Saved sessions and config are kept.'
    )
} else if (args.length) {
    log('ERROR', 'clear-diagnostics does not accept arguments; use --help for usage.')
    process.exitCode = 1
} else {
    try {
        fs.rmSync('diagnostics', { recursive: true, force: true })
        log('SUCCESS', 'Diagnostics cleared')
    } catch (error) {
        log('ERROR', `Could not clear diagnostics: ${error.message}`)
        process.exitCode = 1
    }
}
