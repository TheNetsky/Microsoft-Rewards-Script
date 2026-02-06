import axios, { AxiosRequestConfig } from 'axios'
import PQueue from 'p-queue'
import type { WebhookInfluxDBConfig } from '../interface/Config'

const influxQueue = new PQueue({
    interval: 1000,
    intervalCap: 5,
    carryoverConcurrencyCount: true
})

interface AccountStats {
    email: string
    initialPoints: number
    finalPoints: number
    collectedPoints: number
    duration: number
    success: boolean
    error?: string
}

function formatLineProtocol(config: WebhookInfluxDBConfig, stats: AccountStats[]): string {
    const measurement = config.measurement || 'microsoft_rewards'
    const lines: string[] = []

    for (const stat of stats) {
        const tags = `email=${escapeTag(stat.email)},success=${stat.success}`

        const fields: string[] = [
            `initialPoints=${stat.initialPoints}i`,
            `finalPoints=${stat.finalPoints}i`,
            `collectedPoints=${stat.collectedPoints}i`,
            `duration=${stat.duration}`
        ]

        if (stat.error) {
            fields.push(`error="${escapeFieldValue(stat.error)}"`)
        }

        const timestamp = Date.now() * 1000000

        lines.push(`${measurement},${tags} ${fields.join(',')} ${timestamp}`)
    }

    return lines.join('\n')
}

function escapeTag(value: string): string {
    return value.replace(/[,= ]/g, char => `\\${char}`)
}

function escapeFieldValue(value: string): string {
    return value.replace(/"/g, '\\"')
}

export async function sendToInfluxDB(config: WebhookInfluxDBConfig, stats: AccountStats[]): Promise<void> {
    if (!config?.url || !config.bucket || !config.org || !config.token || stats.length === 0) {
        return
    }

    const lineProtocol = formatLineProtocol(config, stats)
    const url = `${config.url}/api/v2/write?org=${encodeURIComponent(config.org)}&bucket=${encodeURIComponent(config.bucket)}&precision=ns`

    const request: AxiosRequestConfig = {
        method: 'POST',
        url: url,
        headers: {
            'Authorization': `Token ${config.token}`,
            'Content-Type': 'text/plain; charset=utf-8'
        },
        data: lineProtocol,
        timeout: 10000
    }

    await influxQueue.add(async () => {
        try {
            await axios(request)
        } catch (err: any) {
            const status = err?.response?.status
            if (status === 429) return
            console.error('InfluxDB write error:', err?.response?.data || err.message)
        }
    })
}

export async function flushInfluxDBQueue(timeoutMs = 5000): Promise<void> {
    await Promise.race([
        (async () => {
            await influxQueue.onIdle()
        })(),
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('influxdb flush timeout')), timeoutMs))
    ]).catch(() => { })
}
