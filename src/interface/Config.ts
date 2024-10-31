export interface Config {
    baseURL: string;
    sessionPath: string;
    headless: boolean;
    parallel: boolean;
    runOnZeroPoints: boolean;
    clusters: number;
    workers: Workers;
    searchOnBingLocalQueries: boolean;
    globalTimeout: number | string;
    searchSettings: SearchSettings;
    webhook: Webhook;
    saveFingerprint: ConfigSaveFingerprint;
}

export interface ConfigSaveFingerprint {
    mobile: boolean;
    desktop: boolean;
}

export interface SearchSettings {
    useGeoLocaleQueries: boolean;
    scrollRandomResults: boolean;
    clickRandomResults: boolean;
    searchDelay: SearchDelay;
    retryMobileSearchAmount: number;
}

export interface SearchDelay {
    min: number | string;
    max: number | string;
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
    doDailyCheckIn: boolean;
    doReadToEarn: boolean;
}
