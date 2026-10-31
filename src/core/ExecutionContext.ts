import { AsyncLocalStorage } from 'node:async_hooks'
import type { Account } from './Account'

export interface ExecutionContext {
    isMobile: boolean
    account: Account
}
export const executionContext = new AsyncLocalStorage<ExecutionContext>()
export function getCurrentContext(): ExecutionContext | null {
    return executionContext.getStore() ?? null
}
