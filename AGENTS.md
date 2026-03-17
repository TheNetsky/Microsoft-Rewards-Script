# AGENTS.md - Agentic Coding Guidelines

This file provides guidelines for AI agents working on this Microsoft Rewards Script codebase.

## Project Overview

- **Language**: TypeScript (Node.js >= 24.0.0)
- **Package Manager**: npm
- **Build Output**: `dist/` directory
- **Main Entry**: `src/index.ts`

## Build, Lint, and Test Commands

### Build

```bash
npm run build        # Compile TypeScript to dist/
npm run pre-build    # Install deps + patchright install chromium
```

### Run

```bash
npm start            # Run compiled JS from dist/
npm run dev          # Run with ts-node (development)
npm run ts-start     # Run with ts-node
```

### Code Quality

```bash
npm run format           # Auto-fix formatting with Prettier
npm run format:check     # Check formatting without fixing
# Note: No test command configured - manual testing only
```

### Development Utilities

```bash
npm run clear-sessions   # Clear saved browser sessions
npm run open-session    # Open browser session for debugging
npm run kill-chrome-win # Kill Chrome processes (Windows)
```

---

## Code Style Guidelines

### Formatting (Prettier)

| Setting        | Value             |
| -------------- | ----------------- |
| Semi           | No (none)         |
| Quotes         | Single `'string'` |
| Trailing Comma | None              |
| Tab Width      | 4 spaces          |
| Print Width    | 120 chars         |
| Arrow Parens   | Avoid             |

### ESLint Rules

- Linebreak style: Unix (`\n`)
- No semicolons
- Single quotes
- Trailing commas: Allowed
- Prefer arrow callbacks
- `any` type: Warns but allowed

### TypeScript Strict Mode

All strict options are enabled:

- `strict: true`
- `noImplicitAny: true`
- `strictNullChecks: true`
- `noImplicitReturns: true`
- `noUncheckedIndexedAccess: true`
- `noImplicitOverride: true`

Avoid `any` when possible. Use `unknown` or specific types instead.

---

## Naming Conventions

| Type                | Convention                         | Example                            |
| ------------------- | ---------------------------------- | ---------------------------------- |
| Classes             | PascalCase                         | `MicrosoftRewardsBot`, `Workers`   |
| Functions/Variables | camelCase                          | `doDailySet`, `getDashboardData`   |
| Interfaces          | PascalCase                         | `DashboardData`, `Account`         |
| Types               | PascalCase                         | `ExecutionContext`                 |
| Constants           | SCREAMING_SNAKE_CASE               | `MAX_RETRIES`                      |
| File Names          | PascalCase (classes) or kebab-case | `BrowserFunc.ts`, `next-parser.ts` |

---

## Import Order

Organize imports in this order with blank lines between groups:

```typescript
// 1. Node.js built-ins
import { AsyncLocalStorage } from 'node:async_hooks'
import cluster, { Worker } from 'cluster'

// 2. External packages
import type { BrowserContext, Cookie, Page } from 'patchright'
import pkg from '../package.json'
import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator'

// 3. Local relative imports
import Browser from './browser/Browser'
import BrowserFunc from './browser/BrowserFunc'
import { IpcLog, Logger } from './logging/Logger'

// 4. Type-only imports (can be anywhere, usually grouped)
import type { Account } from './interface/Account'
```

**Note**: Use `import type` for type-only imports to enable tree-shaking.

---

## Code Patterns

### Classes

```typescript
export class Workers {
    protected bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    public async doDailySet(data: DashboardData, page: Page): Promise<void> {
        // Implementation
    }
}
```

### Interface Definitions

```typescript
interface ExecutionContext {
    isMobile: boolean
    account: Account
}
```

### Error Handling

```typescript
try {
    await someFunction()
} catch (error) {
    this.logger.error('main', 'ERROR-CONTEXT', error instanceof Error ? error.message : String(error))
}
```

### Boolean Checks

```typescript
// Prefer explicit comparisons
if (result !== undefined) {
}
if (this.config.workers.doDailySet) {
}

// Avoid implicit truthy checks for optional values
```

### Async/Await

```typescript
// Always use try-catch for async operations
async function initialize(): Promise<void> {
    try {
        this.accounts = loadAccounts()
    } catch (error) {
        this.logger.error('main', 'INIT', 'Failed to load accounts')
        throw error
    }
}

// Use void for fire-and-forget async calls in event handlers
process.on('SIGINT', async () => {
    void flushAllWebhooks()
})
```

---

## Logging Pattern

All loggers use a consistent format with context:

```typescript
this.logger.info(category, event, message, color?)
this.logger.debug(category, event, message)
this.logger.warn(category, event, message)
this.logger.error(category, event, message)
```

Categories: `'main'`, `'FLOW'`, `'BROWSER'`, `'DAILY-SET'`, `'SEARCH'`, etc.

---

## Browser Automation

This project uses **Patchright** (Playwright fork) for browser automation. Key patterns:

```typescript
import type { Page, BrowserContext } from 'patchright'

// Navigate and wait
await page.goto('https://rewards.bing.com', { waitUntil: 'networkidle' })

// Get content for parsing
const html = await page.content()

// Click elements
await page.click('button.submit')

// Fill forms
await page.fill('input#email', 'user@example.com')
```

---

## Key Files and Locations

| File                          | Purpose                                 |
| ----------------------------- | --------------------------------------- |
| `src/index.ts`                | Main entry, bot orchestration           |
| `src/functions/Workers.ts`    | Daily set, promotions, punch cards      |
| `src/functions/Activities.ts` | App activities (check-in, read-to-earn) |
| `src/browser/Browser.ts`      | Browser creation and management         |
| `src/browser/BrowserFunc.ts`  | Page functions (get data, points)       |
| `src/browser/auth/Login.ts`   | Authentication flows                    |
| `src/util/Utils.ts`           | Utility functions                       |
| `src/util/Axios.ts`           | HTTP client with retry logic            |
| `src/interface/*.ts`          | TypeScript interfaces                   |
| `src/config.json`             | Configuration (NOT committed)           |
| `src/accounts.json`           | Account credentials (NOT committed)     |

---

## Important Notes

1. **Credentials**: Never commit `config.json`, `accounts.json`, or any files containing secrets. These are in `.gitignore`.

2. **V4 UI**: This codebase is currently in transition to support Microsoft Rewards V4 UI. See branch `v4-exp` for experimental work.

3. **Environment Variables**: Use `.env` files or CLI arguments for configuration. Never hardcode credentials.

4. **Clusters**: The bot supports multi-process execution via `clusters` config option for parallel account processing.

5. **Mobile vs Desktop**: Some activities only work on mobile or desktop. The bot switches user-agent dynamically.
