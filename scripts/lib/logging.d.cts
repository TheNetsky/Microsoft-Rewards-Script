export const LOG_COLORS: Readonly<{
    debug: 'magenta'
    info: 'white'
    special: 'blue'
    success: 'green'
    warn: 'yellow'
    error: 'red'
}>
export type LogColor = (typeof LOG_COLORS)[keyof typeof LOG_COLORS]
export function resolveLogColor(level: string, data?: { kind: string; status?: string }, requested?: string): LogColor
export function resolveLogAccent(color: LogColor): number
export function formatLogLine(event: {
    ts: string
    user: string
    platform: string
    level: string
    title: string
    message: string
}): string
export function writeConsoleLog(level: string, line: string, color?: LogColor): void
export function sanitizeLogMessage(message: string): string
export function sanitizeLogData<T>(value: T): T
export function logMessage(prefix: string, level: string, ...args: unknown[]): void
export function exitWithUsage(
    message: string,
    printHelp: () => void,
    log: (level: string, ...args: unknown[]) => void
): never
