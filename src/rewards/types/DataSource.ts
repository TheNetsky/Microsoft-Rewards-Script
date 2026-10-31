import type { Page } from 'patchright'
import type { RewardsState } from './RewardsState'

export interface TaskDataSource {
    reset(): void
    bootstrap(page: Page): Promise<void>
    getTaskData?(): Promise<RewardsState>
    getPageHtml(url: string, route: string): Promise<string | null>
}

export interface AccountDataSource extends TaskDataSource {
    getDashboardData(): Promise<RewardsState>
}
