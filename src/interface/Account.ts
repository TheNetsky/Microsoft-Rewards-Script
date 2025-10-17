export interface Account {
    /** Enable/disable this account (if false, account will be skipped during execution) */
    enabled?: boolean;
    email: string;
    password: string;
    /** Optional TOTP secret in Base32 (e.g., from Microsoft Authenticator setup) */
    totp?: string;
    /** Optional recovery email used to verify masked address on Microsoft login screens */
    recoveryEmail?: string;
    proxy: AccountProxy;
}

export interface AccountProxy {
    proxyAxios: boolean;
    url: string;
    port: number;
    password: string;
    username: string;
}