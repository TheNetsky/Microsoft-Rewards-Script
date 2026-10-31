import { envStrFrom } from '../../scripts/lib/env.js'
import fs from 'node:fs'
import path from 'node:path'

function parseRunArgs(value) {
    if (!value) return []
    const trimmed = String(value).trim()
    if (trimmed.startsWith('[')) {
        try {
            const args = JSON.parse(trimmed)
            if (Array.isArray(args)) return args.map(String)
        } catch {
            // Ignore
        }
    }
    return trimmed.split(/\s+/).filter(Boolean)
}

export function resolveRunCommand({ projectRoot }) {
    const sourceEnv = process.env
    const execPath = process.execPath
    const commandOverride = envStrFrom(sourceEnv, 'API_RUN_COMMAND')
    if (commandOverride) {
        const overrideArgs = parseRunArgs(envStrFrom(sourceEnv, 'API_RUN_ARGS'))
        if (/(?:^|[\\/])npm\.cmd$/i.test(commandOverride)) {
            const npmCliCandidates = [
                envStrFrom(sourceEnv, 'npm_execpath'),
                path.join(path.dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
            ].filter(candidate => typeof candidate === 'string')
            const npmCli = npmCliCandidates.find(candidate => fs.existsSync(candidate))
            if (!npmCli) {
                throw new Error(
                    'API_RUN_COMMAND points to npm.cmd, but npm-cli.js could not be found. ' +
                        'Remove the override to use the automatic launcher.'
                )
            }
            return { command: execPath, args: [npmCli, ...overrideArgs] }
        }
        if (/\.(?:cmd|bat)$/i.test(commandOverride)) {
            throw new Error(
                'API_RUN_COMMAND cannot be a .cmd or .bat file. Use a native executable or JavaScript entry point.'
            )
        }
        return {
            command: commandOverride,
            args: overrideArgs
        }
    }

    const distEntry = path.join(projectRoot, 'dist', 'index.js')
    if (fs.existsSync(distEntry)) return { command: execPath, args: [distEntry] }

    const tsNodeCli = path.join(projectRoot, 'node_modules', 'ts-node', 'dist', 'bin.js')
    const sourceEntry = path.join(projectRoot, 'src', 'index.ts')
    return { command: execPath, args: [tsNodeCli, sourceEntry] }
}

export function resolveSessionCommand({ projectRoot }) {
    const entry = path.join(projectRoot, 'dist', 'session', 'RegenerateSessions.js')
    return fs.existsSync(entry) ? { command: process.execPath, args: [entry] } : null
}
