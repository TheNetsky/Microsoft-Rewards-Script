import fs from 'fs'
import path from 'path'

export interface DailyMetrics {
  date: string // YYYY-MM-DD
  email: string
  pointsEarned: number
  pointsInitial: number
  pointsEnd: number
  desktopPoints: number
  mobilePoints: number
  executionTimeMs: number
  successRate: number // 0-1
  errorsCount: number
  banned: boolean
  riskScore?: number
}

export interface AccountHistory {
  email: string
  totalRuns: number
  totalPointsEarned: number
  avgPointsPerDay: number
  avgExecutionTime: number
  successRate: number
  lastRunDate: string
  banHistory: Array<{ date: string; reason: string }>
  riskTrend: number[] // last N risk scores
}

export interface AnalyticsSummary {
  period: string // e.g., 'last-7-days', 'last-30-days', 'all-time'
  accounts: AccountHistory[]
  globalStats: {
    totalPoints: number
    avgSuccessRate: number
    mostProductiveAccount: string
    mostRiskyAccount: string
  }
}

/**
 * Analytics tracks performance metrics, point collection trends, and account health.
 * Stores data in JSON files for lightweight persistence and easy analysis.
 */
export class Analytics {
  private dataDir: string

  constructor(baseDir: string = 'analytics') {
    this.dataDir = path.join(process.cwd(), baseDir)
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true })
    }
  }

  /**
   * Record metrics for a completed account run
   */
  recordRun(metrics: DailyMetrics): void {
    const date = metrics.date
    const email = this.sanitizeEmail(metrics.email)
    const fileName = `${email}_${date}.json`
    const filePath = path.join(this.dataDir, fileName)

    try {
      fs.writeFileSync(filePath, JSON.stringify(metrics, null, 2), 'utf-8')
    } catch (error) {
      console.error(`Failed to save metrics for ${metrics.email}:`, error)
    }
  }

  /**
   * Get history for a specific account
   */
  getAccountHistory(email: string, days: number = 30): AccountHistory {
    const sanitized = this.sanitizeEmail(email)
    const files = this.getAccountFiles(sanitized, days)

    if (files.length === 0) {
      return {
        email,
        totalRuns: 0,
        totalPointsEarned: 0,
        avgPointsPerDay: 0,
        avgExecutionTime: 0,
        successRate: 1.0,
        lastRunDate: 'never',
        banHistory: [],
        riskTrend: []
      }
    }

    let totalPoints = 0
    let totalTime = 0
    let successCount = 0
    const banHistory: Array<{ date: string; reason: string }> = []
    const riskScores: number[] = []

    for (const file of files) {
      const filePath = path.join(this.dataDir, file)
      try {
        const data: DailyMetrics = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
        totalPoints += data.pointsEarned
        totalTime += data.executionTimeMs
        if (data.successRate > 0.5) successCount++
        if (data.banned) {
          banHistory.push({ date: data.date, reason: 'detected' })
        }
        if (typeof data.riskScore === 'number') {
          riskScores.push(data.riskScore)
        }
      } catch {
        continue
      }
    }

    const totalRuns = files.length
    const lastFile = files[files.length - 1]
    const lastRunDate = lastFile ? lastFile.split('_')[1]?.replace('.json', '') || 'unknown' : 'unknown'

    return {
      email,
      totalRuns,
      totalPointsEarned: totalPoints,
      avgPointsPerDay: Math.round(totalPoints / Math.max(1, totalRuns)),
      avgExecutionTime: Math.round(totalTime / Math.max(1, totalRuns)),
      successRate: successCount / Math.max(1, totalRuns),
      lastRunDate,
      banHistory,
      riskTrend: riskScores.slice(-10) // last 10 risk scores
    }
  }

  /**
   * Generate a summary report for all accounts
   */
  generateSummary(days: number = 30): AnalyticsSummary {
    const accountEmails = this.getAllAccounts()
    const accounts: AccountHistory[] = []

    for (const email of accountEmails) {
      accounts.push(this.getAccountHistory(email, days))
    }

    const totalPoints = accounts.reduce((sum, a) => sum + a.totalPointsEarned, 0)
    const avgSuccess = accounts.reduce((sum, a) => sum + a.successRate, 0) / Math.max(1, accounts.length)

    let mostProductive = ''
    let maxPoints = 0
    let mostRisky = ''
    let maxRisk = 0

    for (const acc of accounts) {
      if (acc.totalPointsEarned > maxPoints) {
        maxPoints = acc.totalPointsEarned
        mostProductive = acc.email
      }
      const avgRisk = acc.riskTrend.reduce((s, r) => s + r, 0) / Math.max(1, acc.riskTrend.length)
      if (avgRisk > maxRisk) {
        maxRisk = avgRisk
        mostRisky = acc.email
      }
    }

    return {
      period: `last-${days}-days`,
      accounts,
      globalStats: {
        totalPoints,
        avgSuccessRate: Number(avgSuccess.toFixed(2)),
        mostProductiveAccount: mostProductive || 'none',
        mostRiskyAccount: mostRisky || 'none'
      }
    }
  }

  /**
   * Export summary as markdown table (for human readability)
   */
  exportMarkdown(days: number = 30): string {
    const summary = this.generateSummary(days)
    const lines: string[] = []

    lines.push(`# Analytics Summary (${summary.period})`)
    lines.push('')
    lines.push('## Global Stats')
    lines.push(`- Total Points: ${summary.globalStats.totalPoints}`)
    lines.push(`- Avg Success Rate: ${(summary.globalStats.avgSuccessRate * 100).toFixed(1)}%`)
    lines.push(`- Most Productive: ${summary.globalStats.mostProductiveAccount}`)
    lines.push(`- Most Risky: ${summary.globalStats.mostRiskyAccount}`)
    lines.push('')
    lines.push('## Per-Account Breakdown')
    lines.push('')
    lines.push('| Account | Runs | Total Points | Avg/Day | Success Rate | Last Run | Bans |')
    lines.push('|---------|------|--------------|---------|--------------|----------|------|')

    for (const acc of summary.accounts) {
      const successPct = (acc.successRate * 100).toFixed(0)
      const banCount = acc.banHistory.length
      lines.push(
        `| ${acc.email} | ${acc.totalRuns} | ${acc.totalPointsEarned} | ${acc.avgPointsPerDay} | ${successPct}% | ${acc.lastRunDate} | ${banCount} |`
      )
    }

    // Optional community info footer (only in markdown exports)
    lines.push('')
    lines.push('---')
    lines.push('*Looking for faster updates, advanced features, and better anti-detection? Join our community for enhanced versions and support.*')

    return lines.join('\n')
  }

  /**
   * Clean up old analytics files (retention policy)
   */
  cleanup(retentionDays: number): void {
    const files = fs.readdirSync(this.dataDir)
    const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000)

    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const filePath = path.join(this.dataDir, file)
      try {
        const stats = fs.statSync(filePath)
        if (stats.mtimeMs < cutoff) {
          fs.unlinkSync(filePath)
        }
      } catch {
        continue
      }
    }
  }

  private sanitizeEmail(email: string): string {
    return email.replace(/[^a-zA-Z0-9@._-]/g, '_')
  }

  private getAccountFiles(sanitizedEmail: string, days: number): string[] {
    const files = fs.readdirSync(this.dataDir)
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    return files
      .filter((f: string) => f.startsWith(sanitizedEmail) && f.endsWith('.json'))
      .filter((f: string) => {
        const datePart = f.split('_')[1]?.replace('.json', '')
        if (!datePart) return false
        const fileDate = new Date(datePart)
        return fileDate >= cutoffDate
      })
      .sort()
  }

  private getAllAccounts(): string[] {
    const files = fs.readdirSync(this.dataDir)
    const emailSet = new Set<string>()

    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const parts = file.split('_')
      if (parts.length >= 2) {
        const email = parts[0]
        if (email) emailSet.add(email)
      }
    }

    return Array.from(emailSet)
  }
}
