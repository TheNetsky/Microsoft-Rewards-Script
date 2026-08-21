import fs from 'fs/promises'
import path from 'path'
import { createHash } from 'crypto'
import type { Page } from 'patchright'

interface UnknownPageDiagnosticOptions {
    platform: 'mobile' | 'desktop'
}

function safePathSegment(value: string, fallback: string): string {
    const sanitized = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80)

    return sanitized || fallback
}

function unknownPageOutputDir(rawUrl: string, capturedAt: string, platform: string): string {
    let hostname = 'unknown-host'
    let pathname = 'root'

    try {
        const url = new URL(rawUrl)
        hostname = safePathSegment(url.hostname, hostname)
        pathname = safePathSegment(url.pathname, pathname)
    } catch {
        pathname = safePathSegment(rawUrl, 'unknown-page')
    }

    const urlHash = createHash('sha256').update(rawUrl).digest('hex').slice(0, 12)
    const urlFolder = `${pathname}-${urlHash}`
    const captureFolder = `${capturedAt.replace(/[:.]/g, '-')}-${platform}`

    return path.join(process.cwd(), 'diagnostics', 'unknown-login-pages', hostname, urlFolder, captureFolder)
}

export async function errorDiagnostic(page: Page, error: Error): Promise<void> {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const folderName = `error-${timestamp}`
        const outputDir = path.join(process.cwd(), 'diagnostics', folderName)

        if (!page) {
            return
        }

        if (page.isClosed()) {
            return
        }

        const errorLog = `
Name: ${error.name}
Message: ${error.message}
Timestamp: ${new Date().toISOString()}
---------------------------------------------------
Stack Trace:
${error.stack || 'No stack trace available'}
        `.trim()

        const [htmlContent, screenshotBuffer] = await Promise.all([
            page.content(),
            page.screenshot({ fullPage: true, type: 'png' })
        ])

        await fs.mkdir(outputDir, { recursive: true })

        await Promise.all([
            fs.writeFile(path.join(outputDir, 'dump.html'), htmlContent),
            fs.writeFile(path.join(outputDir, 'screenshot.png'), screenshotBuffer),
            fs.writeFile(path.join(outputDir, 'error.txt'), errorLog)
        ])

        console.log(`Diagnostics saved to: ${outputDir}`)
    } catch (error) {
        console.error('Unable to create error diagnostics:', error)
    }
}

export async function unknownPageDiagnostic(
    page: Page,
    { platform }: UnknownPageDiagnosticOptions
): Promise<string | null> {
    if (!page || page.isClosed()) return null

    const capturedAt = new Date().toISOString()
    const rawUrl = page.url()
    const outputDir = unknownPageOutputDir(rawUrl, capturedAt, platform)

    try {
        await fs.mkdir(outputDir, { recursive: true })

        const [htmlResult, screenshotResult] = await Promise.allSettled([
            page.content(),
            page.screenshot({ fullPage: true, type: 'png' })
        ])

        const metadata = {
            url: rawUrl,
            capturedAt,
            platform,
            htmlCaptured: htmlResult.status === 'fulfilled',
            screenshotCaptured: screenshotResult.status === 'fulfilled',
            errors: [
                htmlResult.status === 'rejected'
                    ? `HTML: ${htmlResult.reason instanceof Error ? htmlResult.reason.message : String(htmlResult.reason)}`
                    : null,
                screenshotResult.status === 'rejected'
                    ? `Screenshot: ${screenshotResult.reason instanceof Error ? screenshotResult.reason.message : String(screenshotResult.reason)}`
                    : null
            ].filter((error): error is string => error !== null)
        }

        const writes: Promise<void>[] = [
            fs.writeFile(path.join(outputDir, 'metadata.json'), JSON.stringify(metadata, null, 2))
        ]

        if (htmlResult.status === 'fulfilled') {
            writes.push(fs.writeFile(path.join(outputDir, 'page.html'), htmlResult.value))
        }
        if (screenshotResult.status === 'fulfilled') {
            writes.push(fs.writeFile(path.join(outputDir, 'screenshot.png'), screenshotResult.value))
        }

        await Promise.all(writes)
        console.log(`Unknown login page diagnostics saved to: ${outputDir}`)
        return outputDir
    } catch (error) {
        console.error('Unable to create unknown login page diagnostics:', error)
        return null
    }
}
