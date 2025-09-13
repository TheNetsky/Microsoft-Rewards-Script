// Minimal module declaration to silence TS complaints if upstream types not found.
// You should replace with actual types if the package provides them.

// Basic playwright stubs (only what we currently need). Replace with real @types if available.
declare module 'playwright' {
  export interface Cookie { name: string; value: string; domain?: string; path?: string; expires?: number; httpOnly?: boolean; secure?: boolean; sameSite?: 'Lax'|'Strict'|'None' }
  export interface BrowserContext {
    newPage(): Promise<Page>
    setDefaultTimeout(timeout: number): void
    addCookies(cookies: Cookie[]): Promise<void>
    cookies(): Promise<Cookie[]>
    pages(): Page[]
    close(): Promise<void>
  }
  export interface Browser {
    newPage(): Promise<Page>
    context(): BrowserContext
    close(): Promise<void>
    pages?(): Page[]
  }
  export interface Keyboard {
    type(text: string): Promise<any>
    press(key: string): Promise<any>
    down(key: string): Promise<any>
    up(key: string): Promise<any>
  }
  export interface Locator {
    first(): Locator
    click(opts?: any): Promise<any>
    isVisible(opts?: any): Promise<boolean>
    nth(index: number): Locator
  }
  export interface Page {
    goto(url: string, opts?: any): Promise<any>
    waitForLoadState(state?: string, opts?: any): Promise<any>
    waitForSelector(selector: string, opts?: any): Promise<any>
    fill(selector: string, value: string): Promise<any>
    keyboard: Keyboard
    click(selector: string, opts?: any): Promise<any>
    close(): Promise<any>
    url(): string
    route(match: string, handler: any): Promise<any>
    locator(selector: string): Locator
    $: (selector: string) => Promise<any>
    context(): BrowserContext
    reload(opts?: any): Promise<any>
    evaluate<R=any>(pageFunction: any, arg?: any): Promise<R>
    content(): Promise<string>
    waitForTimeout(timeout: number): Promise<void>
  }
  export interface ChromiumType { launch(opts?: any): Promise<Browser> }
  export const chromium: ChromiumType
}

declare module 'rebrowser-playwright' {
  export * from 'playwright'
}
