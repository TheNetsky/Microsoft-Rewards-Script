import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
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
            case proxyConfig.url.startsWith('http'):
                return new HttpProxyAgent(`${url}:${port}`)
            case proxyConfig.url.startsWith('https'):
                return new HttpsProxyAgent(`${url}:${port}`)
            case proxyConfig.url.startsWith('socks'):
                return new SocksProxyAgent(`${url}:${port}`)
            default:
                throw new Error(`Unsupported proxy protocol: ${url}`)
        }
    }

    // Generic method to make any Axios request
    public async request(config: AxiosRequestConfig, bypassProxy = false): Promise<AxiosResponse> {
        if (bypassProxy) {
            const bypassInstance = axios.create()
            return bypassInstance.request(config)
        }

        try {
            return await this.instance.request(config)
        } catch (err: unknown) {
            // If proxied request fails with common proxy/network errors, retry once without proxy
            const e = err as { code?: string; cause?: { code?: string }; message?: string } | undefined
            const code = e?.code || e?.cause?.code
            const isNetErr = code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ENOTFOUND'
            const msg = String(e?.message || '')
            const looksLikeProxyIssue = /proxy|tunnel|socks|agent/i.test(msg)
            if (!bypassProxy && (isNetErr || looksLikeProxyIssue)) {
                const bypassInstance = axios.create()
                return bypassInstance.request(config)
            }
            throw err
        }
    }
}

export default AxiosClient