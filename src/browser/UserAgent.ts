import { Session } from 'httpcloak'
import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator'

import type { ChromeVersion, EdgeVersion } from '../interface/UserAgentUtil'
import type { MicrosoftRewardsBot } from '../index'

export class UserAgentManager {
    private static readonly NOT_A_BRAND_VERSION = '99'
    private readonly httpSession = new Session({
        preset: 'chrome-146-windows',
        timeout: 15,
        retry: 3
    })

    constructor(private bot: MicrosoftRewardsBot) {}

    async getUserAgent(isMobile: boolean) {
        const system = this.getSystemComponents(isMobile)
        const app = await this.getAppComponents(isMobile)

        const uaTemplate = isMobile
            ? `Mozilla/5.0 (${system}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${app.chrome_reduced_version} Mobile Safari/537.36 EdgA/${app.edge_version}`
            : `Mozilla/5.0 (${system}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${app.chrome_reduced_version} Safari/537.36 Edg/${app.edge_version}`

        const platformVersion = `${isMobile ? Math.floor(Math.random() * 5) + 9 : Math.floor(Math.random() * 15) + 1}.0.0`

        const uaMetadata = {
            isMobile,
            platform: isMobile ? 'Android' : 'Windows',
            fullVersionList: [
                { brand: 'Not/A)Brand', version: `${UserAgentManager.NOT_A_BRAND_VERSION}.0.0.0` },
                { brand: 'Microsoft Edge', version: app.edge_version },
                { brand: 'Chromium', version: app.chrome_version }
            ],
            brands: [
                { brand: 'Not/A)Brand', version: UserAgentManager.NOT_A_BRAND_VERSION },
                { brand: 'Microsoft Edge', version: app.edge_major_version },
                { brand: 'Chromium', version: app.chrome_major_version }
            ],
            platformVersion,
            architecture: isMobile ? '' : 'x86',
            bitness: isMobile ? '' : '64',
            model: ''
        }

        return { userAgent: uaTemplate, userAgentMetadata: uaMetadata }
    }

    private tryParseJson<T>(raw: string): T | null {
        if (!raw || !raw.trim()) {
            return null
        }
        try {
            return JSON.parse(raw) as T
        } catch {
            return null
        }
    }

    private parseResponseJson<T>(text: string, response: { json: <R = unknown>() => R }): T | null {
        return (
            this.tryParseJson<T>(text) ??
            (() => {
                try {
                    return response.json<T>()
                } catch {
                    return null
                }
            })()
        )
    }

    private async getJsonWithDebug<T>(
        url: string,
        logTag: 'USERAGENT-CHROME-VERSION' | 'USERAGENT-EDGE-VERSION',
        isMobile: boolean,
        headers: Record<string, string>
    ): Promise<T | null> {
        const response = await this.httpSession.get(url, { headers })
        this.bot.logger.debug(
            isMobile,
            logTag,
            `Version endpoint response | status=${response.statusCode} | protocol=${response.protocol} | length=${response.text.length}`
        )
        return this.parseResponseJson<T>(response.text, response)
    }

    async getChromeVersion(isMobile: boolean): Promise<string> {
        try {
            const data = await this.getJsonWithDebug<ChromeVersion>(
                `https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json?t=${Date.now()}`,
                'USERAGENT-CHROME-VERSION',
                isMobile,
                {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache, no-store, max-age=0',
                    Pragma: 'no-cache'
                }
            )
            const stableVersion = data?.channels?.Stable?.version
            if (!stableVersion) {
                throw new Error('Invalid Chrome versions payload')
            }
            return stableVersion
        } catch (error) {
            this.bot.logger.error(
                isMobile,
                'USERAGENT-CHROME-VERSION',
                `An error occurred: ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }

    async getEdgeVersions(isMobile: boolean) {
        try {
            const data = await this.getJsonWithDebug<EdgeVersion[]>(
                'https://edgeupdates.microsoft.com/api/products',
                'USERAGENT-EDGE-VERSION',
                isMobile,
                { 'Content-Type': 'application/json' }
            )
            if (!Array.isArray(data) || data.length === 0) {
                throw new Error('Invalid Edge versions payload')
            }
            const stable = data.find(x => x.Product == 'Stable') as EdgeVersion
            const androidVersion =
                stable?.Releases?.find(x => x.Platform == 'Android')?.ProductVersion
            const windowsVersion =
                stable?.Releases?.find(x => x.Platform == 'Windows' && x.Architecture == 'x64')?.ProductVersion
            if (!androidVersion || !windowsVersion) {
                throw new Error('Missing Edge version entries for Android/Windows')
            }
            return {
                android: androidVersion,
                windows: windowsVersion
            }
        } catch (error) {
            this.bot.logger.error(
                isMobile,
                'USERAGENT-EDGE-VERSION',
                `An error occurred: ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }

    getSystemComponents(mobile: boolean): string {
        if (mobile) {
            const androidVersion = 10 + Math.floor(Math.random() * 5)
            return `Linux; Android ${androidVersion}; K`
        }

        return 'Windows NT 10.0; Win64; x64'
    }

    async getAppComponents(isMobile: boolean) {
        const versions = await this.getEdgeVersions(isMobile)
        const edgeVersion = isMobile ? versions.android : versions.windows
        const edgeMajorVersion = edgeVersion?.split('.')[0]

        const chromeVersion = await this.getChromeVersion(isMobile)
        const chromeMajorVersion = chromeVersion?.split('.')[0]
        const chromeReducedVersion = `${chromeMajorVersion}.0.0.0`

        if (!edgeVersion || !edgeMajorVersion || !chromeVersion || !chromeMajorVersion) {
            throw new Error('Invalid app component versions')
        }

        return {
            not_a_brand_version: `${UserAgentManager.NOT_A_BRAND_VERSION}.0.0.0`,
            not_a_brand_major_version: UserAgentManager.NOT_A_BRAND_VERSION,
            edge_version: edgeVersion,
            edge_major_version: edgeMajorVersion,
            chrome_version: chromeVersion,
            chrome_major_version: chromeMajorVersion,
            chrome_reduced_version: chromeReducedVersion
        }
    }

    async updateFingerprintUserAgent(
        fingerprint: BrowserFingerprintWithHeaders,
        isMobile: boolean
    ): Promise<BrowserFingerprintWithHeaders> {
        try {
            const userAgentData = await this.getUserAgent(isMobile)
            const componentData = await this.getAppComponents(isMobile)

            //@ts-expect-error Errors due it not exactly matching
            fingerprint.fingerprint.navigator.userAgentData = userAgentData.userAgentMetadata
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
