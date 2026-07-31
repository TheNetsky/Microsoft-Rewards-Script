import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator'

import type { Account } from '../interface/Account'

export interface AccountLocale {
    language: string
    country?: string
    locale: string
    acceptedLocales: string[]
    acceptLanguage: string
}

type LocaleAccount = Pick<Account, 'langCode' | 'geoLocale'>

export function normalizeLanguageTag(value: string): string {
    return new Intl.Locale(value.trim()).toString()
}

export function normalizeCountry(value: string | undefined): string | undefined {
    if (!value) return undefined
    const normalized = value.trim().toUpperCase()
    return /^[A-Z]{2}$/.test(normalized) ? normalized : undefined
}

export function resolveAccountLocale(account: LocaleAccount, resolvedCountry?: string): AccountLocale {
    const languageTag = normalizeLanguageTag(account.langCode || 'en')
    const parsedLanguage = new Intl.Locale(languageTag)
    const language = parsedLanguage.language.toLowerCase()
    const configuredCountry =
        account.geoLocale.toLowerCase() === 'auto' ? undefined : normalizeCountry(account.geoLocale)
    const languageCountry = normalizeCountry(parsedLanguage.region)
    const country = configuredCountry ?? normalizeCountry(resolvedCountry) ?? languageCountry
    const localeCountry = country ?? languageCountry
    const locale = localeCountry
        ? new Intl.Locale(languageTag, { region: localeCountry }).toString()
        : parsedLanguage.toString()
    const acceptedLocales = locale.toLowerCase() === language ? [language] : [locale, language]
    const acceptLanguage = acceptedLocales
        .map((acceptedLocale, index) => (index === 0 ? acceptedLocale : `${acceptedLocale};q=${1 - index * 0.1}`))
        .join(',')

    return {
        language,
        ...(country ? { country } : {}),
        locale,
        acceptedLocales,
        acceptLanguage
    }
}

export function fingerprintMatchesLocale(fingerprint: BrowserFingerprintWithHeaders, expected: AccountLocale): boolean {
    try {
        const navigatorLocale = normalizeLanguageTag(fingerprint.fingerprint.navigator.language)
        const acceptLanguageEntry = Object.entries(fingerprint.headers).find(
            ([name]) => name.toLowerCase() === 'accept-language'
        )
        const headerLocale = acceptLanguageEntry?.[1]?.split(',')[0]?.trim()

        return (
            navigatorLocale.toLowerCase() === expected.locale.toLowerCase() &&
            Boolean(headerLocale) &&
            normalizeLanguageTag(headerLocale!).toLowerCase() === expected.locale.toLowerCase()
        )
    } catch {
        return false
    }
}
