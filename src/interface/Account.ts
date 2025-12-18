export interface Account {
    enabled?: boolean
    email: string
    password: string
    totp?: string
    geoLocale: 'auto' | string
    proxy: AccountProxy
}

export interface AccountProxy {
    proxyAxios: boolean
    url: string
    port: number
    password: string
    username: string
}
