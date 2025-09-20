export interface Account {
    email: string;
    password: string;
    /** Optional TOTP secret in Base32 (e.g., from Microsoft Authenticator setup) */
    totp?: string;
    proxy: AccountProxy;
}

export interface AccountProxy {
    proxyAxios: boolean;
    url: string;
    port: number;
    password: string;
    username: string;
}