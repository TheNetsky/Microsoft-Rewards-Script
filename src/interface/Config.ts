export interface Config {
    baseURL: string;
    sessionPath: string;
    headless: boolean;
    browser?: ConfigBrowser; // Optional nested browser config
    fingerprinting?: ConfigFingerprinting; // Optional nested fingerprinting config
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
    passesPerRun?: number;
    vacation?: ConfigVacation; // Optional monthly contiguous off-days
    crashRecovery?: ConfigCrashRecovery; // Automatic restart / graceful shutdown
    riskManagement?: ConfigRiskManagement; // NEW: Risk-aware throttling and ban prediction
    dryRun?: boolean; // NEW: Dry-run mode (simulate without executing)
    queryDiversity?: ConfigQueryDiversity; // NEW: Multi-source query generation
}

export interface ConfigSaveFingerprint {
    mobile: boolean;
    desktop: boolean;
}

export interface ConfigBrowser {
    headless?: boolean;
    globalTimeout?: number | string;
}

export interface ConfigFingerprinting {
    saveFingerprint?: ConfigSaveFingerprint;
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
    username?: string; // Custom webhook username (default: "Microsoft Rewards")
    avatarUrl?: string; // Custom webhook avatar URL
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

// NEW FEATURES: Risk Management, Query Diversity
export interface ConfigRiskManagement {
    enabled?: boolean; // master toggle for risk-aware throttling
    autoAdjustDelays?: boolean; // automatically increase delays when risk is high
    stopOnCritical?: boolean; // halt execution if risk reaches critical level
    banPrediction?: boolean; // enable ML-style ban prediction
    riskThreshold?: number; // 0-100, pause if risk exceeds this
}

export interface ConfigQueryDiversity {
    enabled?: boolean; // use multi-source query generation
    sources?: Array<'google-trends' | 'reddit' | 'news' | 'wikipedia' | 'local-fallback'>; // which sources to use
    maxQueriesPerSource?: number; // limit per source
    cacheMinutes?: number; // cache duration
}

