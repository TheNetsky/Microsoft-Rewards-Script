export type BanStatus = { status: boolean; reason: string }

const BAN_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /suspend|suspended|suspension/i, reason: 'account suspended' },
  { re: /locked|lockout|serviceabuse|abuse/i, reason: 'locked or service abuse detected' },
  { re: /unusual.*activity|unusual activity/i, reason: 'unusual activity prompts' },
  { re: /verify.*identity|identity.*verification/i, reason: 'identity verification required' }
]

export function detectBanReason(input: unknown): BanStatus {
  const s = input instanceof Error ? (input.message || '') : String(input || '')
  for (const p of BAN_PATTERNS) {
    if (p.re.test(s)) return { status: true, reason: p.reason }
  }
  return { status: false, reason: '' }
}
