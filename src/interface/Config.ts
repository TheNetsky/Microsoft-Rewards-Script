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
    update?: ConfigUpdate;
    schedule?: ConfigSchedule;
    passesPerRun?: number;
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

export interface ConfigUpdate {
    git?: boolean; // if true, run git pull + npm ci + npm run build after completion
    docker?: boolean; // if true, run docker update routine (compose pull/up) after completion
    scriptPath?: string; // optional custom path to update script relative to repo root
}

export interface ConfigSchedule {
    enabled?: boolean;
    time?: string; // "HH:mm"
    timeZone?: string; // IANA TZ e.g., "America/New_York"
    runImmediatelyOnStart?: boolean; // if true, run once immediately when process starts
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

