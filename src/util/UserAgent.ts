import axios from 'axios'
import { BrowserFingerprintWithHeaders } from 'fingerprint-generator'

import { log } from './Logger'
import Retry from './Retry'

import { ChromeVersion, EdgeVersion, Architecture, Platform } from '../interface/UserAgentUtil'

const NOT_A_BRAND_VERSION = '99'
const EDGE_VERSION_URL = 'https://edgeupdates.microsoft.com/api/products'
const EDGE_VERSION_CACHE_TTL_MS = 1000 * 60 * 60

type EdgeVersionResult = {
    android?: string
    windows?: string
}

let edgeVersionCache: { data: EdgeVersionResult; expiresAt: number } | null = null
let edgeVersionInFlight: Promise<EdgeVersionResult> | null = null

export async function getUserAgent(isMobile: boolean) {
    const system = getSystemComponents(isMobile)
    const app = await getAppComponents(isMobile)

    const uaTemplate = isMobile ?
        `Mozilla/5.0 (${system}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${app.chrome_reduced_version} Mobile Safari/537.36 EdgA/${app.edge_version}` :
        `Mozilla/5.0 (${system}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${app.chrome_reduced_version} Safari/537.36 Edg/${app.edge_version}`

    const platformVersion = `${isMobile ? Math.floor(Math.random() * 5) + 9 : Math.floor(Math.random() * 15) + 1}.0.0`

    const uaMetadata = {
        mobile: isMobile,
        isMobile,
        platform: isMobile ? 'Android' : 'Windows',
        fullVersionList: [
            { brand: 'Not/A)Brand', version: `${NOT_A_BRAND_VERSION}.0.0.0` },
            { brand: 'Microsoft Edge', version: app['edge_version'] },
            { brand: 'Chromium', version: app['chrome_version'] }
        ],
        brands: [
            { brand: 'Not/A)Brand', version: NOT_A_BRAND_VERSION },
            { brand: 'Microsoft Edge', version: app['edge_major_version'] },
            { brand: 'Chromium', version: app['chrome_major_version'] }
        ],
        platformVersion,
        architecture: isMobile ? '' : 'x86',
        bitness: isMobile ? '' : '64',
        model: '',
        uaFullVersion: app['chrome_version']
    }

    return { userAgent: uaTemplate, userAgentMetadata: uaMetadata }
}

export async function getChromeVersion(isMobile: boolean): Promise<string> {
    try {
        const request = {
            url: 'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        }

        const response = await axios(request)
        const data: ChromeVersion = response.data
        return data.channels.Stable.version

    } catch (error) {
        throw log(isMobile, 'USERAGENT-CHROME-VERSION', 'An error occurred:' + error, 'error')
    }
}

export async function getEdgeVersions(isMobile: boolean) {
    const now = Date.now()
    if (edgeVersionCache && edgeVersionCache.expiresAt > now) {
        return edgeVersionCache.data
    }

    if (edgeVersionInFlight) {
        try {
            return await edgeVersionInFlight
        } catch (error) {
            if (edgeVersionCache) {
                log(isMobile, 'USERAGENT-EDGE-VERSION', 'Using cached Edge versions after in-flight failure: ' + formatEdgeError(error), 'warn')
                return edgeVersionCache.data
            }
            throw error
        }
    }

    const fetchPromise = fetchEdgeVersionsWithRetry(isMobile)
        .then(result => {
            edgeVersionCache = { data: result, expiresAt: Date.now() + EDGE_VERSION_CACHE_TTL_MS }
            edgeVersionInFlight = null
            return result
        })
        .catch(error => {
            edgeVersionInFlight = null
            if (edgeVersionCache) {
                log(isMobile, 'USERAGENT-EDGE-VERSION', 'Falling back to cached Edge versions: ' + formatEdgeError(error), 'warn')
                return edgeVersionCache.data
            }
            throw log(isMobile, 'USERAGENT-EDGE-VERSION', 'Failed to fetch Edge versions: ' + formatEdgeError(error), 'error')
        })

    edgeVersionInFlight = fetchPromise
    return fetchPromise
}

export function getSystemComponents(mobile: boolean): string {
    if (mobile) {
        const androidVersion = 10 + Math.floor(Math.random() * 5)
        return `Linux; Android ${androidVersion}; K`
    }

    return 'Windows NT 10.0; Win64; x64'
}

export async function getAppComponents(isMobile: boolean) {
    const versions = await getEdgeVersions(isMobile)
    const edgeVersion = isMobile ? versions.android : versions.windows as string
    const edgeMajorVersion = edgeVersion?.split('.')[0]

    const chromeVersion = await getChromeVersion(isMobile)
    const chromeMajorVersion = chromeVersion?.split('.')[0]
    const chromeReducedVersion = `${chromeMajorVersion}.0.0.0`

    return {
        not_a_brand_version: `${NOT_A_BRAND_VERSION}.0.0.0`,
        not_a_brand_major_version: NOT_A_BRAND_VERSION,
        edge_version: edgeVersion as string,
        edge_major_version: edgeMajorVersion as string,
        chrome_version: chromeVersion as string,
        chrome_major_version: chromeMajorVersion as string,
        chrome_reduced_version: chromeReducedVersion as string
    }
}

async function fetchEdgeVersionsWithRetry(isMobile: boolean): Promise<EdgeVersionResult> {
    const retry = new Retry()
    return retry.run(async () => {
        const versions = await fetchEdgeVersionsOnce(isMobile)
        if (!versions.android && !versions.windows) {
            throw new Error('Stable Edge releases did not include Android or Windows versions')
        }
        return versions
    }, () => true)
}

async function fetchEdgeVersionsOnce(isMobile: boolean): Promise<EdgeVersionResult> {
    try {
        const response = await axios<EdgeVersion[]>({
            url: EDGE_VERSION_URL,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (compatible; rewards-bot/2.1)' // Provide UA to avoid stricter servers
            },
            timeout: 10000
        })
        return mapEdgeVersions(response.data)

    } catch (primaryError) {
        const fallback = await tryNativeFetchFallback(isMobile)
        if (fallback) {
            log(isMobile, 'USERAGENT-EDGE-VERSION', 'Axios failed, native fetch succeeded: ' + formatEdgeError(primaryError), 'warn')
            return fallback
        }
        throw primaryError
    }
}

async function tryNativeFetchFallback(isMobile: boolean): Promise<EdgeVersionResult | null> {
    try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10000)
        const response = await fetch(EDGE_VERSION_URL, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (compatible; rewards-bot/2.1)'
            },
            signal: controller.signal
        })
        clearTimeout(timeout)
        if (!response.ok) {
            throw new Error('HTTP ' + response.status)
        }
        const data = await response.json() as EdgeVersion[]
        return mapEdgeVersions(data)
    } catch (error) {
        log(isMobile, 'USERAGENT-EDGE-VERSION', 'Native fetch fallback failed: ' + formatEdgeError(error), 'warn')
        return null
    }
}

function mapEdgeVersions(data: EdgeVersion[]): EdgeVersionResult {
    const stable = data.find(entry => entry.Product.toLowerCase() === 'stable')
        ?? data.find(entry => /stable/i.test(entry.Product))
    if (!stable) {
        throw new Error('Stable Edge channel not found in response payload')
    }

    const androidRelease = stable.Releases.find(release => release.Platform === Platform.Android)
    const windowsRelease = stable.Releases.find(release => release.Platform === Platform.Windows && release.Architecture === Architecture.X64)
        ?? stable.Releases.find(release => release.Platform === Platform.Windows)

    return {
        android: androidRelease?.ProductVersion,
        windows: windowsRelease?.ProductVersion
    }
}

function formatEdgeError(error: unknown): string {
    if (isAggregateErrorLike(error)) {
        const inner = error.errors
            .map(innerErr => formatEdgeError(innerErr))
            .filter(Boolean)
            .join('; ')
        const message = error.message || 'AggregateError'
        return inner ? `${message} | causes: ${inner}` : message
    }

    if (error instanceof Error) {
        const parts = [`${error.name}: ${error.message}`]
        const cause = getErrorCause(error)
        if (cause) {
            parts.push('cause => ' + formatEdgeError(cause))
        }
        return parts.join(' | ')
    }

    return String(error)
}

type AggregateErrorLike = { message?: string; errors: unknown[] }

function isAggregateErrorLike(error: unknown): error is AggregateErrorLike {
    if (!error || typeof error !== 'object') {
        return false
    }
    const candidate = error as { errors?: unknown }
    return Array.isArray(candidate.errors)
}

function getErrorCause(error: { cause?: unknown } | Error): unknown {
    if (typeof (error as { cause?: unknown }).cause === 'undefined') {
        return undefined
    }
    return (error as { cause?: unknown }).cause
}

export async function updateFingerprintUserAgent(fingerprint: BrowserFingerprintWithHeaders, isMobile: boolean): Promise<BrowserFingerprintWithHeaders> {
    try {
        const userAgentData = await getUserAgent(isMobile)
        const componentData = await getAppComponents(isMobile)

        fingerprint.fingerprint.navigator.userAgentData = userAgentData.userAgentMetadata
        fingerprint.fingerprint.navigator.userAgent = userAgentData.userAgent
        fingerprint.fingerprint.navigator.appVersion = userAgentData.userAgent.replace(`${fingerprint.fingerprint.navigator.appCodeName}/`, '')

        fingerprint.headers['user-agent'] = userAgentData.userAgent
        fingerprint.headers['sec-ch-ua'] = `"Microsoft Edge";v="${componentData.edge_major_version}", "Not=A?Brand";v="${componentData.not_a_brand_major_version}", "Chromium";v="${componentData.chrome_major_version}"`
        fingerprint.headers['sec-ch-ua-full-version-list'] = `"Microsoft Edge";v="${componentData.edge_version}", "Not=A?Brand";v="${componentData.not_a_brand_version}", "Chromium";v="${componentData.chrome_version}"`

        /*
        Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 EdgA/129.0.0.0
        sec-ch-ua-full-version-list: "Microsoft Edge";v="129.0.2792.84", "Not=A?Brand";v="8.0.0.0", "Chromium";v="129.0.6668.90"
        sec-ch-ua: "Microsoft Edge";v="129", "Not=A?Brand";v="8", "Chromium";v="129"

        Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36
        "Google Chrome";v="129.0.6668.90", "Not=A?Brand";v="8.0.0.0", "Chromium";v="129.0.6668.90"
        */

        return fingerprint
    } catch (error) {
        throw log(isMobile, 'USER-AGENT-UPDATE', 'An error occurred:' + error, 'error')
    }
}