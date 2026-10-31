import ms, { StringValue } from 'ms'

export function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isBrowserClosedError(error: unknown): boolean {
    const msg = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase()
    if (!msg) return false
    return (
        msg.includes('has been closed') ||
        msg.includes('target closed') ||
        msg.includes('target page, context or browser') ||
        msg.includes('browser has disconnected') ||
        msg.includes('browser closed') ||
        msg.includes('connection closed') ||
        msg.includes('session closed') ||
        msg.includes('page closed') ||
        msg.includes('websocket connection closed')
    )
}

export default class Utils {
    constructor(private readonly getSignal: () => AbortSignal | undefined = () => undefined) {}

    async wait(time: number | string, signal = this.getSignal()): Promise<void> {
        if (typeof time === 'string') {
            time = this.parseDuration(time)
        }

        signal?.throwIfAborted()
        return new Promise<void>((resolve, reject) => {
            const cancel = (): void => {
                clearTimeout(timer)
                reject(signal?.reason ?? new Error('Run cancelled'))
            }
            const timer = setTimeout(() => {
                signal?.removeEventListener('abort', cancel)
                resolve()
            }, time)
            signal?.addEventListener('abort', cancel, { once: true })
        })
    }

    formatDate(timestamp: number, browserTimeZone: string): string {
        if (!browserTimeZone) {
            throw new Error('Browser timezone has not been captured')
        }

        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: browserTimeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(timestamp)
        const month = parts.find(part => part.type === 'month')?.value ?? '01'
        const day = parts.find(part => part.type === 'day')?.value ?? '01'
        const year = parts.find(part => part.type === 'year')?.value ?? '1970'

        return `${month}/${day}/${year}`
    }

    shuffleArray<T>(array: T[]): T[] {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))

            const a = array[i]
            const b = array[j]

            if (a === undefined || b === undefined) continue

            array[i] = b
            array[j] = a
        }

        return array
    }

    randomNumber(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min
    }

    chunkArray<T>(arr: T[], numChunks: number): T[][] {
        const chunkSize = Math.ceil(arr.length / numChunks)
        const chunks: T[][] = []

        for (let i = 0; i < arr.length; i += chunkSize) {
            const chunk = arr.slice(i, i + chunkSize)
            chunks.push(chunk)
        }

        return chunks
    }

    parseDuration(input: string | number): number {
        if (typeof input === 'number') {
            return input
        }
        const value = input.trim()

        const milliseconds = ms(value as StringValue)

        if (milliseconds === undefined) {
            throw new Error(
                `The input provided (${input}) cannot be parsed to a valid time! Use a format like "1 min", "1m" or "1 minutes"`
            )
        }

        return milliseconds
    }

    normalizeTitle(title: string): string {
        return title
            .normalize('NFKC')
            .replace(/\p{Cf}/gu, '')
            .trim()
            .toLowerCase()
            .replace(/[?!]/g, '')
            .replace(/\s+/gu, ' ')
    }

    randomDelay(min: string | number, max: string | number): number {
        const minMs = typeof min === 'number' ? min : this.parseDuration(min)
        const maxMs = typeof max === 'number' ? max : this.parseDuration(max)
        return this.randomNumber(minMs, maxMs)
    }

    serverActionAcknowledged(response: unknown): boolean {
        const text = typeof response === 'string' ? response : String(response ?? '')
        return /^\d+:true\s*$/m.test(text)
    }
}
