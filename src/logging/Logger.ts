import chalk from 'chalk'
import cluster from 'cluster'
import fs from 'fs'
import path from 'path'
import { sendDiscord } from './Discord'
import { sendNtfy } from './Ntfy'
import { sendTelegram } from './Telegram'
import type { MicrosoftRewardsBot } from '../index'
import { errorDiagnostic } from '../util/ErrorDiagnostic'
import { getProjectRoot } from '../util/Load'
import type { LogFilter } from '../interface/Config'

export type Platform = boolean | 'main'
export type LogLevel = 'info' | 'warn' | 'error' | 'debug'
export type ColorKey = keyof typeof chalk
export interface IpcLog {
    content: string
    level: LogLevel
}

type ChalkFn = (msg: string) => string

function platformText(platform: Platform): string {
    return platform === 'main' ? 'MAIN' : platform ? 'MOBILE' : 'DESKTOP'
}

function platformBadge(platform: Platform): string {
    return platform === 'main' ? chalk.bgCyan('MAIN') : platform ? chalk.bgBlue('MOBILE') : chalk.bgMagenta('DESKTOP')
}

function getColorFn(color?: ColorKey): ChalkFn | null {
    return color && typeof chalk[color] === 'function' ? (chalk[color] as ChalkFn) : null
}

function consoleOut(level: LogLevel, msg: string, chalkFn: ChalkFn | null): void {
    const out = chalkFn ? chalkFn(msg) : msg
    switch (level) {
        case 'warn':
            return console.warn(out)
        case 'error':
            return console.error(out)
        default:
            return console.log(out)
    }
}

function formatMessage(message: string | Error): string {
    if (!(message instanceof Error)) return message.replace(/\r?\n/g, '\\n')

    const stackFrames = message.stack
        ?.split(/\r?\n/)
        .slice(1)
        .map(line => line.trim())
        .filter(Boolean)
        .join(' <- ')

    return stackFrames ? `${message.message} | stack=${stackFrames}` : message.message
}

/**
 * 日志保留天数，超期的日志文件在进程首次写日志时清理
 */
const LOG_RETENTION_DAYS = 90

/**
 * 日志文件目录（首次写入时解析，避免每条日志都做磁盘检查）
 */
let logFileDir: string | null = null

function cleanOldLogFiles(logDir: string): void {
    const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
    let entries: string[]
    try {
        entries = fs.readdirSync(logDir)
    } catch {
        return
    }
    for (const name of entries) {
        const match = /^(\d{4})-(\d{2})-(\d{2})\.log$/.exec(name)
        if (!match) continue
        const fileDate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime()
        if (Number.isNaN(fileDate) || fileDate >= cutoff) continue
        try {
            fs.rmSync(path.join(logDir, name), { force: true })
        } catch {
            // 单个文件清理失败不影响运行
        }
    }
}

function getLogFilePath(now: Date): string | null {
    try {
        if (!logFileDir) {
            logFileDir = path.join(getProjectRoot(), 'logs')
            fs.mkdirSync(logFileDir, { recursive: true })
            cleanOldLogFiles(logFileDir)
        }
        const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        return path.join(logFileDir, `${date}.log`)
    } catch (error) {
        console.error('[Logger] 创建日志目录失败:', error)
        logFileDir = null
        return null
    }
}

/**
 * 将日志追加写入 logs/YYYY-MM-DD.log（按本地日期分文件）
 */
function writeLogToFile(logContent: string): void {
    try {
        const logFilePath = getLogFilePath(new Date())
        if (!logFilePath) return
        fs.appendFileSync(logFilePath, `${new Date().toISOString()} ${logContent}\n`, 'utf8')
    } catch (error) {
        console.error('[Logger] 写入日志文件失败:', error)
    }
}

export class Logger {
    constructor(private bot: MicrosoftRewardsBot) {}

    info(isMobile: Platform, title: string, message: string, color?: ColorKey) {
        return this.baseLog('info', isMobile, title, message, color)
    }

    warn(isMobile: Platform, title: string, message: string | Error, color?: ColorKey) {
        return this.baseLog('warn', isMobile, title, message, color)
    }

    error(isMobile: Platform, title: string, message: string | Error, color?: ColorKey) {
        return this.baseLog('error', isMobile, title, message, color)
    }

    debug(isMobile: Platform, title: string, message: string | Error, color?: ColorKey) {
        return this.baseLog('debug', isMobile, title, message, color)
    }

    private baseLog(
        level: LogLevel,
        isMobile: Platform,
        title: string,
        message: string | Error,
        color?: ColorKey
    ): void {
        const now = new Date().toLocaleString()
        const formatted = formatMessage(message)

        const userName = this.bot.userData.userName ? this.bot.userData.userName : 'MAIN'

        const levelTag = level.toUpperCase()
        const cleanMsg = `[${now}] [${userName}] [${levelTag}] ${platformText(isMobile)} [${title}] ${formatted}`

        const config = this.bot.config

        if (level === 'debug' && !config.debugLogs && !process.argv.includes('-dev')) {
            return
        }

        // 保存日志到本地文件
        writeLogToFile(cleanMsg)

        const badge = platformBadge(isMobile)
        const consoleStr = `[${now}] [${userName}] [${levelTag}] ${badge} [${title}] ${formatted}`

        let logColor: ColorKey | undefined = color

        if (!logColor) {
            switch (level) {
                case 'error':
                    logColor = 'red'
                    break
                case 'warn':
                    logColor = 'yellow'
                    break
                case 'debug':
                    logColor = 'magenta'
                    break
                default:
                    break
            }
        }

        if (level === 'error' && config.errorDiagnostics) {
            const page = this.bot.isMobile ? this.bot.mainMobilePage : this.bot.mainDesktopPage
            const error = message instanceof Error ? message : new Error(String(message))
            errorDiagnostic(page, error)
        }

        const consoleAllowed = this.shouldPassFilter(config.consoleLogFilter, level, cleanMsg)
        const webhookAllowed = this.shouldPassFilter(config.webhook.webhookLogFilter, level, cleanMsg)

        if (consoleAllowed) {
            consoleOut(level, consoleStr, getColorFn(logColor))
        }

        if (!webhookAllowed) {
            return
        }

        if (cluster.isPrimary) {
            if (config.webhook.discord?.enabled && config.webhook.discord.url) {
                if (level === 'debug') return
                sendDiscord(config.webhook.discord.url, cleanMsg, level)
            }

            if (config.webhook.ntfy?.enabled && config.webhook.ntfy.url) {
                if (level === 'debug') return
                sendNtfy(config.webhook.ntfy, cleanMsg, level)
            }

            if (
                config.webhook.telegram?.enabled &&
                config.webhook.telegram.botToken &&
                config.webhook.telegram.chatId
            ) {
                if (level === 'debug') return
                sendTelegram(config.webhook.telegram, cleanMsg, level)
            }
        } else {
            process.send?.({ __ipcLog: { content: cleanMsg, level } })
        }
    }

    private shouldPassFilter(filter: LogFilter | undefined, level: LogLevel, message: string): boolean {
        // If disabled or not, let all logs pass
        if (!filter || !filter.enabled) {
            return true
        }

        const { mode, levels, keywords, regexPatterns } = filter

        const hasLevelRule = Array.isArray(levels) && levels.length > 0
        const hasKeywordRule = Array.isArray(keywords) && keywords.length > 0
        const hasPatternRule = Array.isArray(regexPatterns) && regexPatterns.length > 0

        if (!hasLevelRule && !hasKeywordRule && !hasPatternRule) {
            return mode === 'blacklist'
        }

        const lowerMessage = message.toLowerCase()
        let isMatch = false

        if (hasLevelRule && levels!.includes(level)) {
            isMatch = true
        }

        if (!isMatch && hasKeywordRule) {
            if (keywords!.some(k => lowerMessage.includes(k.toLowerCase()))) {
                isMatch = true
            }
        }

        // Fancy regex filtering if set!
        if (!isMatch && hasPatternRule) {
            for (const pattern of regexPatterns!) {
                try {
                    const regex = new RegExp(pattern, 'i')
                    if (regex.test(message)) {
                        isMatch = true
                        break
                    }
                } catch {}
            }
        }

        return mode === 'whitelist' ? isMatch : !isMatch
    }
}
