import type { Account } from './Account'
import type { BotContext } from './BotContext'
import type { AccountRunResult } from './RunTypes'
import type { RewardsState } from '../rewards/types/RewardsState'

export interface AccountWorkflow {
    /** Runs after the initial desktop session has been saved. */
    afterLogin?(account: Account): Promise<void>
    run(account: Account, data: RewardsState): Promise<AccountRunResult>
}

export type WorkflowFactory = (context: BotContext) => AccountWorkflow
