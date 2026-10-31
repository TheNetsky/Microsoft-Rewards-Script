import type { AccountProxy } from '../../src/core/Account'
import type { LaunchOptions } from 'patchright'
export function parseBrowserProxyUrl(value: string): URL
export function proxyValidationIssues(settings?: AccountProxy): { field: keyof AccountProxy; message: string }[]
export function buildBrowserProxy(settings?: AccountProxy): LaunchOptions['proxy'] | null
