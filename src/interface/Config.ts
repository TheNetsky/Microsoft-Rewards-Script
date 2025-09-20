export interface Config {
    baseURL: string;
    sessionPath: string;
    headless: boolean;
    parallel: boolean;
    runOnZeroPoints: boolean;
    clusters: number;
    saveFingerprint: ConfigSaveFingerprint;
    workers: ConfigWorkers;
    searchOnBingLocalQueries: boolean;
    globalTimeout: number | string;
    searchSettings: ConfigSearchSettings;
    logExcludeFunc: string[];
    webhookLogExcludeFunc: string[];
    proxy: ConfigProxy;
    webhook: ConfigWebhook;
    conclusionWebhook?: ConfigWebhook; // Optional secondary webhook for final summary
    ntfy: ConfigNtfy;
    diagnostics?: ConfigDiagnostics;
}

export interface ConfigSaveFingerprint {
    mobile: boolean;
    desktop: boolean;
}

export interface ConfigSearchSettings {
    useGeoLocaleQueries: boolean;
    scrollRandomResults: boolean;
    clickRandomResults: boolean;
    searchDelay: ConfigSearchDelay;
    retryMobileSearchAmount: number;
}

export interface ConfigSearchDelay {
    min: number | string;
    max: number | string;
}

export interface ConfigWebhook {
    enabled: boolean;
    url: string;
}

export interface ConfigNtfy {
    enabled: boolean;
    url: string;
    topic: string;
    authToken?: string; // Optional authentication token
}

export interface ConfigProxy {
    proxyGoogleTrends: boolean;
    proxyBingTerms: boolean;
}

export interface ConfigDiagnostics {
    enabled?: boolean; // master toggle
    saveScreenshot?: boolean; // capture .png
    saveHtml?: boolean; // capture .html
    maxPerRun?: number; // cap number of captures per run
    retentionDays?: number; // delete older diagnostic folders
}

export interface ConfigWorkers {
    doDailySet: boolean;
    doMorePromotions: boolean;
    doPunchCards: boolean;
    doDesktopSearch: boolean;
    doMobileSearch: boolean;
    doDailyCheckIn: boolean;
    doReadToEarn: boolean;
}

