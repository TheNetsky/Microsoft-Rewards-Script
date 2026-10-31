import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator'
import type { BotContext } from '../core/BotContext'
import { desktopUaArchitecture, desktopUaPlatform } from './BrowserRuntime'
import { detectDesktopPlatformVersion } from '../util/PlatformVersion'
import { applyDesktopAppFingerprint, desktopAppRequestHeaders, isDesktopAppFingerprint } from './RewardsAppProfile'

export class UserAgentManager {
    private engineVersion = ''
    private engineIsRealEdge = false
    private readonly headers = new Map<boolean, Record<string, string>>()

    constructor(private readonly bot: Pick<BotContext, 'appIdentity'>) {}

    reset(): void {
        this.engineVersion = ''
        this.engineIsRealEdge = false
        this.headers.clear()
        this.bot.appIdentity.userAgent = ''
    }

    setEngineVersion(version: string, options?: { isRealEdge?: boolean }): void {
        const fullVersion = /\b\d+\.\d+\.\d+\.\d+\b/.exec(version)?.[0]
        if (!fullVersion) throw new Error(`Could not read the running Chromium version: ${version}`)
        if (this.engineVersion !== fullVersion) this.headers.clear()
        this.engineVersion = fullVersion
        this.engineIsRealEdge = options?.isRealEdge === true
        const identity = this.bot.appIdentity
        identity.userAgent =
            `Mozilla/5.0 (Linux; Android ${identity.osVersion}; ${identity.device}) AppleWebKit/537.36 (KHTML, like Gecko)` +
            ` Chrome/${fullVersion} Mobile Safari/537.36 BingWeb/${identity.appVersion}`
    }

    isRealEdge(): boolean {
        return this.engineIsRealEdge
    }

    getRequestHeaders(isMobile: boolean, rewardsApp = false): Record<string, string> {
        const headers = this.headers.get(isMobile)
        if (!headers) throw new Error(`${isMobile ? 'Mobile' : 'Desktop'} browser identity is not initialized`)
        return rewardsApp ? desktopAppRequestHeaders(this.engineVersion) : { ...headers }
    }

    matchesFingerprint(fingerprint: BrowserFingerprintWithHeaders, isMobile: boolean): boolean {
        const navigator = fingerprint.fingerprint.navigator
        const data = navigator.userAgentData
        if (!isMobile)
            return (
                isDesktopAppFingerprint(fingerprint) && data?.platform === 'Windows' && navigator.platform === 'Win32'
            )
        return (
            data?.platform === 'Android' &&
            !/MSRewards\/Desktop|EdgA?\/|iPad|iPhone/.test(navigator.userAgent) &&
            data.model === this.bot.appIdentity.device &&
            data.platformVersion === `${this.bot.appIdentity.osVersion}.0.0`
        )
    }

    async updateFingerprintUserAgent(
        fingerprint: BrowserFingerprintWithHeaders,
        isMobile: boolean
    ): Promise<BrowserFingerprintWithHeaders> {
        if (!this.engineVersion) throw new Error('Launch Chromium before preparing its browser identity')
        const identity = this.bot.appIdentity
        const major = this.engineVersion.split('.')[0]!
        const platform = isMobile ? 'Android' : desktopUaPlatform()
        const architecture = desktopUaArchitecture()
        const system = isMobile
            ? 'Linux; Android 10; K'
            : platform === 'macOS'
              ? 'Macintosh; Intel Mac OS X 10_15_7'
              : platform === 'Linux'
                ? `X11; Linux ${process.arch === 'arm64' ? 'aarch64' : process.arch === 'x64' ? 'x86_64' : process.arch}`
                : architecture.bitness === '32'
                  ? 'Windows NT 10.0'
                  : 'Windows NT 10.0; Win64; x64'
        const fullVersionList = [
            { brand: 'Chromium', version: this.engineVersion },
            { brand: 'Not/A)Brand', version: '99.0.0.0' }
        ]
        const brands = fullVersionList.map(({ brand, version }) => ({ brand, version: version.split('.')[0]! }))
        const userAgent = `Mozilla/5.0 (${system}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 ${isMobile ? 'Mobile ' : ''}Safari/537.36`
        const navigator = fingerprint.fingerprint.navigator
        navigator.userAgent = userAgent
        navigator.appVersion = userAgent.replace(/^Mozilla\//, '')
        navigator.platform = isMobile
            ? 'Linux armv8l'
            : platform === 'Windows'
              ? 'Win32'
              : platform === 'macOS'
                ? 'MacIntel'
                : `Linux ${process.arch === 'arm64' ? 'aarch64' : process.arch === 'x64' ? 'x86_64' : process.arch}`
        navigator.userAgentData = {
            brands,
            fullVersionList,
            mobile: isMobile,
            platform,
            platformVersion: isMobile ? `${identity.osVersion}.0.0` : detectDesktopPlatformVersion(),
            architecture: isMobile ? '' : architecture.architecture,
            bitness: isMobile ? '' : architecture.bitness,
            model: isMobile ? identity.device : '',
            uaFullVersion: this.engineVersion
        }
        for (const name of Object.keys(fingerprint.headers)) {
            if (/^(?:user-agent|sec-ch-ua.*|x-rewards-source|sec-ms-gec.*)$/i.test(name))
                delete fingerprint.headers[name]
        }
        const headers = {
            'User-Agent': userAgent,
            'sec-ch-ua': brands
                .map(({ brand, version }) => `${JSON.stringify(brand)};v=${JSON.stringify(version)}`)
                .join(', '),
            'sec-ch-ua-mobile': isMobile ? '?1' : '?0',
            'sec-ch-ua-platform': JSON.stringify(platform)
        }
        for (const [name, value] of Object.entries(headers)) fingerprint.headers[name.toLowerCase()] = value
        this.headers.set(isMobile, headers)
        return isMobile ? fingerprint : applyDesktopAppFingerprint(fingerprint, this.engineVersion)
    }
}
