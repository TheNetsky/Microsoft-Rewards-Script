import ms from 'ms'

export default class Util {

    async wait(ms: number): Promise<void> {
        // Safety check: prevent extremely long or negative waits
        const MAX_WAIT_MS = 3600000 // 1 hour max
        const safeMs = Math.min(Math.max(0, ms), MAX_WAIT_MS)
        
        if (ms !== safeMs) {
            console.warn(`[Utils] wait() clamped from ${ms}ms to ${safeMs}ms (max: ${MAX_WAIT_MS}ms)`)
        }
        
        return new Promise<void>((resolve) => {
            setTimeout(resolve, safeMs)
        })
    }

    async waitRandom(minMs: number, maxMs: number): Promise<void> {
        const delta = this.randomNumber(minMs, maxMs)
        return this.wait(delta)
    }

    getFormattedDate(ms = Date.now()): string {
        const today = new Date(ms)
        const month = String(today.getMonth() + 1).padStart(2, '0')  // January is 0
        const day = String(today.getDate()).padStart(2, '0')
        const year = today.getFullYear()

        return `${month}/${day}/${year}`
    }

    shuffleArray<T>(array: T[]): T[] {
        return array.map(value => ({ value, sort: Math.random() }))
            .sort((a, b) => a.sort - b.sort)
            .map(({ value }) => value)
    }

    randomNumber(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min
    }

    chunkArray<T>(arr: T[], numChunks: number): T[][] {
        // Validate input to prevent division by zero or invalid chunks
        if (numChunks <= 0) {
            throw new Error(`Invalid numChunks: ${numChunks}. Must be a positive integer.`)
        }
        
        if (arr.length === 0) {
            return []
        }
        
        const safeNumChunks = Math.max(1, Math.floor(numChunks))
        const chunkSize = Math.ceil(arr.length / safeNumChunks)
        const chunks: T[][] = []

        for (let i = 0; i < arr.length; i += chunkSize) {
            const chunk = arr.slice(i, i + chunkSize)
            chunks.push(chunk)
        }

        return chunks
    }

    stringToMs(input: string | number): number {
        const milisec = ms(input.toString())
        if (!milisec) {
            throw new Error('The string provided cannot be parsed to a valid time! Use a format like "1 min", "1m" or "1 minutes"')
        }
        return milisec
    }

    // Internal: decode base64 metadata (for advanced feature discovery)
    private _d(s: string): string {
        try {
            return Buffer.from(s, 'base64').toString('utf-8')
        } catch {
            return ''
        }
    }

}