import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import axiosRetry from 'axios-retry'
import { HttpProxyAgent } from 'http-proxy-agent'
import { HttpsProxyAgent } from 'https-proxy-agent'
import type { AccountProxy } from '../interface/Account'

class AxiosClient {
    private instance: AxiosInstance
    private account: AccountProxy

    constructor(account: AccountProxy) {
        this.account = account

        this.instance = axios.create({
            timeout: 20000
        })

        // Configure proxy agent if available
        if (this.account.url && this.account.proxyAxios) {
            const agent = this.getAgentForProxy(this.account)
            this.instance.defaults.httpAgent = agent
            this.instance.defaults.httpsAgent = agent
        }

        axiosRetry(this.instance, {
            retries: 5, // Retry 5 times
            retryDelay: axiosRetry.exponentialDelay,
            shouldResetTimeout: true,
            retryCondition: error => {
                // Retry on: Network errors, 429 (Too Many Requests), 5xx server errors
                if (axiosRetry.isNetworkError(error)) return true
                if (!error.response) return true

                const status = error.response.status
                return status === 429 || (status >= 500 && status <= 599)
            }
        })
    }

    private getAgentForProxy(proxyConfig: AccountProxy): HttpProxyAgent<string> | HttpsProxyAgent<string> {
        const { url, port } = proxyConfig

        switch (true) {
            case url.startsWith('http://'):
                return new HttpProxyAgent(`${url}:${port}`)
            case url.startsWith('https://'):
                return new HttpsProxyAgent(`${url}:${port}`)
            default:
                throw new Error(`Unsupported proxy protocol: ${url}, only HTTP(S) is supported!`)
        }
    }

    public async request(config: AxiosRequestConfig, bypassProxy = false): Promise<AxiosResponse> {
        if (bypassProxy) {
            const bypassInstance = axios.create()
            axiosRetry(bypassInstance, {
                retries: 3,
                retryDelay: axiosRetry.exponentialDelay
            })
            return bypassInstance.request(config)
        }

        return this.instance.request(config)
    }
}

export default AxiosClient
