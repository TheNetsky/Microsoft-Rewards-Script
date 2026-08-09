import { AsyncLocalStorage } from 'node:async_hooks'

import type { Account } from '../interface/Account'
import type { ExecutionContext } from './types'

const executionContext = new AsyncLocalStorage<ExecutionContext>()

export function getCurrentContext(): ExecutionContext {
    const context = executionContext.getStore()
    if (!context) {
        return { isMobile: false, account: {} as Account }
    }
    return context
}

export { executionContext }
