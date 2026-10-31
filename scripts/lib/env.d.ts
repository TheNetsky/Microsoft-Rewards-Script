export function envStrFrom(sourceEnv: NodeJS.ProcessEnv, key: string): string | undefined
export function envStr(key: string, sourceEnv?: NodeJS.ProcessEnv): string | undefined
export function envBool(key: string, fallback: boolean, sourceEnv?: NodeJS.ProcessEnv): boolean
export function accountIndexesFromEnv(sourceEnv?: NodeJS.ProcessEnv): number[]
export function normalizeLanguageCode(value?: string): string
export function normalizeGeoLocale(value?: string): string
export function loadAccountSettings(
    sourceEnv?: NodeJS.ProcessEnv,
    onWarning?: (message: string) => void
): import('../../src/core/Account').Account[]
