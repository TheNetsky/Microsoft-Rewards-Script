import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { HttpProxyAgent } from 'http-proxy-agent'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'
import { AccountProxy } from '../interface/Account'

class AxiosClient {
    private instance: AxiosInstance
    private account: AccountProxy

    constructor(account: AccountProxy) {
        this.account = account
        this.instance = axios.create()

        // If a proxy configuration is provided, set up the agent
        if (this.account.url && this.account.proxyAxios) {
            const agent = this.getAgentForProxy(this.account)
            this.instance.defaults.httpAgent = agent
            this.instance.defaults.httpsAgent = agent
        }
    }

    private getAgentForProxy(proxyConfig: AccountProxy): HttpProxyAgent<string> | HttpsProxyAgent<string> | SocksProxyAgent {
        const { url, port } = proxyConfig

        switch (true) {
            case proxyConfig.url.startsWith('http://'):
                return new HttpProxyAgent(`${url}:${port}`)
            case proxyConfig.url.startsWith('https://'):
                return new HttpsProxyAgent(`${url}:${port}`)
            case proxyConfig.url.startsWith('socks://') || proxyConfig.url.startsWith('socks4://') || proxyConfig.url.startsWith('socks5://'):
                return new SocksProxyAgent(`${url}:${port}`)
            default:
                throw new Error(`Unsupported proxy protocol in "${url}". Supported: http://, https://, socks://, socks4://, socks5://`)
        }
    }

    // Generic method to make any Axios request
    public async request(config: AxiosRequestConfig, bypassProxy = false): Promise<AxiosResponse> {
        if (bypassProxy) {
            const bypassInstance = axios.create()
            return bypassInstance.request(config)
        }

        let lastError: unknown
        const maxAttempts = 2
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await this.instance.request(config)
            } catch (err: unknown) {
                lastError = err
                const axiosErr = err as AxiosError | undefined

                // Detect HTTP proxy auth failures (status 407) and retry without proxy
                if (axiosErr && axiosErr.response && axiosErr.response.status === 407) {
                    if (attempt < maxAttempts) {
                        await this.sleep(1000 * attempt) // Exponential backoff
                    }
                    const bypassInstance = axios.create()
                    return bypassInstance.request(config)
                }

                // If proxied request fails with common proxy/network errors, retry with backoff
                const e = err as { code?: string; cause?: { code?: string }; message?: string } | undefined
                const code = e?.code || e?.cause?.code
                const isNetErr = code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ENOTFOUND'
                const msg = String(e?.message || '')
                const looksLikeProxyIssue = /proxy|tunnel|socks|agent/i.test(msg)
                
                if (isNetErr || looksLikeProxyIssue) {
                    if (attempt < maxAttempts) {
                        // Exponential backoff: 1s, 2s, 4s, etc.
                        const delayMs = 1000 * Math.pow(2, attempt - 1)
                        await this.sleep(delayMs)
                        continue
                    }
                    // Last attempt: try without proxy
                    const bypassInstance = axios.create()
                    return bypassInstance.request(config)
                }
                
                // Non-retryable error
                throw err
            }
        }
        
        throw lastError
    }
    
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}

export default AxiosClient