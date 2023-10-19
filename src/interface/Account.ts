export interface Account {
    email: string;
    password: string;
    proxy: AccountProxy;
}

export interface AccountProxy {
    url: string;
    port: number;
    password: string;
    username: string;
}