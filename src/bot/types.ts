import type { BrowserContext } from 'patchright'
import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator'

import type { Account } from '../interface/Account'

export interface ExecutionContext {
    isMobile: boolean
    account: Account
}

export interface BrowserSession {
    context: BrowserContext
    fingerprint: BrowserFingerprintWithHeaders
}

export interface AccountStats {
    email: string
    initialPoints: number
    finalPoints: number
    collectedPoints: number
    duration: number
    success: boolean
    error?: string
}

export interface UserData {
    userName: string
    geoLocale: string
    langCode: string
    timezoneOffset: string
    initialPoints: number
    currentPoints: number
    gainedPoints: number
}
