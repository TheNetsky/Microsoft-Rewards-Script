import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface NetworkCheckResult {
    reachable: boolean
    checkedUrls: string[]
    failedUrls: string[]
    checkTime: number
}

export interface NetworkCheckOptions {
    /** Timeout in milliseconds, default 1000ms */
    timeout?: number
    /** URLs to check, defaults to query engine URLs */
    urls?: string[]
    /** Whether to use proxy, default false */
    useProxy?: boolean
}

export class NetworkDetector {
    private static readonly DEFAULT_CHECK_URLS = [
        'https://trends.google.com',
        'https://wikimedia.org',
        'https://www.reddit.com',
        'https://www.bing.com'
    ]

    private static async checkUrlWithCurl(url: string, timeout: number): Promise<boolean> {
        try {
            const timeoutSec = Math.ceil(timeout / 1000)
            const nullDevice = process.platform === 'win32' ? 'nul' : '/dev/null'
            const command = `curl -I -s -o ${nullDevice} --max-time ${timeoutSec} "${url}"`
            await execAsync(command, { timeout })
            return true
        } catch {
            return false
        }
    }

    static async check(options: NetworkCheckOptions = {}): Promise<NetworkCheckResult> {
        const startTime = Date.now()
        const { timeout = 1000, urls = this.DEFAULT_CHECK_URLS } = options

        const results: { url: string; reachable: boolean }[] = []

        const checks = urls.map(async (url) => {
            const reachable = await this.checkUrlWithCurl(url, timeout)
            results.push({ url, reachable })
        })

        await Promise.allSettled(checks)

        const failedUrls = results.filter(r => !r.reachable).map(r => r.url)
        const reachable = failedUrls.length < urls.length

        return {
            reachable,
            checkedUrls: urls,
            failedUrls,
            checkTime: Date.now() - startTime
        }
    }

    static async isReachable(options: NetworkCheckOptions = {}): Promise<boolean> {
        const result = await this.check(options)
        return result.reachable
    }

    static async getSourceOrderWithFallback(
        sourceOrder: string[],
        options: NetworkCheckOptions = {}
    ): Promise<string[]> {
        const isNetworkOk = await this.isReachable(options)

        if (!isNetworkOk) {
            return ['local']
        }

        return sourceOrder
    }
}
