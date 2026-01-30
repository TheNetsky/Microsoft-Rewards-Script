import type { Page } from 'patchright'
import readline from 'readline'

export interface PromptOptions {
    question: string
    timeoutSeconds?: number
    validate?: (input: string) => boolean
    transform?: (input: string) => string
}

export function promptInput(options: PromptOptions): Promise<string | null> {
    const { question, timeoutSeconds = 60, validate, transform } = options

    return new Promise(resolve => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        })

        let resolved = false

        const cleanup = (result: string | null) => {
            if (resolved) return
            resolved = true
            clearTimeout(timer)
            rl.close()
            resolve(result)
        }

        const timer = setTimeout(() => cleanup(null), timeoutSeconds * 1000)

        rl.question(question, answer => {
            let value = answer.trim()
            if (transform) value = transform(value)

            if (validate && !validate(value)) {
                cleanup(null)
                return
            }

            cleanup(value)
        })
    })
}

export async function getSubtitleMessage(page: Page): Promise<string | null> {
    const message = await page
        .waitForSelector('[data-testid="subtitle"], div#oneTimeCodeDescription', { state: 'visible', timeout: 1000 })
        .catch(() => null)

    if (!message) return null

    const text = await message.innerText()
    return text.trim()
}

export async function getErrorMessage(page: Page): Promise<string | null> {
    const errorAlert = await page
        .waitForSelector('div[role="alert"]', { state: 'visible', timeout: 1000 })
        .catch(() => null)

    if (!errorAlert) return null

    const text = await errorAlert.innerText()
    return text.trim()
}
