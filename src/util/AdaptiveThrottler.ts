export class AdaptiveThrottler {
  private errorCount = 0
  private successCount = 0
  private window: Array<{ ok: boolean; at: number }> = []
  private readonly maxWindow = 50

  record(ok: boolean) {
    this.window.push({ ok, at: Date.now() })
    if (ok) this.successCount++
    else this.errorCount++
    if (this.window.length > this.maxWindow) {
      const removed = this.window.shift()
      if (removed) removed.ok ? this.successCount-- : this.errorCount--
    }
  }

  /** Return a multiplier to apply to waits (1 = normal). */
  getDelayMultiplier(): number {
    const total = Math.max(1, this.successCount + this.errorCount)
    const errRatio = this.errorCount / total
    // 0% errors -> 1x; 50% errors -> ~1.8x; 80% -> ~2.5x (cap)
    const mult = 1 + Math.min(1.5, errRatio * 2)
    return Number(mult.toFixed(2))
  }
}
