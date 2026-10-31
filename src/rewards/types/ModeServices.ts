import type { ActivityResult } from './ActivityResult'
import type { Page } from 'patchright'
import type { BasePromotion, RewardsState } from './RewardsState'
import type { PromotionSource } from './PromotionContext'
import type { QuestChild } from '../shared/parsers/RewardsPageParser'
import type { TaskDataSource, AccountDataSource } from './DataSource'
import type { VisualSearchDriver } from './VisualSearchTypes'
import type { Promotion } from '../app/types/AppDashboardData'

export interface RewardsActions {
    runWebTasks?(data: RewardsState, confirmed: Set<string>): Promise<RewardsState>
    search(page: Page | undefined, isMobile: boolean): Promise<number | null>
    bonusSearches(page: Page | undefined): Promise<number | null>
    searchOnBing(promotion: BasePromotion, source: PromotionSource): Promise<ActivityResult>
    urlReward(promotion: BasePromotion, source: PromotionSource): Promise<ActivityResult>
    punchCardsMobile(data: RewardsState): Promise<void>
    punchCardsDesktop(): Promise<void>
    claimBonusPoints(): Promise<ActivityResult>
    ensureStreakProtection(): Promise<ActivityResult>
    claimReward(child: QuestChild, parentId: string): Promise<ActivityResult>
    activateSearchPerk(data: RewardsState): Promise<ActivityResult>
    readToEarn(promotion: Promotion): Promise<ActivityResult>
}
export interface ModeServices {
    accountData: AccountDataSource
    data: TaskDataSource
    actions: RewardsActions
    createVisualSearch(): VisualSearchDriver
    reportStreakProtection: ServerActionReporter['reportStreakProtection']
    serverActions?: ServerActionReporter
    snapshotRoutes: string[]
    allowClosedBrowserHttp: boolean
}

export interface ServerActionReporter {
    reportStreakProtection(
        html: string
    ): Promise<{ status: number; acknowledged: boolean; availablePoints: number | null }>

    reportServerAction(
        actionId: string,
        body: unknown[],
        opts?: { url?: string; referer?: string; routerStateTree?: string }
    ): Promise<{ status: number; acknowledged: boolean; availablePoints: number | null }>
}
