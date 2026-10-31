import { AccountState } from './AccountState'
import type { Cookie, Page } from 'patchright'
import type { ModeServices } from '../rewards/types/ModeServices'
import { BrowserSessionClient } from '../browser/BrowserSessionClient'
import RewardsService from '../rewards/RewardsService'
import BrowserUtils from '../browser/BrowserUtils'
import RewardsPageParser, { type PageSnapshot, type StreakState } from '../rewards/shared/parsers/RewardsPageParser'
import { createAppIdentity, type AppIdentity } from '../rewards/app/AppIdentity'
import { AppPlatformClient } from '../rewards/app/AppPlatformClient'
import { Logger } from '../logging/Logger'
import Utils from '../util/Utils'
import type { Config } from '../config/Config'
import { resolveAccountLocale, type AccountLocale } from '../util/Locale'
import Activities from '../rewards/shared/activities/Activities'
import { SearchManager } from '../rewards/shared/search/SearchManager'
import type { QueryTopic } from '../rewards/shared/query/QueryContext'
import HttpClient from '../network/HttpClient'
import { getCurrentContext } from './ExecutionContext'
import { BrowserSessions } from '../browser/BrowserSessions'
import type { ActivityResult } from '../rewards/types/ActivityResult'
import { BrowserRequestClient } from '../browser/BrowserRequestClient'
import { formatActivityResult } from '../logging/LogMessage'
import { completionCategory } from '../rewards/shared/ActivityCompletion'
import { logStreakCompletions } from '../logging/StreakLog'
import { activityBalances } from '../rewards/shared/ActivityBalance'

interface RewardsPageState {
    nextActions: Record<string, string>
    nextRouterStateTree: string
    reactSnapshot: PageSnapshot | null
}

function createRewardsPageState(): RewardsPageState {
    return { nextActions: {}, nextRouterStateTree: '', reactSnapshot: null }
}

interface UserData {
    userName: string
    geoLocale: string
    langCode: string
    timezone: string
    timezoneOffset: string
    initialPoints: number
    currentPoints: number
}

export class BotContext {
    readonly cancellation = new AbortController()
    readonly accountState = new AccountState()

    readonly logger: Logger
    readonly utils: Utils
    readonly activities: Activities
    readonly browser: {
        readonly utils: BrowserUtils
        userAgentManager: import('../browser/UserAgent').UserAgentManager
    }

    mainMobilePage: Page | undefined
    mainDesktopPage: Page | undefined
    readonly userData: UserData
    accountLocale: AccountLocale

    private rewardsPageStates: { mobile: RewardsPageState; desktop: RewardsPageState } = {
        mobile: createRewardsPageState(),
        desktop: createRewardsPageState()
    }
    reactSnapshots: { mobile: PageSnapshot | null; desktop: PageSnapshot | null } = {
        mobile: null,
        desktop: null
    }

    searchTopicsCache: { key: string; topics: Promise<QueryTopic[]> } | null = null
    readonly attemptedPunchcardChildren = new Set<string>()

    accessTokens = { mobile: '', desktop: '' }
    appIdentity: AppIdentity = createAppIdentity()
    readonly appPlatform: AppPlatformClient
    cookies: { mobile: Cookie[]; desktop: Cookie[] }

    http!: HttpClient
    readonly mode: ModeServices
    readonly rewards: RewardsService
    readonly pageParser: RewardsPageParser
    readonly sessionState: BrowserSessionClient
    readonly sessions: BrowserSessions
    readonly requestClient: BrowserRequestClient
    readonly searchManager: SearchManager

    constructor(
        public readonly config: Config,
        createMode: (context: BotContext) => ModeServices
    ) {
        this.userData = {
            userName: '',
            geoLocale: 'US',
            langCode: 'en',
            timezone: '',
            timezoneOffset: '',
            initialPoints: 0,
            currentPoints: 0
        }
        this.accountLocale = resolveAccountLocale({ langCode: 'en', geoLocale: 'US' })
        this.logger = new Logger(this)
        this.cookies = { mobile: [], desktop: [] }
        this.utils = new Utils(() => this.signal)
        this.searchManager = new SearchManager(this)
        this.appPlatform = new AppPlatformClient(this)
        this.sessions = new BrowserSessions(this)
        this.requestClient = new BrowserRequestClient(this, () => this.activePage)
        this.browser = {
            utils: new BrowserUtils(this),
            userAgentManager: this.sessions.manager.userAgentManager
        }
        this.pageParser = new RewardsPageParser(this)
        this.sessionState = new BrowserSessionClient(this, () => this.activePage)
        this.mode = createMode(this)
        this.rewards = new RewardsService(this, this.mode)
        this.activities = new Activities(this)
    }

    get signal(): AbortSignal {
        return AbortSignal.any([this.cancellation.signal, this.accountState.signal])
    }

    get activityResults() {
        return this.accountState.results
    }

    get accountIssues() {
        return this.accountState.issues
    }

    observeStreaks(streaks: readonly StreakState[]): void {
        if (
            this.config.ensureStreakProtection &&
            !this.activityResults.some(result => result.activity === 'doEnsureStreakProtection')
        )
            return
        logStreakCompletions(this, streaks)
    }

    recordActivity(activity: string, result: ActivityResult): void {
        result = activityBalances(result)
        if (!this.accountState.record(activity, result, this.isMobile)) return
        this.logger.debug(
            this.isMobile,
            'ACTIVITY-DETAIL',
            `${activity} | status=${result.status} | reason=${result.reason} | offerId=${result.offerId ?? ''} | pointsGained=${result.pointsKnown === false ? 'unknown' : result.pointsGained}` +
                ` | operationId=${result.operationId ?? ''}` +
                (result.errorCode ? ` | errorCode=${result.errorCode}` : '') +
                (result.message ? ` | message=${JSON.stringify(result.message)}` : '')
        )
        this.logger.event(this.isMobile, 'ACTIVITY-RESULT', formatActivityResult(activity, result), {
            kind: 'activity',
            activity,
            ...result,
            category: completionCategory(result)
        })
    }

    private get rewardsPageState(): RewardsPageState {
        return this.isMobile ? this.rewardsPageStates.mobile : this.rewardsPageStates.desktop
    }

    get nextActions(): Record<string, string> {
        return this.rewardsPageState.nextActions
    }

    set nextActions(value: Record<string, string>) {
        this.rewardsPageState.nextActions = value
    }

    get nextRouterStateTree(): string {
        return this.rewardsPageState.nextRouterStateTree
    }

    set nextRouterStateTree(value: string) {
        this.rewardsPageState.nextRouterStateTree = value
    }

    get reactSnapshot(): PageSnapshot | null {
        return this.rewardsPageState.reactSnapshot
    }

    set reactSnapshot(value: PageSnapshot | null) {
        this.rewardsPageState.reactSnapshot = value
    }

    resetRewardsPageStates(): void {
        this.rewardsPageStates = { mobile: createRewardsPageState(), desktop: createRewardsPageState() }
        this.reactSnapshots = { mobile: null, desktop: null }
    }

    get isMobile(): boolean {
        return getCurrentContext()?.isMobile ?? false
    }

    get currentAccountEmail(): string | null {
        return getCurrentContext()?.account.email ?? null
    }

    requirePage(isMobile = this.isMobile): Page {
        const page = isMobile ? this.mainMobilePage : this.mainDesktopPage
        if (!page || page.isClosed()) throw new Error(`${isMobile ? 'Mobile' : 'Desktop'} browser page is unavailable`)
        return page
    }

    get activePage(): Page | null {
        const page = this.isMobile ? this.mainMobilePage : this.mainDesktopPage
        return page && !page.isClosed() ? page : null
    }
}
