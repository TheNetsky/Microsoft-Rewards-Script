export async function wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, ms)
    })
}

export function getFormattedDate(ms = Date.now()) {
    const today = new Date(ms)
    const month = String(today.getMonth() + 1).padStart(2, '0')  // January is 0
    const day = String(today.getDate()).padStart(2, '0')
    const year = today.getFullYear()

    return `${month}/${day}/${year}`
}

export function shuffleArray(array: string[]): string[] {
    const shuffledArray = array.slice()

    shuffledArray.sort(() => Math.random() - 0.5)

    return shuffledArray
}