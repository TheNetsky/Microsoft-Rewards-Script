import axios from 'axios'
import { BrowserFingerprintWithHeaders } from 'fingerprint-generator'

import { log } from './Logger'
import Retry from './Retry'

import { ChromeVersion, EdgeVersion, Architecture, Platform } from '../interface/UserAgentUtil'

const NOT_A_BRAND_VERSION = '99'
const EDGE_VERSION_URL = 'https://edgeupdates.microsoft.com/api/products'
const EDGE_VERSION_CACHE_TTL_MS = 1000 * 60 * 60

// Static fallback versions (updated periodically, valid as of October 2024)
const FALLBACK_EDGE_VERSIONS: EdgeVersionResult = {
    android: '130.0.2849.66',
    windows: '130.0.2849.68'
}

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

export async function getEdgeVersions(isMobile: boolean): Promise<EdgeVersionResult> {
    const now = Date.now()
    
    // Return cached version if still valid
    if (edgeVersionCache && edgeVersionCache.expiresAt > now) {
        return edgeVersionCache.data
    }

    // Wait for in-flight request if one exists
    if (edgeVersionInFlight) {
        try {
            return await edgeVersionInFlight
        } catch (error) {
            if (edgeVersionCache) {
                log(isMobile, 'USERAGENT-EDGE-VERSION', 'Using cached Edge versions after in-flight failure', 'warn')
                return edgeVersionCache.data
            }
            // Fall through to fetch attempt below
        }
    }

    // Attempt to fetch fresh versions
    const fetchPromise = fetchEdgeVersionsWithRetry(isMobile)
        .then(result => {
            edgeVersionCache = { data: result, expiresAt: Date.now() + EDGE_VERSION_CACHE_TTL_MS }
            edgeVersionInFlight = null
            return result
        })
        .catch(() => {
            edgeVersionInFlight = null
            
            // Try stale cache first
            if (edgeVersionCache) {
                log(isMobile, 'USERAGENT-EDGE-VERSION', 'Using stale cached Edge versions due to fetch failure', 'warn')
                return edgeVersionCache.data
            }
            
            // Fall back to static versions
            log(isMobile, 'USERAGENT-EDGE-VERSION', 'Using static fallback Edge versions (API unavailable)', 'warn')
            edgeVersionCache = { data: FALLBACK_EDGE_VERSIONS, expiresAt: Date.now() + EDGE_VERSION_CACHE_TTL_MS }
            return FALLBACK_EDGE_VERSIONS
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
    let lastError: unknown = null
    
    // Try axios first
    try {
        const response = await axios<EdgeVersion[]>({
            url: EDGE_VERSION_URL,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000,
            validateStatus: (status) => status === 200
        })
        
        if (!response.data || !Array.isArray(response.data)) {
            throw new Error('Invalid response format from Edge API')
        }
        
        return mapEdgeVersions(response.data)
    } catch (axiosError) {
        lastError = axiosError
        // Continue to fallback
    }

    // Try native fetch as fallback
    try {
        const fallback = await tryNativeFetchFallback()
        if (fallback) {
            log(isMobile, 'USERAGENT-EDGE-VERSION', 'Axios failed, using native fetch fallback', 'warn')
            return fallback
        }
    } catch (fetchError) {
        lastError = fetchError
    }
    
    // Both methods failed
    const errorMsg = lastError instanceof Error ? lastError.message : String(lastError)
    throw new Error(`Failed to fetch Edge versions: ${errorMsg}`)
}

async function tryNativeFetchFallback(): Promise<EdgeVersionResult | null> {
    let timeoutHandle: NodeJS.Timeout | undefined
    try {
        const controller = new AbortController()
        timeoutHandle = setTimeout(() => controller.abort(), 10000)
        
        const response = await fetch(EDGE_VERSION_URL, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            signal: controller.signal
        })
        
        clearTimeout(timeoutHandle)
        timeoutHandle = undefined
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
        }
        
        const data = await response.json() as EdgeVersion[]
        
        if (!Array.isArray(data)) {
            throw new Error('Invalid response format')
        }
        
        return mapEdgeVersions(data)
    } catch (error) {
        if (timeoutHandle) clearTimeout(timeoutHandle)
        return null
    }
}

function mapEdgeVersions(data: EdgeVersion[]): EdgeVersionResult {
    if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Edge API returned empty or invalid data')
    }
    
    const stable = data.find(entry => entry?.Product?.toLowerCase() === 'stable')
        ?? data.find(entry => entry?.Product && /stable/i.test(entry.Product))
    
    if (!stable || !stable.Releases || !Array.isArray(stable.Releases)) {
        throw new Error('Stable Edge channel not found or invalid format')
    }

    const androidRelease = stable.Releases.find(release => 
        release?.Platform === Platform.Android && release?.ProductVersion
    )
    
    const windowsRelease = stable.Releases.find(release => 
        release?.Platform === Platform.Windows && 
        release?.Architecture === Architecture.X64 && 
        release?.ProductVersion
    ) ?? stable.Releases.find(release => 
        release?.Platform === Platform.Windows && 
        release?.ProductVersion
    )

    const result: EdgeVersionResult = {
        android: androidRelease?.ProductVersion,
        windows: windowsRelease?.ProductVersion
    }
    
    // Validate at least one version was found
    if (!result.android && !result.windows) {
        throw new Error('No valid Edge versions found in API response')
    }

    return result
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

        return fingerprint
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        log(isMobile, 'USER-AGENT-UPDATE', `Failed to update fingerprint: ${errorMsg}`, 'error')
        throw new Error(`User-Agent update failed: ${errorMsg}`)
    }
}