import type { Page } from 'patchright'
import readline from 'node:readline'

export interface PromptOptions {
    question: string
    timeoutSeconds?: number
    validate?: (input: string) => boolean
    transform?: (input: string) => string
}

export function canPromptForInput(): boolean {
    return process.stdin.isTTY === true
}

export function promptInput(options: PromptOptions): Promise<string | null> {
    if (!canPromptForInput()) return Promise.resolve(null)

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
        .waitForSelector('[data-testid="subtitle"], div#oneTimeCodeDescription, [data-testid="description"]', {
            state: 'visible',
            timeout: 1000
        })
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

export async function waitForInputResponse(page: Page, selector: string, timeout: number): Promise<void> {
    await page.waitForFunction(
        inputSelector => {
            const visible = (element: Element) => {
                const style = getComputedStyle(element)
                return style.visibility !== 'hidden' && style.display !== 'none' && element.getClientRects().length > 0
            }
            const inputVisible = [...document.querySelectorAll(inputSelector)].some(visible)
            const errorVisible = [...document.querySelectorAll('div[role="alert"]')].some(
                element => visible(element) && Boolean(element.textContent?.trim())
            )
            return !inputVisible || errorVisible
        },
        selector,
        { timeout }
    )
}
