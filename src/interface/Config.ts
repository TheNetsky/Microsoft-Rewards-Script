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
    humanization?: ConfigHumanization; // Anti-ban humanization controls
    retryPolicy?: ConfigRetryPolicy; // Global retry/backoff policy
    jobState?: ConfigJobState; // Persistence of per-activity checkpoints
    logExcludeFunc: string[];
    webhookLogExcludeFunc: string[];
    logging?: ConfigLogging; // Preserve original logging object (for live webhook settings)
    proxy: ConfigProxy;
    webhook: ConfigWebhook;
    conclusionWebhook?: ConfigWebhook; // Optional secondary webhook for final summary
    ntfy: ConfigNtfy;
    diagnostics?: ConfigDiagnostics;
    update?: ConfigUpdate;
    schedule?: ConfigSchedule;
    passesPerRun?: number;
    buyMode?: ConfigBuyMode; // Optional manual spending mode
    vacation?: ConfigVacation; // Optional monthly contiguous off-days
    crashRecovery?: ConfigCrashRecovery; // Automatic restart / graceful shutdown
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
    localFallbackCount?: number; // Number of local fallback queries to sample when trends fail
    extraFallbackRetries?: number; // Additional mini-retry loops with fallback terms
}

export interface ConfigSearchDelay {
    min: number | string;
    max: number | string;
}

export interface ConfigWebhook {
    enabled: boolean;
    url: string;
    username?: string; // Optional override for displayed webhook name
    avatarUrl?: string; // Optional avatar image URL
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

export interface ConfigBuyMode {
    enabled?: boolean; // if true, force buy mode session
    maxMinutes?: number; // session duration cap
}

export interface ConfigSchedule {
    enabled?: boolean;
    time?: string; // Back-compat: accepts "HH:mm" or "h:mm AM/PM"
    // New optional explicit times
    time12?: string; // e.g., "9:00 AM"
    time24?: string; // e.g., "09:00"
    timeZone?: string; // IANA TZ e.g., "America/New_York"
    useAmPm?: boolean; // If true, prefer time12 + AM/PM style; if false, prefer time24. If undefined, back-compat behavior.
    runImmediatelyOnStart?: boolean; // if true, run once immediately when process starts
}

export interface ConfigVacation {
    enabled?: boolean; // default false
    minDays?: number; // default 3
    maxDays?: number; // default 5
}

export interface ConfigCrashRecovery {
    autoRestart?: boolean; // Restart the root process after fatal crash
    maxRestarts?: number; // Max restart attempts (default 2)
    backoffBaseMs?: number; // Base backoff before restart (default 2000)
    restartFailedWorker?: boolean; // (future) attempt to respawn crashed worker
    restartFailedWorkerAttempts?: number; // attempts per worker (default 1)
}

export interface ConfigWorkers {
    doDailySet: boolean;
    doMorePromotions: boolean;
    doPunchCards: boolean;
    doDesktopSearch: boolean;
    doMobileSearch: boolean;
    doDailyCheckIn: boolean;
    doReadToEarn: boolean;
    bundleDailySetWithSearch?: boolean; // If true, run desktop search right after Daily Set
}

// Anti-ban humanization
export interface ConfigHumanization {
    // Master toggle for Human Mode. When false, humanization is minimized.
    enabled?: boolean;
    // If true, stop processing remaining accounts after a ban is detected
    stopOnBan?: boolean;
    // If true, send an immediate webhook/NTFY alert when a ban is detected
    immediateBanAlert?: boolean;
    // Additional random waits between actions
    actionDelay?: { min: number | string; max: number | string };
    // Probability [0..1] to perform micro mouse moves per step
    gestureMoveProb?: number;
    // Probability [0..1] to perform tiny scrolls per step
    gestureScrollProb?: number;
    // Allowed execution windows (local time). Each item is "HH:mm-HH:mm".
    // If provided, runs outside these windows will be delayed until the next allowed window.
    allowedWindows?: string[];
    // Randomly skip N days per week to look more human (0-7). Default 1.
    randomOffDaysPerWeek?: number;
}

// Retry/backoff policy
export interface ConfigRetryPolicy {
    maxAttempts?: number; // default 3
    baseDelay?: number | string; // default 1000ms
    maxDelay?: number | string; // default 30s
    multiplier?: number; // default 2
    jitter?: number; // 0..1; default 0.2
}

// Job state persistence
export interface ConfigJobState {
    enabled?: boolean; // default true
    dir?: string; // base directory; defaults to <sessionPath>/job-state
}

// Live logging configuration
export interface ConfigLoggingLive {
    enabled?: boolean; // master switch for live webhook logs
    redactEmails?: boolean; // if true, redact emails in outbound logs
}

export interface ConfigLogging {
    excludeFunc?: string[];
    webhookExcludeFunc?: string[];
    live?: ConfigLoggingLive;
    liveWebhookUrl?: string; // legacy/dedicated live webhook override
    redactEmails?: boolean; // legacy top-level redaction flag
    // Optional nested live.url support (already handled dynamically in Logger)
    [key: string]: unknown; // forward compatibility
}

// CommunityHelp removed (privacy-first policy)

