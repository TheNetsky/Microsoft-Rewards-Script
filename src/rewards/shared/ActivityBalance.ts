import { AsyncLocalStorage } from 'node:async_hooks'
import type { BotContext } from '../../core/BotContext'
import type { ActivityResult } from '../types/ActivityResult'
import { pointValue } from './PointAccounting'

interface BalanceScope {
    before: number | null
    after: number | null
    parent?: BalanceScope
}

const balances = new AsyncLocalStorage<BalanceScope>()

function isActivityResult(value: unknown): value is ActivityResult {
    return (
        !!value &&
        typeof value === 'object' &&
        'status' in value &&
        ['confirmed', 'unconfirmed', 'skipped', 'failed'].includes(String(value.status)) &&
        'reason' in value &&
        typeof value.reason === 'string' &&
        'pointsGained' in value &&
        typeof value.pointsGained === 'number'
    )
}

/** Called only for a successful balance read, in the caller's activity context. */
export function observeActivityBalance(value: number): void {
    const balance = pointValue(value)
    if (balance === null) return
    for (let scope = balances.getStore(); scope; scope = scope.parent) {
        scope.after = balance
    }
}

export function activityBalances(result: ActivityResult): ActivityResult {
    const scope = balances.getStore()
    return {
        ...result,
        balanceBefore: result.balanceBefore === undefined ? (scope?.before ?? null) : result.balanceBefore,
        balanceAfter: result.balanceAfter === undefined ? (scope?.after ?? null) : result.balanceAfter
    }
}

/** Reuse existing reads without adding requests or attributing concurrent gains. */
export function withActivityBalance<T>(
    bot: Pick<BotContext, 'accountState' | 'userData'>,
    operation: () => Promise<T>
): Promise<T> {
    return balances.run(
        {
            before: bot.accountState.initialBalance === null ? null : pointValue(bot.userData.currentPoints),
            after: null,
            parent: balances.getStore()
        },
        async () => {
            const result = await operation()
            if (isActivityResult(result)) {
                Object.assign(result, activityBalances(result))
            }
            return result
        }
    )
}
