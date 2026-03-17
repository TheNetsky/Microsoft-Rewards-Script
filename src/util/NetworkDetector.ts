import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * 网络检测结果接口
 */
export interface NetworkCheckResult {
    reachable: boolean
    checkedUrls: string[]
    failedUrls: string[]
    checkTime: number
}

/**
 * 网络检测配置接口
 */
export interface NetworkCheckOptions {
    /** 超时时间（毫秒），默认 1000ms */
    timeout?: number
    /** 要检测的 URL 列表，默认使用查询引擎相关的 URL */
    urls?: string[]
    /** 是否使用代理，默认 false */
    useProxy?: boolean
}

/**
 * 网络检测器类
 * 用于检测网络是否可达，支持自动回落到本地查询
 */
export class NetworkDetector {
    /** 默认检测的 URL 列表（来自各查询引擎） */
    private static readonly DEFAULT_CHECK_URLS = [
        'https://trends.google.com', // Google Trends
        'https://wikimedia.org', // Wikipedia
        'https://www.reddit.com', // Reddit
        'https://www.bing.com' // Bing（辅助 API）
    ]

    /**
     * 使用 curl 检测单个 URL 是否可达
     * @param url 要检测的 URL
     * @param timeout 超时时间（毫秒）
     * @returns URL 是否可达
     */
    private static async checkUrlWithCurl(url: string, timeout: number): Promise<boolean> {
        try {
            // Windows 和 Linux/Mac 都支持 curl 命令
            // -I: 只获取响应头
            // -s: 静默模式，不显示进度条
            // -o nul: 将输出丢弃到空设备
            // --max-time: 设置最大超时时间（秒）
            const timeoutSec = Math.ceil(timeout / 1000)
            const nullDevice = process.platform === 'win32' ? 'nul' : '/dev/null'
            const command = `curl -I -s -o ${nullDevice} --max-time ${timeoutSec} "${url}"`

            await execAsync(command, { timeout })
            return true
        } catch {
            return false
        }
    }

    /**
     * 检测网络是否可达
     * @param options 检测选项
     * @returns 检测结果
     */
    static async check(options: NetworkCheckOptions = {}): Promise<NetworkCheckResult> {
        const startTime = Date.now()
        const { timeout = 1000, urls = this.DEFAULT_CHECK_URLS } = options

        const results: { url: string; reachable: boolean }[] = []

        // 并行检测所有 URL（也可以改为串行，看需求）
        const checks = urls.map(async (url) => {
            const reachable = await this.checkUrlWithCurl(url, timeout)
            results.push({ url, reachable })
        })

        await Promise.allSettled(checks)

        const failedUrls = results.filter(r => !r.reachable).map(r => r.url)
        const reachable = failedUrls.length < urls.length // 至少有一个可达就算网络可用

        return {
            reachable,
            checkedUrls: urls,
            failedUrls,
            checkTime: Date.now() - startTime
        }
    }

    /**
     * 检测网络是否可达（简化版，只返回布尔值）
     * @param options 检测选项
     * @returns 网络是否可达
     */
    static async isReachable(options: NetworkCheckOptions = {}): Promise<boolean> {
        const result = await this.check(options)
        return result.reachable
    }

    /**
     * 获取修正后的源顺序列表
     * 如果网络不可达，自动回落到 ['local']
     * @param sourceOrder 原始源顺序
     * @param options 检测选项
     * @returns 修正后的源顺序
     */
    static async getSourceOrderWithFallback(
        sourceOrder: string[],
        options: NetworkCheckOptions = {}
    ): Promise<string[]> {
        const isNetworkOk = await this.isReachable(options)

        if (!isNetworkOk) {
            // 网络不可达，只使用 local
            return ['local']
        }

        // 网络可达，保持原有顺序
        return sourceOrder
    }
}
