import path from 'path'
import fs from 'fs'
import type { Page } from 'rebrowser-playwright'
import type { MicrosoftRewardsBot } from '../index'

export type DiagnosticsScope = 'default' | 'security'

export interface DiagnosticsOptions {
  scope?: DiagnosticsScope
  skipSlot?: boolean
  force?: boolean
}

export async function captureDiagnostics(bot: MicrosoftRewardsBot, page: Page, rawLabel: string, options?: DiagnosticsOptions): Promise<void> {
  try {
    const scope: DiagnosticsScope = options?.scope ?? 'default'
    const cfg = bot.config?.diagnostics ?? {}
    const forceCapture = options?.force === true || scope === 'security'
    if (!forceCapture && cfg.enabled === false) return

    if (scope === 'default') {
      const maxPerRun = typeof cfg.maxPerRun === 'number' ? cfg.maxPerRun : 8
      if (!options?.skipSlot && !bot.tryReserveDiagSlot(maxPerRun)) return
    }

    const saveScreenshot = scope === 'security' ? true : cfg.saveScreenshot !== false
    const saveHtml = scope === 'security' ? true : cfg.saveHtml !== false
    if (!saveScreenshot && !saveHtml) return

    const safeLabel = rawLabel.replace(/[^a-z0-9-_]/gi, '_').slice(0, 64) || 'capture'
    const now = new Date()
    const timestamp = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`

    let dir: string
    if (scope === 'security') {
      const base = path.join(process.cwd(), 'diagnostics', 'security-incidents')
      fs.mkdirSync(base, { recursive: true })
      const sub = `${now.toISOString().replace(/[:.]/g, '-')}-${safeLabel}`
      dir = path.join(base, sub)
      fs.mkdirSync(dir, { recursive: true })
    } else {
      const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      dir = path.join(process.cwd(), 'reports', day)
      fs.mkdirSync(dir, { recursive: true })
    }

    if (saveScreenshot) {
      const shotName = scope === 'security' ? 'page.png' : `${timestamp}_${safeLabel}.png`
      const shotPath = path.join(dir, shotName)
      await page.screenshot({ path: shotPath }).catch(() => {})
      if (scope === 'security') {
        bot.log(bot.isMobile, 'DIAG', `Saved security screenshot to ${shotPath}`)
      } else {
        bot.log(bot.isMobile, 'DIAG', `Saved diagnostics screenshot to ${shotPath}`)
      }
    }

    if (saveHtml) {
      const htmlName = scope === 'security' ? 'page.html' : `${timestamp}_${safeLabel}.html`
      const htmlPath = path.join(dir, htmlName)
      try {
        const html = await page.content()
        await fs.promises.writeFile(htmlPath, html, 'utf-8')
        if (scope === 'security') {
          bot.log(bot.isMobile, 'DIAG', `Saved security HTML to ${htmlPath}`)
        }
      } catch {
        /* ignore */
      }
    }
  } catch (error) {
    bot.log(bot.isMobile, 'DIAG', `Failed to capture diagnostics: ${error instanceof Error ? error.message : error}`, 'warn')
  }
}
