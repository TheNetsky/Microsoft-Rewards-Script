import { DateTime, IANAZone } from 'luxon'
import { spawn } from 'child_process'
import path from 'path'
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

/**
 * Run a single pass either in-process or as a child process (default),
 * with a watchdog timeout to kill stuck runs.
 */
async function runOnePassWithWatchdog(): Promise<void> {
  // How long to allow a pass to run before we consider it stuck
  // Default: 180 minutes (3 hours)
  const timeoutMin = Number(process.env.SCHEDULER_PASS_TIMEOUT_MINUTES || 180)
  const timeoutMs = Math.max(10_000, timeoutMin * 60_000)

  // Fork per pass: safer because we can terminate a stuck child without killing the scheduler
  const forkPerPass = String(process.env.SCHEDULER_FORK_PER_PASS || 'true').toLowerCase() !== 'false'

  if (!forkPerPass) {
    // In-process fallback (cannot forcefully stop if truly stuck)
    await log('main', 'SCHEDULER', `Starting pass in-process with timeout ${timeoutMin}m (cannot force-kill if stuck)`)
    await Promise.race([
      runOnePass(),
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error('pass-timeout')), timeoutMs))
    ]).catch(async (e) => {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg === 'pass-timeout') {
        await log('main', 'SCHEDULER', `Pass exceeded timeout of ${timeoutMin} minutes (in-process)`, 'warn')
      } else {
        await log('main', 'SCHEDULER', `Pass failed: ${msg}`, 'error')
      }
    })
    return
  }

  // Child process execution
  const indexJs = path.join(__dirname, 'index.js')
  await log('main', 'SCHEDULER', `Spawning child for pass: ${process.execPath} ${indexJs}`)

  await new Promise<void>((resolve) => {
    const child = spawn(process.execPath, [indexJs], { stdio: 'inherit' })
    let finished = false

    const killChild = async (signal: NodeJS.Signals) => {
      try {
        await log('main', 'SCHEDULER', `Sending ${signal} to stuck child PID ${child.pid}`,'warn')
        child.kill(signal)
      } catch { /* ignore */ }
    }

    const timer = setTimeout(() => {
      if (finished) return
      log('main', 'SCHEDULER', `Pass exceeded timeout of ${timeoutMin} minutes; attempting to terminate...`, 'warn')
      // Try graceful then forceful kill
      void killChild('SIGTERM')
      setTimeout(() => { try { child.kill('SIGKILL') } catch { /* ignore */ } }, 10_000)
    }, timeoutMs)

    child.on('exit', async (code, signal) => {
      finished = true
      clearTimeout(timer)
      if (signal) {
        await log('main', 'SCHEDULER', `Child exited due to signal: ${signal}`, 'warn')
      } else if (code && code !== 0) {
        await log('main', 'SCHEDULER', `Child exited with non-zero code: ${code}`, 'warn')
      } else {
        await log('main', 'SCHEDULER', 'Child pass completed successfully')
      }
      resolve()
    })

    child.on('error', async (err) => {
      finished = true
      clearTimeout(timer)
      await log('main', 'SCHEDULER', `Failed to spawn child: ${err instanceof Error ? err.message : String(err)}`, 'error')
      resolve()
    })
  })
}

async function runPasses(passes: number): Promise<void> {
  const n = Math.max(1, Math.floor(passes || 1))
  for (let i = 1; i <= n; i++) {
    await log('main', 'SCHEDULER', `Starting pass ${i}/${n}`)
    const started = Date.now()
    await runOnePassWithWatchdog()
    const took = Date.now() - started
    const sec = Math.max(1, Math.round(took / 1000))
    await log('main', 'SCHEDULER', `Completed pass ${i}/${n}`)
    await log('main', 'SCHEDULER', `Pass ${i} duration: ${sec}s`)
  }
}

async function main() {
  const cfg = loadConfig() as Config & { schedule?: { enabled?: boolean; time?: string; timeZone?: string; runImmediatelyOnStart?: boolean } }
  const schedule = cfg.schedule || { enabled: false }
  const passes = typeof cfg.passesPerRun === 'number' ? cfg.passesPerRun : 1
  const offPerWeek = Math.max(0, Math.min(7, Number(cfg.humanization?.randomOffDaysPerWeek ?? 1)))
  let offDays: number[] = [] // 1..7 ISO weekday
  let offWeek: number | null = null

  const refreshOffDays = async (now: { weekNumber: number }) => {
    if (offPerWeek <= 0) { offDays = []; offWeek = null; return }
    const week = now.weekNumber
    if (offWeek === week && offDays.length) return
    // choose distinct weekdays [1..7]
    const pool = [1,2,3,4,5,6,7]
    const chosen: number[] = []
    for (let i=0;i<Math.min(offPerWeek,7);i++) {
      const idx = Math.floor(Math.random()*pool.length)
      chosen.push(pool[idx]!)
      pool.splice(idx,1)
    }
    offDays = chosen.sort((a,b)=>a-b)
    offWeek = week
    await log('main','SCHEDULER',`Selected random off-days this week (ISO): ${offDays.join(', ')}`,'warn')
  }

  if (!schedule.enabled) {
    await log('main', 'SCHEDULER', 'Schedule disabled; running once then exit')
    await runPasses(passes)
    process.exit(0)
  }

  const tz = schedule.timeZone || 'America/New_York'
  const time = schedule.time || '09:00'
  const runImmediate = schedule.runImmediatelyOnStart !== false

  // Optional initial jitter before the first run (to vary start time)
  const initJitterMin = Number(process.env.SCHEDULER_INITIAL_JITTER_MINUTES_MIN || process.env.SCHEDULER_INITIAL_JITTER_MIN || 0)
  const initJitterMax = Number(process.env.SCHEDULER_INITIAL_JITTER_MINUTES_MAX || process.env.SCHEDULER_INITIAL_JITTER_MAX || 0)
  const initialJitterBounds: [number, number] = [isFinite(initJitterMin) ? initJitterMin : 0, isFinite(initJitterMax) ? initJitterMax : 0]
  const applyInitialJitter = (initialJitterBounds[0] > 0 || initialJitterBounds[1] > 0)

  if (runImmediate) {
    if (applyInitialJitter) {
  const min = Math.max(0, Math.min(initialJitterBounds[0], initialJitterBounds[1]))
  const max = Math.max(0, Math.max(initialJitterBounds[0], initialJitterBounds[1]))
      const jitterSec = (min === max) ? min * 60 : (min * 60 + Math.floor(Math.random() * ((max - min) * 60)))
      if (jitterSec > 0) {
        await log('main', 'SCHEDULER', `Initial jitter: delaying first run by ${Math.round(jitterSec / 60)} minute(s) (${jitterSec}s)`, 'warn')
        await new Promise((r) => setTimeout(r, jitterSec * 1000))
      }
    }
    const nowDT = DateTime.local().setZone(tz)
    await refreshOffDays(nowDT)
    if (offDays.includes(nowDT.weekday)) {
      await log('main','SCHEDULER',`Skipping immediate run: off-day (weekday ${nowDT.weekday})`,'warn')
    } else {
      await runPasses(passes)
    }
  }

  for (;;) {
    const now = new Date()
    const targetToday = parseTargetToday(now, time, tz)
    let next = targetToday
    const nowDT = DateTime.fromJSDate(now, { zone: targetToday.zone })

    if (nowDT >= targetToday) {
      next = targetToday.plus({ days: 1 })
    }

  let ms = Math.max(0, next.toMillis() - nowDT.toMillis())

    // Optional daily jitter to further randomize the exact start time each day
    const dailyJitterMin = Number(process.env.SCHEDULER_DAILY_JITTER_MINUTES_MIN || process.env.SCHEDULER_DAILY_JITTER_MIN || 0)
    const dailyJitterMax = Number(process.env.SCHEDULER_DAILY_JITTER_MINUTES_MAX || process.env.SCHEDULER_DAILY_JITTER_MAX || 0)
    const djMin = isFinite(dailyJitterMin) ? dailyJitterMin : 0
    const djMax = isFinite(dailyJitterMax) ? dailyJitterMax : 0
    let extraMs = 0
    if (djMin > 0 || djMax > 0) {
      const mn = Math.max(0, Math.min(djMin, djMax))
      const mx = Math.max(0, Math.max(djMin, djMax))
      const jitterSec = (mn === mx) ? mn * 60 : (mn * 60 + Math.floor(Math.random() * ((mx - mn) * 60)))
      extraMs = jitterSec * 1000
      ms += extraMs
    }

    const human = next.toFormat('yyyy-LL-dd HH:mm ZZZZ')
    const totalSec = Math.round(ms / 1000)
    if (extraMs > 0) {
      await log('main', 'SCHEDULER', `Next run at ${human} plus daily jitter (+${Math.round(extraMs/60000)}m) → in ${totalSec}s`)
    } else {
      await log('main', 'SCHEDULER', `Next run at ${human} (in ${totalSec}s)`) 
    }

    await new Promise((resolve) => setTimeout(resolve, ms))

    const nowRun = DateTime.local().setZone(tz)
    await refreshOffDays(nowRun)
    if (offDays.includes(nowRun.weekday)) {
      await log('main','SCHEDULER',`Skipping scheduled run: off-day (weekday ${nowRun.weekday})`,'warn')
      continue
    }
    await runPasses(passes)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
