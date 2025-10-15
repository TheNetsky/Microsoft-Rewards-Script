import { RiskManager, RiskEvent } from './RiskManager'

export interface BanPattern {
  name: string
  description: string
  weight: number // 0-10
  detected: boolean
  evidence: string[]
}

export interface BanPrediction {
  riskScore: number // 0-100
  confidence: number // 0-1
  likelihood: 'very-low' | 'low' | 'medium' | 'high' | 'critical'
  patterns: BanPattern[]
  recommendation: string
  preventiveActions: string[]
}

export interface HistoricalData {
  email: string
  timestamp: number
  banned: boolean
  preBanEvents: RiskEvent[]
  accountAge: number // days since first use
  totalRuns: number
}

/**
 * BanPredictor uses machine-learning-style pattern analysis to predict ban risk.
 * Learns from historical data and real-time signals to calculate ban probability.
 */
export class BanPredictor {
  private riskManager: RiskManager
  private history: HistoricalData[] = []
  private patterns: BanPattern[] = []

  constructor(riskManager: RiskManager) {
    this.riskManager = riskManager
    this.initializePatterns()
  }

  /**
   * Analyze current state and predict ban risk
   */
  predictBanRisk(accountEmail: string, accountAgeDays: number, totalRuns: number): BanPrediction {
    const riskMetrics = this.riskManager.assessRisk()
    const recentEvents = this.riskManager.getRecentEvents(60)

    // Detect patterns
    this.detectPatterns(recentEvents, accountAgeDays, totalRuns)

    // Calculate base risk from RiskManager
    const baseRisk = riskMetrics.score

    // Apply ML-style feature weights
    const featureScore = this.calculateFeatureScore(recentEvents, accountAgeDays, totalRuns)

    // Pattern detection bonus
    const detectedPatterns = this.patterns.filter(p => p.detected)
    const patternPenalty = detectedPatterns.reduce((sum, p) => sum + p.weight, 0)

    // Historical learning adjustment
    const historicalAdjustment = this.getHistoricalAdjustment(accountEmail)

    // Final risk score (capped at 100)
    const finalScore = Math.min(100, baseRisk + featureScore + patternPenalty + historicalAdjustment)

    // Calculate confidence (based on data availability)
    const confidence = this.calculateConfidence(recentEvents.length, this.history.length)

    // Determine likelihood tier
    let likelihood: BanPrediction['likelihood']
    if (finalScore < 20) likelihood = 'very-low'
    else if (finalScore < 40) likelihood = 'low'
    else if (finalScore < 60) likelihood = 'medium'
    else if (finalScore < 80) likelihood = 'high'
    else likelihood = 'critical'

    // Generate recommendations
    const recommendation = this.generateRecommendation(finalScore)
    const preventiveActions = this.generatePreventiveActions(detectedPatterns)

    return {
      riskScore: Math.round(finalScore),
      confidence: Number(confidence.toFixed(2)),
      likelihood,
      patterns: detectedPatterns,
      recommendation,
      preventiveActions
    }
  }

  /**
   * Record ban event for learning
   */
  recordBan(email: string, accountAgeDays: number, totalRuns: number): void {
    const preBanEvents = this.riskManager.getRecentEvents(120)

    this.history.push({
      email,
      timestamp: Date.now(),
      banned: true,
      preBanEvents,
      accountAge: accountAgeDays,
      totalRuns
    })

    // Keep history limited (last 100 bans)
    if (this.history.length > 100) {
      this.history.shift()
    }
  }

  /**
   * Record successful run (no ban) for learning
   */
  recordSuccess(email: string, accountAgeDays: number, totalRuns: number): void {
    this.history.push({
      email,
      timestamp: Date.now(),
      banned: false,
      preBanEvents: [],
      accountAge: accountAgeDays,
      totalRuns
    })

    if (this.history.length > 100) {
      this.history.shift()
    }
  }

  /**
   * Initialize known ban patterns
   */
  private initializePatterns(): void {
    this.patterns = [
      {
        name: 'rapid-captcha-sequence',
        description: 'Multiple captchas in short timespan',
        weight: 8,
        detected: false,
        evidence: []
      },
      {
        name: 'high-error-rate',
        description: 'Excessive errors (>50% in last hour)',
        weight: 6,
        detected: false,
        evidence: []
      },
      {
        name: 'timeout-storm',
        description: 'Many consecutive timeouts',
        weight: 7,
        detected: false,
        evidence: []
      },
      {
        name: 'suspicious-timing',
        description: 'Activity at unusual hours or too consistent',
        weight: 5,
        detected: false,
        evidence: []
      },
      {
        name: 'new-account-aggressive',
        description: 'Aggressive activity on young account',
        weight: 9,
        detected: false,
        evidence: []
      },
      {
        name: 'proxy-flagged',
        description: 'Proxy showing signs of blacklisting',
        weight: 7,
        detected: false,
        evidence: []
      }
    ]
  }

  /**
   * Detect patterns in recent events
   */
  private detectPatterns(events: RiskEvent[], accountAgeDays: number, totalRuns: number): void {
    // Reset detection
    for (const p of this.patterns) {
      p.detected = false
      p.evidence = []
    }

    const captchaEvents = events.filter(e => e.type === 'captcha')
    const errorEvents = events.filter(e => e.type === 'error')
    const timeoutEvents = events.filter(e => e.type === 'timeout')

    // Pattern 1: Rapid captcha sequence
    if (captchaEvents.length >= 3) {
      const timeSpan = (events[events.length - 1]?.timestamp || 0) - (events[0]?.timestamp || 0)
      if (timeSpan < 1800000) { // 30 min
        const p = this.patterns.find(pat => pat.name === 'rapid-captcha-sequence')
        if (p) {
          p.detected = true
          p.evidence.push(`${captchaEvents.length} captchas in ${Math.round(timeSpan / 60000)}min`)
        }
      }
    }

    // Pattern 2: High error rate
    const errorRate = errorEvents.length / Math.max(1, events.length)
    if (errorRate > 0.5) {
      const p = this.patterns.find(pat => pat.name === 'high-error-rate')
      if (p) {
        p.detected = true
        p.evidence.push(`Error rate: ${(errorRate * 100).toFixed(1)}%`)
      }
    }

    // Pattern 3: Timeout storm
    if (timeoutEvents.length >= 5) {
      const p = this.patterns.find(pat => pat.name === 'timeout-storm')
      if (p) {
        p.detected = true
        p.evidence.push(`${timeoutEvents.length} timeouts detected`)
      }
    }

    // Pattern 4: Suspicious timing (all events within same hour)
    if (events.length > 5) {
      const hours = new Set(events.map(e => new Date(e.timestamp).getHours()))
      if (hours.size === 1) {
        const p = this.patterns.find(pat => pat.name === 'suspicious-timing')
        if (p) {
          p.detected = true
          p.evidence.push('All activity in same hour of day')
        }
      }
    }

    // Pattern 5: New account aggressive
    if (accountAgeDays < 7 && totalRuns > 10) {
      const p = this.patterns.find(pat => pat.name === 'new-account-aggressive')
      if (p) {
        p.detected = true
        p.evidence.push(`Account ${accountAgeDays} days old with ${totalRuns} runs`)
      }
    }

    // Pattern 6: Proxy flagged (heuristic: many ban hints)
    const banHints = events.filter(e => e.type === 'ban_hint')
    if (banHints.length >= 2) {
      const p = this.patterns.find(pat => pat.name === 'proxy-flagged')
      if (p) {
        p.detected = true
        p.evidence.push(`${banHints.length} ban hints detected`)
      }
    }
  }

  /**
   * Calculate feature-based risk score (ML-style)
   */
  private calculateFeatureScore(events: RiskEvent[], accountAgeDays: number, totalRuns: number): number {
    let score = 0

    // Feature 1: Event density (events per minute)
    const eventDensity = events.length / 60
    if (eventDensity > 0.5) score += 10
    else if (eventDensity > 0.2) score += 5

    // Feature 2: Account age risk
    if (accountAgeDays < 3) score += 15
    else if (accountAgeDays < 7) score += 10
    else if (accountAgeDays < 14) score += 5

    // Feature 3: Run frequency risk
    const runsPerDay = totalRuns / Math.max(1, accountAgeDays)
    if (runsPerDay > 3) score += 12
    else if (runsPerDay > 2) score += 6

    // Feature 4: Severity distribution
    const highSeverityEvents = events.filter(e => e.severity >= 7)
    if (highSeverityEvents.length > 3) score += 15
    else if (highSeverityEvents.length > 1) score += 8

    return score
  }

  /**
   * Learn from historical data
   */
  private getHistoricalAdjustment(email: string): number {
    const accountHistory = this.history.filter(h => h.email === email)
    if (accountHistory.length === 0) return 0

    const bannedCount = accountHistory.filter(h => h.banned).length
    const banRate = bannedCount / accountHistory.length

    // If this account has high ban history, increase risk
    if (banRate > 0.3) return 20
    if (banRate > 0.1) return 10

    // If clean history, slight bonus
    if (accountHistory.length > 5 && banRate === 0) return -5

    return 0
  }

  /**
   * Calculate prediction confidence
   */
  private calculateConfidence(eventCount: number, historyCount: number): number {
    let confidence = 0.5

    // More events = higher confidence
    if (eventCount > 20) confidence += 0.2
    else if (eventCount > 10) confidence += 0.1

    // More historical data = higher confidence
    if (historyCount > 50) confidence += 0.2
    else if (historyCount > 20) confidence += 0.1

    return Math.min(1.0, confidence)
  }

  /**
   * Generate human-readable recommendation
   */
  private generateRecommendation(score: number): string {
    if (score < 20) {
      return 'Safe to proceed. Risk is minimal.'
    } else if (score < 40) {
      return 'Low risk detected. Monitor for issues but safe to continue.'
    } else if (score < 60) {
      return 'Moderate risk. Consider increasing delays and reviewing patterns.'
    } else if (score < 80) {
      return 'High risk! Strongly recommend pausing automation for 24-48 hours.'
    } else {
      return 'CRITICAL RISK! Stop all automation immediately. Manual review required.'
    }
  }

  /**
   * Generate actionable preventive steps
   */
  private generatePreventiveActions(patterns: BanPattern[]): string[] {
    const actions: string[] = []

    if (patterns.some(p => p.name === 'rapid-captcha-sequence')) {
      actions.push('Increase search delays to 3-5 minutes minimum')
      actions.push('Enable longer cool-down periods between activities')
    }

    if (patterns.some(p => p.name === 'high-error-rate')) {
      actions.push('Check proxy connectivity and health')
      actions.push('Verify User-Agent and fingerprint configuration')
    }

    if (patterns.some(p => p.name === 'new-account-aggressive')) {
      actions.push('Slow down activity on new accounts (max 1 run per day for first week)')
      actions.push('Allow account to age naturally before heavy automation')
    }

    if (patterns.some(p => p.name === 'proxy-flagged')) {
      actions.push('Rotate to different proxy immediately')
      actions.push('Test proxy manually before resuming')
    }

    if (patterns.some(p => p.name === 'suspicious-timing')) {
      actions.push('Randomize execution times across different hours')
      actions.push('Enable humanization.allowedWindows with varied schedules')
    }

    if (actions.length === 0) {
      actions.push('Continue monitoring but no immediate action needed')
    }

    return actions
  }

  /**
   * Export historical data for analysis
   */
  exportHistory(): HistoricalData[] {
    return [...this.history]
  }

  /**
   * Import historical data (for persistence)
   */
  importHistory(data: HistoricalData[]): void {
    this.history = data.slice(-100) // Keep last 100
  }
}
