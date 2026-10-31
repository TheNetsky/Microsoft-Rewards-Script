export function retryAfterMs(value: string | string[] | undefined, now = Date.now()): number | undefined {
    const text = Array.isArray(value) ? value[0] : value
    if (!text?.trim()) return undefined
    if (/^\d+(?:\.\d+)?$/.test(text.trim())) return Math.ceil(Number(text) * 1000)
    const date = Date.parse(text)
    return Number.isFinite(date) ? Math.max(0, date - now) : undefined
}

export class HttpError extends Error {
    readonly retryAfterMs: number | undefined

    constructor(
        readonly status: number,
        readonly response: { status: number; headers: Record<string, string | string[]> },
        message = `Request failed with status code ${status}`
    ) {
        super(message)
        this.name = 'HttpError'
        this.retryAfterMs = retryAfterMs(response.headers['retry-after'])
    }
}

export function isTerminalHttpError(error: unknown): boolean {
    const status = (error as { status?: number })?.status
    return status === 401 || status === 403 || status === 429
}
