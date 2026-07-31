export interface Account {
    email: string
    password: string
    totpSecret?: string
    recoveryEmail: string
    geoLocale: string
    langCode: string
    proxy: AccountProxy
    saveFingerprint: ConfigSaveFingerprint
}

export interface AccountProxy {
    proxyHttp: boolean
    url: string
    port: number
    password: string
    username: string
}

export interface ConfigSaveFingerprint {
    mobile: boolean
    desktop: boolean
}
