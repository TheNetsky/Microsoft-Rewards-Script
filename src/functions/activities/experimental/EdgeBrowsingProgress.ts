import { performance } from 'node:perf_hooks'

export interface EdgeBrowsingProgressSnapshot {
    reportsCompleted: number
    reportsTotal: number
    reportsRemaining: number
    scheduledMinutesCovered: number
    nextReportInSeconds: number | null
    elapsedMinutes: number
    estimatedRemainingMinutes: number
}

export class EdgeBrowsingProgress {
    private readonly startedAt = performance.now()

    constructor(
        private readonly targetMinutes: number,
        private readonly intervalMinutes: number,
        private readonly delays: readonly number[]
    ) {}

    public get reportsTotal(): number {
        return this.delays.length
    }

    public get estimatedDurationMinutes(): number {
        return this.toMinutes(this.sum(this.delays))
    }

    public snapshot(reportsCompleted: number): EdgeBrowsingProgressSnapshot {
        const completed = Math.min(Math.max(0, reportsCompleted), this.reportsTotal)
        const remainingMs = this.sum(this.delays.slice(completed))
        const nextDelay = this.delays[completed]

        return {
            reportsCompleted: completed,
            reportsTotal: this.reportsTotal,
            reportsRemaining: this.reportsTotal - completed,
            scheduledMinutesCovered: Math.min(this.targetMinutes, completed * this.intervalMinutes),
            nextReportInSeconds: nextDelay === undefined ? null : this.round(nextDelay / 1000),
            elapsedMinutes: this.toMinutes(performance.now() - this.startedAt),
            estimatedRemainingMinutes: this.toMinutes(remainingMs)
        }
    }

    public delayBeforeReport(reportNumber: number): number {
        return this.delays[reportNumber - 1] ?? 0
    }

    private sum(values: readonly number[]): number {
        return values.reduce((total, value) => total + value, 0)
    }

    private toMinutes(milliseconds: number): number {
        return this.round(milliseconds / 60_000)
    }

    private round(value: number): number {
        return Math.round(value * 10) / 10
    }
}
