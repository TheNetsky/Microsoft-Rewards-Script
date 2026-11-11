import projectFiles from '../../scripts/lib/projectFiles.cjs'
import fs from 'node:fs'
import logging from '../../scripts/lib/logging.cjs'

export const { getProjectRoot, loadEnvFile } = projectFiles
export const { exitWithUsage } = logging

export { envBool, envStr } from '../../scripts/lib/env.js'
export { parseArgs, findUnknownOptions } from '../../scripts/lib/args.js'

export function log(level, ...args) {
    logging.logMessage('api', level, ...args)
}

export function loadConfigSafe(projectRoot) {
    const file = projectFiles.resolveProjectFile('config.json', projectRoot)
    if (!file) return null
    try {
        return { data: JSON.parse(fs.readFileSync(file, 'utf8')), path: file }
    } catch (error) {
        return { data: null, path: file, error: error instanceof Error ? error.message : String(error) }
    }
}

export function redactSecrets(config) {
    if (!config || typeof config !== 'object') return config
    const clone = structuredClone(config)
    const mask = '***REDACTED***'
    const wh = clone.webhook
    if (wh && typeof wh === 'object') {
        if (wh.feishu?.url) wh.feishu.url = mask
        if (wh.feishu?.signingSecret) wh.feishu.signingSecret = mask
        if (wh.discord?.url) wh.discord.url = mask
        if (wh.ntfy?.url) wh.ntfy.url = mask
        if (wh.ntfy?.token) wh.ntfy.token = mask
        if (wh.telegram?.botToken) wh.telegram.botToken = mask
        if (wh.telegram?.chatId) wh.telegram.chatId = mask
    }
    return clone
}
