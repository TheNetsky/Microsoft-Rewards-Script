import * as fs from 'fs'
import * as path from 'path'

export interface SerpBotScoreEntry {
    email: string
    collectedPoints: number
    initialPoints: number
    finalPoints: number
    serpBotScore: string
    serpBotScoreUpd: string
    duration: number
    success: boolean
    error?: string
}

/**
 * Appends account run data into a daily log file.
 * File format: logs/SerpBotScore_YYYY-MM-DD.txt
 * Each run appends a timestamped block so history within a day is preserved.
 */
export async function writeSerpBotScoreLog(entries: SerpBotScoreEntry[]): Promise<void> {
    if (!entries.length) return

    const logsDir = path.join(__dirname, '../../logs')

    if (!fs.existsSync(logsDir)) {
        await fs.promises.mkdir(logsDir, { recursive: true })
    }

    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10) // YYYY-MM-DD
    const fileName = `SerpBotScore_${dateStr}.txt`
    const filePath = path.join(logsDir, fileName)

    const timeStr = today.toLocaleString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    })

    // Column widths
    const W_EMAIL    = 38
    const W_POINTS   = 8
    const W_OLD      = 7
    const W_NEW      = 7
    const W_SCORE    = 13
    const W_SCOREUPD = 20
    const W_DUR      = 9
    const W_STATUS   = 10

    const pad  = (s: string, w: number) => s.padEnd(w)
    const rpad = (s: string, w: number) => s.padStart(w)
    const sep  = '─'.repeat(120)
    const dash = '-'.repeat(120)

    const header = [
        pad('Email',             W_EMAIL),
        rpad('Total',            W_POINTS),
        rpad('Old',              W_OLD),
        rpad('New',              W_NEW),
        pad('SerpBotScore',      W_SCORE),
        pad('ScoreLastUpdated',  W_SCOREUPD),
        rpad('Duration',         W_DUR),
        pad('Status',            W_STATUS),
    ].join('  ')

    const lines: string[] = [
        '',
        sep,
        `Run at : ${timeStr}`,
        sep,
        header,
        dash,
    ]

    for (const e of entries) {
        const total   = `+${e.collectedPoints}`
        const oldPts  = `${e.initialPoints}`
        const newPts  = `${e.finalPoints}`
        const dur     = `${e.duration.toFixed(1)}s`
        const status  = e.success ? 'OK' : `FAIL: ${(e.error ?? '').slice(0, 30)}`

        const row = [
            pad(e.email,           W_EMAIL),
            rpad(total,            W_POINTS),
            rpad(oldPts,           W_OLD),
            rpad(newPts,           W_NEW),
            pad(e.serpBotScore,    W_SCORE),
            pad(e.serpBotScoreUpd, W_SCOREUPD),
            rpad(dur,              W_DUR),
            pad(status,            W_STATUS),
        ].join('  ')

        lines.push(row)
    }

    lines.push(sep)
    lines.push('')

    await fs.promises.appendFile(filePath, lines.join('\n'), 'utf-8')
}
