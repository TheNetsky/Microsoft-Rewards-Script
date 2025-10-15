import { AdaptiveThrottler } from './AdaptiveThrottler'

export interface RiskEvent {
  type: 'captcha' | 'error' | 'timeout' | 'ban_hint' | 'success'
  timestamp: number
  severity: number // 0-10, higher = worse
  context?: string
}

export interface RiskMetrics {
  score: number // 0-100, higher = riskier
  level: 'safe' | 'elevated' | 'high' | 'critical'
  recommendation: string
  delayMultiplier: number
}

/**
 * RiskManager monitors account activity patterns and detects early ban signals.
 * Integrates with AdaptiveThrottler to dynamically adjust delays based on risk.
 */
export class RiskManager {
  private events: RiskEvent[] = []
  private readonly maxEvents = 100
  private readonly timeWindowMs = 3600000 // 1 hour
  private throttler: AdaptiveThrottler
  private cooldownUntil: number = 0

  constructor(throttler?: AdaptiveThrottler) {
    this.throttler = throttler || new AdaptiveThrottler()
  }

  /**
   * Record a risk event (captcha, error, success, etc.)
   */
  recordEvent(type: RiskEvent['type'], severity: number, context?: string): void {
    const event: RiskEvent = {
      type,
      timestamp: Date.now(),
      severity: Math.max(0, Math.min(10, severity)),
      context
    }

    this.events.push(event)
    if (this.events.length > this.maxEvents) {
      this.events.shift()
    }

    // Feed success/error into adaptive throttler
    if (type === 'success') {
      this.throttler.record(true)
    } else if (['error', 'captcha', 'timeout', 'ban_hint'].includes(type)) {
      this.throttler.record(false)
    }

    // Auto cool-down on critical events
    if (severity >= 8) {
      const coolMs = Math.min(300000, severity * 30000) // max 5min
      this.cooldownUntil = Date.now() + coolMs
    }
  }

  /**
   * Calculate current risk metrics based on recent events
   */
  assessRisk(): RiskMetrics {
    const now = Date.now()
    const recentEvents = this.events.filter(e => now - e.timestamp < this.timeWindowMs)

    if (recentEvents.length === 0) {
      return {
        score: 0,
        level: 'safe',
        recommendation: 'Normal operation',
        delayMultiplier: 1.0
      }
    }

    // Calculate base risk score (weighted by recency and severity)
    let weightedSum = 0
    let totalWeight = 0

    for (const event of recentEvents) {
      const age = now - event.timestamp
      const recencyFactor = 1 - (age / this.timeWindowMs) // newer = higher weight
      const weight = recencyFactor * (event.severity / 10)
      
      weightedSum += weight * event.severity
      totalWeight += weight
    }

    const baseScore = totalWeight > 0 ? (weightedSum / totalWeight) * 10 : 0

    // Penalty for rapid event frequency
    const eventRate = recentEvents.length / (this.timeWindowMs / 60000) // events per minute
    const frequencyPenalty = Math.min(30, eventRate * 5)

    // Bonus penalty for specific patterns
    const captchaCount = recentEvents.filter(e => e.type === 'captcha').length
    const banHintCount = recentEvents.filter(e => e.type === 'ban_hint').length
    const patternPenalty = (captchaCount * 15) + (banHintCount * 25)

    const finalScore = Math.min(100, baseScore + frequencyPenalty + patternPenalty)

    // Determine risk level
    let level: RiskMetrics['level']
    let recommendation: string
    let delayMultiplier: number

    if (finalScore < 20) {
      level = 'safe'
      recommendation = 'Normal operation'
      delayMultiplier = 1.0
    } else if (finalScore < 40) {
      level = 'elevated'
      recommendation = 'Minor issues detected. Increasing delays slightly.'
      delayMultiplier = 1.5
    } else if (finalScore < 70) {
      level = 'high'
      recommendation = 'Significant risk detected. Applying heavy throttling.'
      delayMultiplier = 2.5
    } else {
      level = 'critical'
      recommendation = 'CRITICAL: High ban risk. Consider stopping or manual review.'
      delayMultiplier = 4.0
    }

    // Apply adaptive throttler multiplier on top
    const adaptiveMultiplier = this.throttler.getDelayMultiplier()
    delayMultiplier *= adaptiveMultiplier

    return {
      score: Math.round(finalScore),
      level,
      recommendation,
      delayMultiplier: Number(delayMultiplier.toFixed(2))
    }
  }

  /**
   * Check if currently in forced cool-down period
   */
  isInCooldown(): boolean {
    return Date.now() < this.cooldownUntil
  }

  /**
   * Get remaining cool-down time in milliseconds
   */
  getCooldownRemaining(): number {
    const remaining = this.cooldownUntil - Date.now()
    return Math.max(0, remaining)
  }

  /**
   * Get the adaptive throttler instance for advanced usage
   */
  getThrottler(): AdaptiveThrottler {
    return this.throttler
  }

  /**
   * Clear all events and reset state (use between accounts)
   */
  reset(): void {
    this.events = []
    this.cooldownUntil = 0
    // Keep throttler state across resets for learning
  }

  /**
   * Export events for analytics/logging
   */
  getRecentEvents(limitMinutes: number = 60): RiskEvent[] {
    const cutoff = Date.now() - (limitMinutes * 60000)
    return this.events.filter(e => e.timestamp >= cutoff)
  }
}
