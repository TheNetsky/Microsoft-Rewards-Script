import { DateTime, IANAZone } from 'luxon'
import { MicrosoftRewardsBot } from './index'
import { loadConfig } from './util/Load'
import { log } from './util/Logger'
import type { Config } from './interface/Config'

function parseTargetToday(now: Date, timeHHmm: string, tz: string) {
  const [hh, mm] = timeHHmm.split(':').map((v) => parseInt(v, 10))
  const zone = IANAZone.isValidZone(tz) ? tz : 'UTC'
  const dtn = DateTime.fromJSDate(now, { zone })
  return dtn.set({ hour: hh, minute: mm, second: 0, millisecond: 0 })
}

async function runOnePass(): Promise<void> {
  const bot = new MicrosoftRewardsBot(false)
  await bot.initialize()
  await bot.run()
}

async function runPasses(passes: number): Promise<void> {
  const n = Math.max(1, Math.floor(passes || 1))
  for (let i = 1; i <= n; i++) {
    await log('main', 'SCHEDULER', `Starting pass ${i}/${n}`)
    await runOnePass()
    await log('main', 'SCHEDULER', `Completed pass ${i}/${n}`)
  }
}

async function main() {
  const cfg = loadConfig() as Config & { schedule?: { enabled?: boolean; time?: string; timeZone?: string; runImmediatelyOnStart?: boolean } }
  const schedule = cfg.schedule || { enabled: false }
  const passes = typeof cfg.passesPerRun === 'number' ? cfg.passesPerRun : 1

  if (!schedule.enabled) {
    await log('main', 'SCHEDULER', 'Schedule disabled; running once then exit')
    await runPasses(passes)
    process.exit(0)
  }

  const tz = schedule.timeZone || 'America/New_York'
  const time = schedule.time || '09:00'
  const runImmediate = schedule.runImmediatelyOnStart !== false

  if (runImmediate) {
    await runPasses(passes)
  }

  for (;;) {
    const now = new Date()
    const targetToday = parseTargetToday(now, time, tz)
    let next = targetToday
    const nowDT = DateTime.fromJSDate(now, { zone: targetToday.zone })

    if (nowDT >= targetToday) {
      next = targetToday.plus({ days: 1 })
    }

    const ms = Math.max(0, next.toMillis() - nowDT.toMillis())
  const human = next.toFormat('yyyy-LL-dd HH:mm ZZZZ')
  await log('main', 'SCHEDULER', `Next run at ${human} (in ${Math.round(ms / 1000)}s)`) 

    await new Promise((resolve) => setTimeout(resolve, ms))

    await runPasses(passes)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
