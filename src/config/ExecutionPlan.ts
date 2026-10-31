import type { Config } from './Config'

export function describeExecutionPlan(config: Config) {
    const appTasks = ['doDailyCheckIn', 'doAppPromotions', 'doReadToEarn'] as const
    const appApiWorkers = appTasks.filter(name => config.workers[name])
    const browser = config.rewardsMode === 'browser'
    const desktopRequirements = browser ? ['rendered Rewards tasks'] : []
    const mobileRequirements = browser ? ['rendered Rewards tasks'] : []
    const session = (reasons: string[]) =>
        reasons.length
            ? `Retains its browser for ${reasons.join(', ')}; closes when browser work finishes`
            : 'Saves cookies and closes after sign-in; tasks use HTTP'

    let mobileSignIn = 'Signs in after desktop when needed, before activities start.'
    if (browser) {
        mobileSignIn = config.searchSettings.parallelSearching
            ? 'Opens alongside desktop searches when needed.'
            : 'Opens after desktop work and browser cleanup when needed.'
    }

    return {
        version: 2,
        browserRequirements: { desktop: desktopRequirements, mobile: mobileRequirements },
        mode: config.rewardsMode,
        desktopProfile: 'msrewards-desktop',
        enabledWorkers: Object.entries(config.workers)
            .filter(([, enabled]) => enabled)
            .map(([worker]) => worker),
        appApiWorkers,
        unsupportedWorkers: [],
        pointClaims: config.workers.doClaimBonusPoints ? 'api' : 'disabled',
        edgeBrowsing: config.experimental.edgeBrowsing ? 'desktop-api' : 'disabled',
        browserSearchApiReport:
            browser && config.experimental.browserSearchApiReport
                ? 'once-if-search-streak-incomplete-after-desktop-searches'
                : 'disabled',
        browserTaskOrder: browser ? ['flyout', 'earn-remaining', 'search', 'final-claims-and-balance', 'close'] : [],
        globalTimeout: config.globalTimeout,
        ignoredSettings: browser
            ? []
            : [
                  config.searchSettings.scrollRandomResults && 'searchSettings.scrollRandomResults',
                  config.searchSettings.clickRandomResults && 'searchSettings.clickRandomResults',
                  config.experimental.browserSearchApiReport && 'experimental.browserSearchApiReport'
              ].filter((setting): setting is string => Boolean(setting)),
        desktopSession: `Signs in first. ${session(desktopRequirements)}`,
        mobileSession: `${mobileSignIn} ${session(mobileRequirements)}`,
        searchQuota: 'Unavailable until authenticated Rewards data is read',
        queryLocale: config.searchSettings.useAccountLocale ? 'account' : 'en-US',
        queryEngines: config.searchSettings.queryEngines,
        changesApply: 'Next run; restart the API for its environment settings'
    }
}
