import crypto from 'node:crypto'

export interface AppIdentity {
    channel: 'SAAndroid'
    appVersion: string
    build: string
    osName: 'Android'
    osVersion: string
    device: string
    appId: string
    partnerId: string
    userAgent: string
}

const ANDROID_RELEASES: ReadonlyArray<{
    appVersion: string
    build: string
    androidVersion: string
    device: string
}> = [
    { appVersion: '34.5.450113001', build: '450113001', androidVersion: '14', device: 'Pixel 8' },
    { appVersion: '34.5.450113001', build: '450113001', androidVersion: '15', device: 'Pixel 9' },
    { appVersion: '34.4.450106001', build: '450106001', androidVersion: '14', device: 'SM-S921B' },
    { appVersion: '33.4.440603001', build: '440603001', androidVersion: '13', device: 'SM-S911B' },
    { appVersion: '33.4.440603001', build: '440603001', androidVersion: '14', device: 'Pixel 7' }
]

export function createAppIdentity(accountKey?: string): AppIdentity {
    const hash = crypto
        .createHash('sha256')
        .update(accountKey ?? crypto.randomUUID())
        .digest()
    const release = ANDROID_RELEASES[hash.readUInt32BE(0) % ANDROID_RELEASES.length]!

    return {
        channel: 'SAAndroid',
        appVersion: release.appVersion,
        build: release.build,
        osName: 'Android',
        osVersion: release.androidVersion,
        device: release.device,
        appId: `SAAndroid/${release.appVersion}`,
        partnerId: 'BingHomepage',
        userAgent: ''
    }
}
