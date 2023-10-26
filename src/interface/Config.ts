export interface Config {
    baseURL: string;
    sessionPath: string;
    headless: boolean;
    runOnZeroPoints: boolean;
    clusters: number;
    workers: Workers;
    searchSettings: SearchSettings;
    webhook: Webhook;
}

export interface SearchSettings {
    useGeoLocaleQueries: boolean;
    scrollRandomResults: boolean;
    clickRandomResults: boolean;
    searchDelay: SearchDelay;
}

export interface SearchDelay {
    min: number;
    max: number;
}

export interface Webhook {
    enabled: boolean;
    url: string;
}

export interface Workers {
    doDailySet: boolean;
    doMorePromotions: boolean;
    doPunchCards: boolean;
    doDesktopSearch: boolean;
    doMobileSearch: boolean;
}
