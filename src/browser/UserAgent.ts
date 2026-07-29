import { URLs } from '../constants/urls'
import { httpRequest } from '../util/Http'
import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator'

import { BROWSER_VERSION_FALLBACKS } from '../constants/browserVersions'
import type { ChromeVersion, EdgeVersion } from '../interface/UserAgentUtil'
import type { MicrosoftRewardsBot } from '../index'

interface EdgeVersions {
    android: string
    windows: string
}

interface AppComponents {
    not_a_brand_version: string
    not_a_brand_major_version: string
    edge_version: string
    edge_major_version: string
    chrome_version: string
    chrome_major_version: string
    chrome_reduced_version: string
}

export class UserAgentManager {
    private static readonly NOT_A_BRAND_VERSION = '99'
    private static readonly VERSION_LOOKUP_TIMEOUT_MS = 5000
    private static readonly VERSION_PATTERN = /^\d+\.\d+\.\d+\.\d+$/
    private readonly appComponents = new Map<boolean, Promise<AppComponents>>()

    private static readonly MOBILE_MODELS = [
        // Samsung Galaxy S series
        'SM-S948B', // Galaxy S26 Ultra
        'SM-S947B', // Galaxy S26+
        'SM-S942B', // Galaxy S26
        'SM-S938B', // Galaxy S25 Ultra
        'SM-S937B', // Galaxy S25 Edge
        'SM-S936B', // Galaxy S25+
        'SM-S931B', // Galaxy S25
        'SM-S928B', // Galaxy S24 Ultra
        'SM-S926B', // Galaxy S24+
        'SM-S921B', // Galaxy S24
        'SM-S918B', // Galaxy S23 Ultra
        'SM-S916B', // Galaxy S23+
        'SM-S911B', // Galaxy S23

        // Samsung Galaxy Z series
        'SM-F966B', // Galaxy Z Fold7
        'SM-F956B', // Galaxy Z Fold6
        'SM-F946B', // Galaxy Z Fold5
        'SM-F741B', // Galaxy Z Flip6
        'SM-F731B', // Galaxy Z Flip5

        // Samsung
        'SM-A566B', // Galaxy A56 5G
        'SM-A556B', // Galaxy A55 5G
        'SM-A546B', // Galaxy A54 5G
        'SM-A356B', // Galaxy A35 5G
        'SM-A346B', // Galaxy A34 5G
        'SM-A266B', // Galaxy A26 5G
        'SM-A256B', // Galaxy A25 5G
        'SM-A166B', // Galaxy A16 5G
        'SM-A156B', // Galaxy A15 5G

        // Google Pixel
        'Pixel 10 Pro Fold',
        'Pixel 10 Pro XL',
        'Pixel 10 Pro',
        'Pixel 10',
        'Pixel 10a',
        'Pixel 9 Pro Fold',
        'Pixel 9 Pro XL',
        'Pixel 9 Pro',
        'Pixel 9',
        'Pixel 9a',
        'Pixel 8 Pro',
        'Pixel 8',
        'Pixel 8a',
        'Pixel 7 Pro',
        'Pixel 7',
        'Pixel 7a',
        'Pixel Fold',

        // OnePlus
        'CPH2653', // OnePlus 13
        'CPH2649', // OnePlus 13
        'CPH2655', // OnePlus 13
        'CPH2581', // OnePlus 12
        'CPH2573', // OnePlus 12
        'CPH2449', // OnePlus 11
        'CPH2415', // OnePlus 10T

        // Nothing
        'A059', // Nothing Phone (3a)
        'A059P', // Nothing Phone (3a) Pro
        'A142', // Nothing Phone (2a)
        'A065', // Nothing Phone (2)

        // Motorola
        'motorola edge 50 pro',
        'motorola edge 50 neo',
        'motorola edge 40 pro',
        'moto g85 5G',
        'moto g84 5G',
        'moto g54 5G'
    ]

    constructor(
        private bot: MicrosoftRewardsBot,
        private readonly request: typeof httpRequest = httpRequest
    ) {}

    private static pickMobileModel(): string {
        const pool = UserAgentManager.MOBILE_MODELS
        return pool[Math.floor(Math.random() * pool.length)] ?? 'Pixel 8'
    }

    async getUserAgent(isMobile: boolean) {
        const androidVersion = isMobile ? 10 + Math.floor(Math.random() * 6) : 0 // Android 10-15
        const system = this.getSystemComponents(isMobile, androidVersion)
        const app = await this.getAppComponents(isMobile)

        const uaTemplate = isMobile
            ? `Mozilla/5.0 (${system}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${app.chrome_reduced_version} Mobile Safari/537.36 EdgA/${app.edge_version}`
            : `Mozilla/5.0 (${system}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${app.chrome_reduced_version} Safari/537.36 Edg/${app.edge_version}`

        const platformVersion = isMobile ? `${androidVersion}.0.0` : `${Math.floor(Math.random() * 15) + 1}.0.0`

        // Keep the UA-CH platform aligned with the UA string's OS token
        const desktopPlatform =
            process.platform === 'darwin' ? 'macOS' : process.platform === 'linux' ? 'Linux' : 'Windows'

        const model = isMobile ? UserAgentManager.pickMobileModel() : ''

        const uaMetadata = {
            isMobile,
            platform: isMobile ? 'Android' : desktopPlatform,
            fullVersionList: [
                { brand: 'Not/A)Brand', version: `${UserAgentManager.NOT_A_BRAND_VERSION}.0.0.0` },
                { brand: 'Microsoft Edge', version: app['edge_version'] },
                { brand: 'Chromium', version: app['chrome_version'] }
            ],
            brands: [
                { brand: 'Not/A)Brand', version: UserAgentManager.NOT_A_BRAND_VERSION },
                { brand: 'Microsoft Edge', version: app['edge_major_version'] },
                { brand: 'Chromium', version: app['chrome_major_version'] }
            ],
            platformVersion,
            architecture: isMobile ? '' : 'x86',
            bitness: isMobile ? '' : '64',
            model
        }

        return { userAgent: uaTemplate, userAgentMetadata: uaMetadata }
    }

    async getChromeVersion(isMobile: boolean): Promise<string> {
        try {
            const request = {
                url: URLs.userAgent.chromeVersions,
                method: 'GET',
                timeout: UserAgentManager.VERSION_LOOKUP_TIMEOUT_MS,
                headers: {
                    'Content-Type': 'application/json'
                }
            }

            const response = await this.request<ChromeVersion>(request)
            const version = response.data?.channels?.Stable?.version
            if (!UserAgentManager.isValidVersion(version)) {
                throw new Error('Stable Chrome version was missing or invalid')
            }
            return version
        } catch (error) {
            const fallback = BROWSER_VERSION_FALLBACKS.chrome
            this.bot.logger.warn(
                isMobile,
                'USERAGENT-CHROME-VERSION',
                `Version lookup unavailable (${error instanceof Error ? error.message : String(error)}); using bundled fallback ${fallback}`
            )
            return fallback
        }
    }

    async getEdgeVersions(isMobile: boolean): Promise<EdgeVersions> {
        try {
            const request = {
                url: URLs.edge.products,
                method: 'GET',
                timeout: UserAgentManager.VERSION_LOOKUP_TIMEOUT_MS,
                headers: {
                    'Content-Type': 'application/json'
                }
            }

            const response = await this.request<EdgeVersion[]>(request)
            const stable = Array.isArray(response.data)
                ? response.data.find(product => product.Product === 'Stable')
                : undefined
            const android = stable?.Releases.find(release => release.Platform === 'Android')?.ProductVersion
            const windows = stable?.Releases.find(
                release => release.Platform === 'Windows' && release.Architecture === 'x64'
            )?.ProductVersion

            if (!UserAgentManager.isValidVersion(android) || !UserAgentManager.isValidVersion(windows)) {
                throw new Error('Stable Edge versions were missing or invalid')
            }

            return { android, windows }
        } catch (error) {
            const fallback = BROWSER_VERSION_FALLBACKS.edge
            this.bot.logger.warn(
                isMobile,
                'USERAGENT-EDGE-VERSION',
                `Version lookup unavailable (${error instanceof Error ? error.message : String(error)}); using bundled fallbacks Android ${fallback.android}, Windows ${fallback.windows}`
            )
            return fallback
        }
    }

    getSystemComponents(mobile: boolean, androidVersion = 13): string {
        if (mobile) {
            return `Linux; Android ${androidVersion}; K`
        }

        switch (process.platform) {
            case 'darwin':
                return 'Macintosh; Intel Mac OS X 10_15_7'
            case 'linux':
                return 'X11; Linux x86_64'
            default:
                return 'Windows NT 10.0; Win64; x64'
        }
    }

    getAppComponents(isMobile: boolean): Promise<AppComponents> {
        const cached = this.appComponents.get(isMobile)
        if (cached) return cached

        const pending = this.loadAppComponents(isMobile)
        this.appComponents.set(isMobile, pending)
        return pending
    }

    private async loadAppComponents(isMobile: boolean): Promise<AppComponents> {
        const [versions, chromeVersion] = await Promise.all([
            this.getEdgeVersions(isMobile),
            this.getChromeVersion(isMobile)
        ])
        const edgeVersion = isMobile ? versions.android : versions.windows
        const edgeMajorVersion = edgeVersion.split('.')[0]!
        const chromeMajorVersion = chromeVersion.split('.')[0]!

        return {
            not_a_brand_version: `${UserAgentManager.NOT_A_BRAND_VERSION}.0.0.0`,
            not_a_brand_major_version: UserAgentManager.NOT_A_BRAND_VERSION,
            edge_version: edgeVersion,
            edge_major_version: edgeMajorVersion,
            chrome_version: chromeVersion,
            chrome_major_version: chromeMajorVersion,
            chrome_reduced_version: `${chromeMajorVersion}.0.0.0`
        }
    }

    private static isValidVersion(version: unknown): version is string {
        return typeof version === 'string' && UserAgentManager.VERSION_PATTERN.test(version)
    }

    async updateFingerprintUserAgent(
        fingerprint: BrowserFingerprintWithHeaders,
        isMobile: boolean
    ): Promise<BrowserFingerprintWithHeaders> {
        try {
            const userAgentData = await this.getUserAgent(isMobile)
            const componentData = await this.getAppComponents(isMobile)
            const meta = userAgentData.userAgentMetadata

            //@ts-expect-error Errors due it not exactly matching
            fingerprint.fingerprint.navigator.userAgentData = meta
            fingerprint.fingerprint.navigator.userAgent = userAgentData.userAgent
            fingerprint.fingerprint.navigator.appVersion = userAgentData.userAgent.replace(
                `${fingerprint.fingerprint.navigator.appCodeName}/`,
                ''
            )

            fingerprint.headers['user-agent'] = userAgentData.userAgent
            fingerprint.headers['sec-ch-ua'] =
                `"Microsoft Edge";v="${componentData.edge_major_version}", "Not=A?Brand";v="${componentData.not_a_brand_major_version}", "Chromium";v="${componentData.chrome_major_version}"`
            fingerprint.headers['sec-ch-ua-full-version-list'] =
                `"Microsoft Edge";v="${componentData.edge_version}", "Not=A?Brand";v="${componentData.not_a_brand_version}", "Chromium";v="${componentData.chrome_version}"`
            fingerprint.headers['sec-ch-ua-mobile'] = meta.isMobile ? '?1' : '?0'
            fingerprint.headers['sec-ch-ua-platform'] = `"${meta.platform}"`
            fingerprint.headers['sec-ch-ua-platform-version'] = `"${meta.platformVersion}"`
            fingerprint.headers['sec-ch-ua-arch'] = `"${meta.architecture}"`
            fingerprint.headers['sec-ch-ua-bitness'] = `"${meta.bitness}"`
            fingerprint.headers['sec-ch-ua-model'] = `"${meta.model}"`

            /*
            Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 EdgA/129.0.0.0
            sec-ch-ua-full-version-list: "Microsoft Edge";v="129.0.2792.84", "Not=A?Brand";v="8.0.0.0", "Chromium";v="129.0.6668.90"
            sec-ch-ua: "Microsoft Edge";v="129", "Not=A?Brand";v="8", "Chromium";v="129"
    
            Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36
            "Google Chrome";v="129.0.6668.90", "Not=A?Brand";v="8.0.0.0", "Chromium";v="129.0.6668.90"
            */

            return fingerprint
        } catch (error) {
            this.bot.logger.error(
                isMobile,
                'USER-AGENT-UPDATE',
                `An error occurred: ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }
}
