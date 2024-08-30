export interface OAuth {
    access_token: string;
    refresh_token: string;
    scope: string;
    expires_in: number;
    ext_expires_in: number;
    foci: string;
    token_type: string;
}