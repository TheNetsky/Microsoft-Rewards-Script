# AGENTS.md

This file provides guidelines for agentic coding assistants working in this repository.

## Commands

### Build

- `npm ci` - Install dependencies (use in CI/CD)
- `npm i` - Install dependencies (development)
- `npm run build` - Compile TypeScript to JavaScript (output: `dist/`)
- `npm run pre-build` - Full pre-build: install deps, clean dist, install browsers
- `npm run start` - Run compiled code from `dist/index.js`
- `npm run dev` - Run with ts-node for development (hot reload)
- `npm run ts-start` - Run with ts-node without dev flags
- `npm run clear-sessions` - Delete browser session data

### Lint & Format

- `npx eslint .` - Lint all files (ESLint with @typescript-eslint)
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check formatting without changes
- `npm run build` also performs TypeScript type checking

### Docker

- `npm run create-docker` - Build Docker image
- `docker compose up -d` - Start container (Docker deployment)
- `docker logs microsoft-rewards-script` - View container logs

### Single Test Execution

No test framework is currently configured. To add tests:

1. Install a test runner (vitest or jest recommended)
2. Add scripts: `"test": "vitest"`, `"test:run": "vitest run"`, `"test:single": "vitest run <path>"`
3. Create `__tests__` directories or `*.test.ts` files

## Code Style Guidelines

### TypeScript Configuration

- Target: ES2020
- Module: CommonJS
- Strict mode enabled with all strict flags
- `noUnusedLocals: true`, `noImplicitReturns: true`, `noFallthroughCasesInSwitch: true`
- `esModuleInterop: true`
- `resolveJsonModule: true` (JSON imports allowed)
- Root dir: `src/`, Out dir: `dist/`

### Formatting (Prettier)

- Semicolons: never
- Quotes: single
- Trailing commas: none
- Tab width: 4 spaces
- Print width: 120
- Arrow parentheses: avoid when possible
- Line endings: LF (unix)
- Use tabs: false (spaces)

### ESLint Rules

- `linebreak-style: unix`
- `quotes: single`
- `semi: never`
- `prefer-arrow-callback: error`
- `@typescript-eslint/no-explicit-any: warn` (with fixToUnknown: false)
- `@typescript-eslint/comma-dangle: error`
- `no-empty: off`

### Imports

- Use explicit import type for type-only imports: `import type { Foo } from './foo'`
- Node built-ins use `node:` prefix when applicable (e.g., `import { AsyncLocalStorage } from 'node:async_hooks'`)
- Group imports logically: standard library, third-party, local (internal)
- Internal imports use relative paths from `src/` root
- Avoid `import * as` unless necessary; prefer named imports

### Naming Conventions

- Classes: PascalCase (e.g., `Browser`, `SearchManager`)
- Interfaces: PascalCase with `I` prefix optional (project uses PascalCase without prefix)
- Functions/methods: camelCase
- Variables: camelCase
- Constants: UPPER_SNAKE_CASE for true constants; PascalCase for class constants
- Files: PascalCase matching the primary export (e.g., `Browser.ts`, `Logger.ts`)
- Directories: lowercase or kebab-case (project uses PascalCase in src/)

### Error Handling

- Always throw Error objects with descriptive messages
- Use specific error types when appropriate (custom errors in `src/util/ErrorDiagnostic.ts`)
- Log errors via `Logger` before throwing when in a worker context
- Avoid empty catch blocks; at minimum log the error
- Use optional chaining and nullish coalescing for safe access
- Validate inputs with `Validator` utilities

### Type Safety

- Leverage TypeScript strict mode; avoid `any` (ESLint warns)
- Use type inference where obvious; be explicit where needed
- Define interfaces for all data structures (see `src/interface/`)
- Use `unknown` instead of `any` for unknown data
- Prefer `Record<string, unknown>` over `{ [key: string]: any }`
- Use `zod` for runtime validation when interfacing with external data

### Classes & Structure

- Classes use explicit method visibility (`private`, `protected`, `public`)
- Static members marked `static`
- Use constructor injection for dependencies (see `Browser` class)
- Keep classes focused on single responsibility
- Utility classes may use static methods (e.g., `Utils`)

### Async/Await

- Use async/await over raw promises
- Handle promise rejections with try/catch
- Use `Promise.all` for parallel operations when order doesn't matter
- Avoid callback-style; use arrow functions: `arr.map(x => ...)` not `function(x)`

### Comments & Documentation

- JSDoc comments for public classes/methods (not required for internal)
- Inline comments for non-obvious logic
- Multi-line comments use `/* */` style
- Single-line comments use `//`
- TODO comments should include issue reference if applicable

### Logging

- Use `Logger` class for all logging (info, warn, error, debug)
- Log levels: verbose in debug mode, concise in production
- Include contextual information (account email, action being performed)
- Use Ntfy/Discord webhooks for important notifications via `config.json`

### Configuration

- Config in `config.json` with Docker overrides via `CONFIG_*` env vars
- Accounts in flat JSON array `accounts.json`
- Never commit real credentials; use examples as templates
- Changes to config/accounts require rebuild (`npm run build`)

### Browser Automation (Patchright/Playwright)

- Always use `patchright` ( Playwright fork with fingerprinting patches)
- Launch with appropriate browser args (see `Browser.ts`)
- Handle browser context cleanup; use try/finally
- Use `await` for all async Playwright methods
- Implement proper等待 strategies (waitForSelector, expect, etc.)
- Enable stealth features via fingerprint injection

### Cluster Usage

- Main process uses Node.js `cluster` module
- Fork workers based on `config.clusters`
- Inter-process communication via `process.send()`
- Handle worker exit/restart logic gracefully

## Framework-Specific Notes

### Project-Specific Patterns

- Entry point: `src/index.ts` exports `MicrosoftRewardsBot`
- Activities pattern: each activity is a class in `src/functions/activities/`
- Search system: query engines in `src/functions/QueryEngine.ts`
- Dashboard parsing: interface definitions in `src/interface/`
- Browser sessions stored in `config.sessionPath`
- Use `Logger` singleton with IPC for cluster logging

### JSON Configs

- `src/config.json` - script configuration
- `src/accounts.json` - account credentials (gitignored)
- `src/functions/search-queries.json` - search query pool
- `src/functions/bing-search-activity-queries.json` - Bing-specific queries

### Docker Notes

- Multi-stage build: builder (dev deps) → runtime (prod only)
- Uses `npx patchright install --with-deps --only-shell chromium`
- Entrypoint script: `scripts/docker/entrypoint.sh`
- Config/accounts mounted to `./config/` in container
- Cron template: `src/crontab.template`

## Cursor & Copilot

No Cursor rules or Copilot instructions present in repository. Follow this AGENTS.md for all guidelines.

## Summary

- TypeScript strict, CommonJS, Node 24+
- Prettier: 4 spaces, no semis, single quotes, width 120
- ESLint: @typescript-eslint, prefer arrow callbacks
- Build: `npm run build` → `dist/`
- Structure: src/ (TS) → dist/ (JS)
- No tests configured yet; add vitest if needed
