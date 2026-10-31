import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Page } from 'patchright'
import { getCurrentContext } from '../core/ExecutionContext'
import { logSystemMessage } from '../logging/LogEvent'

const pending = new Set<Promise<string | null>>()
const lastCapture = new WeakMap<Page, number>()
const root = path.join(process.cwd(), 'diagnostics')
const MAX_CAPTURES = 50

async function prune(): Promise<void> {
    const entries = (await fs.readdir(root, { withFileTypes: true }))
        .filter(entry => entry.isDirectory() && entry.name.startsWith('error-'))
        .sort((a, b) => b.name.localeCompare(a.name))
    let bytes = 0
    for (const [index, entry] of entries.entries()) {
        const dir = path.join(root, entry.name)
        const stat = await fs.stat(dir).catch(() => null)
        if (!stat) continue
        for (const file of await fs.readdir(dir).catch(() => [])) {
            bytes += (await fs.stat(path.join(dir, file)).catch(() => null))?.size ?? 0
        }
        if (index >= MAX_CAPTURES || Date.now() - stat.mtimeMs > 7 * 86400000 || bytes > 200 * 1024 * 1024) {
            await fs.rm(dir, { recursive: true, force: true })
        }
    }
}

async function capture(page: Page, error: Error, category: string, platform?: string): Promise<string | null> {
    if (!page || page.isClosed() || pending.size >= 2 || Date.now() - (lastCapture.get(page) ?? 0) < 5000) return null
    lastCapture.set(page, Date.now())
    const job = (async (): Promise<string | null> => {
        try {
            const capturedAt = new Date().toISOString()
            const id = `error-${capturedAt.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
            const dir = path.join(root, id)
            const context = getCurrentContext()
            const url = new URL(page.url())
            url.search = ''
            url.hash = ''
            const metadata = {
                version: 1,
                id,
                category,
                capturedAt,
                url: url.toString(),
                runId: process.env.REWARDS_RUN_ID ?? null,
                account: context?.account.email ? '<redacted>' : null,
                platform: platform ?? (context?.isMobile ? 'mobile' : 'desktop')
            }
            await fs.mkdir(dir, { recursive: true, mode: 0o700 })
            const authenticationPage =
                category === 'unknown-login-page' ||
                /(^|\.)(live\.com|microsoftonline\.com|account\.microsoft\.com)$/.test(url.hostname)
            const results = await Promise.allSettled([
                (authenticationPage
                    ? Promise.resolve('<!doctype html><p>Authentication page content omitted.</p>')
                    : page.evaluate(() => {
                          const clone = document.documentElement.cloneNode(true) as HTMLElement
                          clone
                              .querySelectorAll('script, style, input, textarea, iframe, object, embed')
                              .forEach(node => node.remove())
                          for (const element of clone.querySelectorAll('*'))
                              for (const attribute of [...element.attributes]) {
                                  if (
                                      /^(?:value|nonce|data-|on)/i.test(attribute.name) ||
                                      /token|secret|credential|authorization|password/i.test(attribute.name)
                                  )
                                      element.removeAttribute(attribute.name)
                                  else if (['href', 'src', 'action'].includes(attribute.name)) {
                                      try {
                                          const link = new URL(attribute.value, location.href)
                                          link.search = ''
                                          link.hash = ''
                                          element.setAttribute(attribute.name, link.toString())
                                      } catch {
                                          element.removeAttribute(attribute.name)
                                      }
                                  }
                              }
                          return (
                              '<!doctype html>' +
                              clone.outerHTML.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '&lt;email&gt;')
                          )
                      })
                ).then(html => fs.writeFile(path.join(dir, 'dump.html'), html, { mode: 0o600 })),
                (authenticationPage
                    ? Promise.resolve(null)
                    : page.screenshot({
                          fullPage: true,
                          type: 'png',
                          timeout: 10000,
                          mask: [
                              page.locator('input, textarea, [contenteditable], [data-testid="identityBanner"], #id_n')
                          ]
                      })
                ).then(png => (png ? fs.writeFile(path.join(dir, 'screenshot.png'), png, { mode: 0o600 }) : undefined))
            ])
            await fs.writeFile(
                path.join(dir, 'metadata.json'),
                JSON.stringify(
                    {
                        ...metadata,
                        htmlCaptured: results[0].status === 'fulfilled',
                        screenshotCaptured: !authenticationPage && results[1].status === 'fulfilled',
                        authenticationContentOmitted: authenticationPage
                    },
                    null,
                    2
                ),
                { mode: 0o600 }
            )
            await fs.writeFile(
                path.join(dir, 'error.txt'),
                (error.stack ?? error.message)
                    .replace(/https?:\/\/[^\s]+/g, '<url>')
                    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '<email>'),
                { mode: 0o600 }
            )
            await prune()
            return dir
        } catch {
            logSystemMessage('warn', 'DIAGNOSTICS', 'Capture unavailable; continuing without diagnostics.')
            return null
        }
    })()
    pending.add(job)
    try {
        return await job
    } finally {
        pending.delete(job)
    }
}

export async function errorDiagnostic(page: Page, error: Error): Promise<void> {
    await capture(page, error, 'error')
}

export function unknownPageDiagnostic(
    page: Page,
    { platform }: { platform: 'mobile' | 'desktop' }
): Promise<string | null> {
    return capture(page, new Error('Unknown login page'), 'unknown-login-page', platform)
}

export async function flushDiagnostics(timeoutMs = 3000): Promise<void> {
    let timer: NodeJS.Timeout | undefined
    try {
        await Promise.race([
            Promise.allSettled([...pending]),
            new Promise<void>(resolve => {
                timer = setTimeout(resolve, timeoutMs)
            })
        ])
    } finally {
        if (timer) clearTimeout(timer)
    }
}
