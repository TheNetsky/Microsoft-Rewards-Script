import type { ConfigRetryPolicy } from '../interface/Config'
import Util from './Utils'

type NumericPolicy = {
  maxAttempts: number
  baseDelay: number
  maxDelay: number
  multiplier: number
  jitter: number
}

export type Retryable<T> = () => Promise<T>

export class Retry {
  private policy: NumericPolicy

  constructor(policy?: ConfigRetryPolicy) {
    const def: NumericPolicy = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      multiplier: 2,
      jitter: 0.2
    }
  const merged: ConfigRetryPolicy = { ...(policy || {}) }
    // normalize string durations
    const util = new Util()
    const parse = (v: number | string) => {
      if (typeof v === 'number') return v
      try { return util.stringToMs(String(v)) } catch { return def.baseDelay }
    }
    this.policy = {
      maxAttempts: (merged.maxAttempts as number) ?? def.maxAttempts,
      baseDelay: parse(merged.baseDelay ?? def.baseDelay),
      maxDelay: parse(merged.maxDelay ?? def.maxDelay),
      multiplier: (merged.multiplier as number) ?? def.multiplier,
      jitter: (merged.jitter as number) ?? def.jitter
    }
  }

  async run<T>(fn: Retryable<T>, isRetryable?: (e: unknown) => boolean): Promise<T> {
    let attempt = 0
    let delay = this.policy.baseDelay
    let lastErr: unknown
  while (attempt < this.policy.maxAttempts) {
      try {
        return await fn()
      } catch (e) {
        lastErr = e
        attempt += 1
        const retry = isRetryable ? isRetryable(e) : true
        if (!retry || attempt >= this.policy.maxAttempts) break
        const jitter = 1 + (Math.random() * 2 - 1) * this.policy.jitter
        const sleep = Math.min(this.policy.maxDelay, Math.max(0, Math.floor(delay * jitter)))
        await new Promise((r) => setTimeout(r, sleep))
        delay = Math.min(this.policy.maxDelay, Math.floor(delay * (this.policy.multiplier || 2)))
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
  }
}

export default Retry
