import fs from 'fs'
import path from 'path'
import type { Config } from '../interface/Config'

type DayState = {
  doneOfferIds: string[]
}

type FileState = {
  days: Record<string, DayState>
}

export class JobState {
  private baseDir: string

  constructor(cfg: Config) {
    const dir = cfg.jobState?.dir || path.join(process.cwd(), cfg.sessionPath, 'job-state')
    this.baseDir = dir
    if (!fs.existsSync(this.baseDir)) fs.mkdirSync(this.baseDir, { recursive: true })
  }

  private fileFor(email: string): string {
    const safe = email.replace(/[^a-z0-9._-]/gi, '_')
    return path.join(this.baseDir, `${safe}.json`)
  }

  private load(email: string): FileState {
    const file = this.fileFor(email)
    if (!fs.existsSync(file)) return { days: {} }
    try {
      const raw = fs.readFileSync(file, 'utf-8')
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' && parsed.days ? parsed as FileState : { days: {} }
    } catch { return { days: {} } }
  }

  private save(email: string, state: FileState): void {
    const file = this.fileFor(email)
    fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf-8')
  }

  isDone(email: string, day: string, offerId: string): boolean {
    const st = this.load(email)
    const d = st.days[day]
    if (!d) return false
    return d.doneOfferIds.includes(offerId)
  }

  markDone(email: string, day: string, offerId: string): void {
    const st = this.load(email)
    if (!st.days[day]) st.days[day] = { doneOfferIds: [] }
    const d = st.days[day]
    if (!d.doneOfferIds.includes(offerId)) d.doneOfferIds.push(offerId)
    this.save(email, st)
  }
}

export default JobState
