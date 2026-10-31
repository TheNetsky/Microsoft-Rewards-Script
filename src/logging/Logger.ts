import cluster from 'node:cluster'
import { sendNotifications } from './Notifications'
import type { BotContext } from '../core/BotContext'
import { errorDiagnostic } from '../util/ErrorDiagnostic'
import type { LogFilter } from '../config/Config'
import { emitControlEvent, type DomainEvent } from './LogEvent'
import { sanitizeLogMessage } from './LogMessage'
import { resolveLogColor, type LogColor } from './LogStyle'
import { formatLogLine, writeConsoleLog } from '../../scripts/lib/logging.cjs'
import { eventLogLevel } from './LogLevel'

type LogContext = Pick<
    BotContext,
    'config' | 'currentAccountEmail' | 'isMobile' | 'mainDesktopPage' | 'mainMobilePage' | 'userData'
>

export type Platform = boolean | 'main'
export type LogLevel = 'info' | 'warn' | 'error' | 'debug'
export interface IpcLog {
    content: string
    level: LogLevel
    color?: LogColor
}

function platformText(platform: Platform): 'MAIN' | 'MOBILE' | 'DESKTOP' {
    return platform === 'main' ? 'MAIN' : platform ? 'MOBILE' : 'DESKTOP'
}

function formatMessage(message: string | Error, debugEnabled: boolean): string {
    if (!(message instanceof Error)) return sanitizeLogMessage(message)
    if (!debugEnabled) return sanitizeLogMessage(message.message)

    const stackFrames = message.stack
        ?.split(/\r?\n/)
        .slice(1)
        .map(line => line.trim())
        .filter(Boolean)
        .join(' <- ')

    return sanitizeLogMessage(stackFrames ? `${message.message} | stack=${stackFrames}` : message.message)
}

export class Logger {
    private readonly patterns = new Map<string, RegExp>()

    constructor(private bot: LogContext) {}

    info(isMobile: Platform, title: string, message: string) {
        return this.write('info', isMobile, title, message)
    }

    success(isMobile: Platform, title: string, message: string) {
        return this.write('info', isMobile, title, message, undefined, false, 'green')
    }

    special(isMobile: Platform, title: string, message: string) {
        return this.write('info', isMobile, title, message, undefined, false, 'blue')
    }

    warn(isMobile: Platform, title: string, message: string | Error) {
        return this.write('warn', isMobile, title, message)
    }

    error(isMobile: Platform, title: string, message: string | Error) {
        return this.write('error', isMobile, title, message)
    }

    debug(isMobile: Platform, title: string, message: string | Error) {
        return this.write('debug', isMobile, title, message)
    }

    event(isMobile: Platform, title: string, message: string, data?: DomainEvent): void {
        this.write(eventLogLevel(data), isMobile, title, message, data, true)
    }

    private write(
        level: LogLevel,
        isMobile: Platform,
        title: string,
        message: string | Error,
        data?: DomainEvent,
        trackedEvent = false,
        color?: LogColor
    ): void {
        const config = this.bot.config
        const debugEnabled = config.debugLogs || process.argv.includes('-dev')

        if (level === 'debug' && !debugEnabled && !trackedEvent) return

        const now = new Date().toISOString()
        const formatted = formatMessage(message, debugEnabled)
        const userName = this.bot.currentAccountEmail || this.bot.userData.userName || 'MAIN'
        const cleanMsg = formatLogLine({
            ts: now,
            user: userName,
            level,
            platform: platformText(isMobile),
            title,
            message: formatted
        })

        if (level === 'error' && config.errorDiagnostics) {
            const mobile = isMobile === 'main' ? this.bot.isMobile : isMobile
            const page = mobile ? this.bot.mainMobilePage : this.bot.mainDesktopPage
            const error = message instanceof Error ? message : new Error(String(message))
            if (page && !page.isClosed()) errorDiagnostic(page, error)
        }

        const consoleAllowed =
            (level !== 'debug' || debugEnabled) && this.passesFilter(config.consoleLogFilter, level, cleanMsg)
        const webhookAllowed = this.passesFilter(config.webhook.webhookLogFilter, level, cleanMsg)
        const logColor = resolveLogColor(level, data, color)

        const machineChannel = emitControlEvent({
            ts: now,
            user: userName,
            platform: platformText(isMobile),
            level,
            title,
            message: formatted,
            consoleAllowed,
            color: logColor,
            data
        })
        if (consoleAllowed && !machineChannel) {
            writeConsoleLog(level, cleanMsg, logColor)
        }

        if (!webhookAllowed || level === 'debug') return

        const hasWebhook = Boolean(
            (config.webhook.discord?.enabled && config.webhook.discord.url) ||
            (config.webhook.ntfy?.enabled && config.webhook.ntfy.url) ||
            (config.webhook.telegram?.enabled && config.webhook.telegram.botToken && config.webhook.telegram.chatId)
        )
        if (!hasWebhook) return

        if (cluster.isPrimary) {
            void sendNotifications(config.webhook, cleanMsg, level, logColor)
        } else {
            process.send?.({ __ipcLog: { content: cleanMsg, level, color: logColor } })
        }
    }

    private passesFilter(filter: LogFilter | undefined, level: LogLevel, message: string): boolean {
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

        if (!isMatch && hasPatternRule) {
            for (const pattern of regexPatterns!) {
                try {
                    const regex = this.patterns.get(pattern) ?? new RegExp(pattern, 'i')
                    this.patterns.set(pattern, regex)
                    if (regex.test(message)) {
                        isMatch = true
                        break
                    }
                } catch {
                    // Ignore
                }
            }
        }

        return mode === 'whitelist' ? isMatch : !isMatch
    }
}
