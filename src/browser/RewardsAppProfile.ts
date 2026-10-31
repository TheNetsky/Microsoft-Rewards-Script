import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator'

export const DESKTOP_APP_PROFILE = {
    appVersion: '1.3.0',
    platformVersion: '10.0.0',
    source: 'msrewards-desktop'
} as const

function getDesktopAppUserAgent(engineVersion: string) {
    const version = /\b\d+\.\d+\.\d+\.\d+\b/.exec(engineVersion)?.[0]
    if (!version) throw new Error(`Invalid Rewards app browser version: ${engineVersion}`)
    const profile = DESKTOP_APP_PROFILE
    const major = version.split('.')[0]!
    const fullVersionList = [
        { brand: 'Microsoft Edge', version },
        { brand: 'Not?A_Brand', version: '24.0.0.0' },
        { brand: 'Chromium', version },
        { brand: 'Microsoft Edge WebView2', version }
    ]
    return {
        userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36 Edg/${major}.0.0.0 MSRewards/Desktop/${profile.appVersion}`,
        userAgentMetadata: {
            brands: fullVersionList.map(({ brand, version }) => ({ brand, version: version.split('.')[0]! })),
            fullVersionList,
            mobile: false,
            platform: 'Windows',
            platformVersion: profile.platformVersion,
            architecture: 'x86',
            bitness: '64',
            model: '',
            uaFullVersion: version,
            wow64: false
        }
    }
}

export function isDesktopAppFingerprint(fingerprint: BrowserFingerprintWithHeaders): boolean {
    return /\bMSRewards\/Desktop\//.test(fingerprint.fingerprint.navigator.userAgent)
}

export function applyDesktopAppFingerprint(
    fingerprint: BrowserFingerprintWithHeaders,
    engineVersion: string
): BrowserFingerprintWithHeaders {
    const { userAgent, userAgentMetadata: meta } = getDesktopAppUserAgent(engineVersion)
    const navigator = fingerprint.fingerprint.navigator
    navigator.userAgent = userAgent
    navigator.appVersion = userAgent.replace(/^Mozilla\//, '')
    navigator.platform = 'Win32'
    navigator.userAgentData = meta
    for (const name of Object.keys(fingerprint.headers)) {
        if (/^(?:user-agent|sec-ch-ua.*|x-rewards-source|sec-ms-gec.*)$/i.test(name)) delete fingerprint.headers[name]
    }
    for (const [name, value] of Object.entries(desktopAppRequestHeaders(engineVersion))) {
        fingerprint.headers[name.toLowerCase()] = value
    }
    return fingerprint
}

const serializeBrands = (brands: { brand: string; version: string }[]) =>
    brands.map(({ brand, version }) => `"${brand}";v="${version}"`).join(', ')

export function desktopAppRequestHeaders(engineVersion: string): Record<string, string> {
    const { userAgent, userAgentMetadata: meta } = getDesktopAppUserAgent(engineVersion)
    return {
        'User-Agent': userAgent,
        'sec-ch-ua': serializeBrands(meta.brands),
        'sec-ch-ua-full-version': `"${meta.uaFullVersion}"`,
        'sec-ch-ua-full-version-list': serializeBrands(meta.fullVersionList),
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-model': '""',
        'sec-ch-ua-platform': '"Windows"',
        'sec-ch-ua-platform-version': `"${meta.platformVersion}"`,
        'sec-ch-ua-arch': '"x86"',
        'sec-ch-ua-bitness': '"64"',
        'x-rewards-source': DESKTOP_APP_PROFILE.source
    }
}
