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
    public async request(config: AxiosRequestConfig): Promise<AxiosResponse> {
        return this.instance.request(config)
    }
}

export default AxiosClient