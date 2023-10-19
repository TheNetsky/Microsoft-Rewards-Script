export async function wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, ms)
    })
}

export function getFormattedDate(ms = Date.now()): string {
    const today = new Date(ms)
    const month = String(today.getMonth() + 1).padStart(2, '0')  // January is 0
    const day = String(today.getDate()).padStart(2, '0')
    const year = today.getFullYear()

    return `${month}/${day}/${year}`
}

export function shuffleArray<T>(array: T[]): T[] {
    const shuffledArray = array.slice()

    shuffledArray.sort(() => Math.random() - 0.5)

    return shuffledArray
}

export function randomNumber(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

export function chunkArray<T>(arr: T[], numChunks: number): T[][] {
    const chunkSize = Math.ceil(arr.length / numChunks)
    const chunks: T[][] = []

    for (let i = 0; i < arr.length; i += chunkSize) {
        const chunk = arr.slice(i, i + chunkSize)
        chunks.push(chunk)
    }

    return chunks
}