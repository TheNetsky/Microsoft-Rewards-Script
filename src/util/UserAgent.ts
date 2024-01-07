import axios from 'axios'

import { log } from './Logger'

import { ChromeVersion, EdgeVersion } from '../interface/UserAgentUtil'

export async function getUserAgent(mobile: boolean) {
    const system = getSystemComponents(mobile)
    const app = await getAppComponents(mobile)

    const uaTemplate = mobile ?
        `Mozilla/5.0 (${system}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${app.chrome_reduced_version} Mobile Safari/537.36 EdgA/${app.edge_version}` :
        `Mozilla/5.0 (${system}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${app.chrome_reduced_version} Safari/537.36 Edg/${app.edge_version}`

    const platformVersion = `${mobile ? Math.floor(Math.random() * 5) + 9 : Math.floor(Math.random() * 15) + 1}.0.0`

    const uaMetadata = {
        mobile,
        platform: mobile ? 'Android' : 'Windows',
        fullVersionList: [
            { brand: 'Not/A)Brand', version: '99.0.0.0' },
            { brand: 'Microsoft Edge', version: app['edge_version'] },
            { brand: 'Chromium', version: app['chrome_version'] }
        ],
        brands: [
            { brand: 'Not/A)Brand', version: '99' },
            { brand: 'Microsoft Edge', version: app['edge_major_version'] },
            { brand: 'Chromium', version: app['chrome_major_version'] }
        ],
        platformVersion,
        architecture: mobile ? '' : 'x86',
        bitness: mobile ? '' : '64',
        model: ''
    }

    return { userAgent: uaTemplate, userAgentMetadata: uaMetadata }
}

export async function getChromeVersion(): Promise<string> {
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
        throw log('USERAGENT-CHROME-VERSION', 'An error occurred:' + error, 'error')
    }
}

export async function getEdgeVersions() {
    try {
        const request = {
            url: 'https://edgeupdates.microsoft.com/api/products',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        }

        const response = await axios(request)
        const data: EdgeVersion[] = response.data
        const stable = data.find(x => x.Product == 'Stable') as EdgeVersion
        return {
            android: stable.Releases.find(x => x.Platform == 'Android')?.ProductVersion,
            windows: stable.Releases.find(x => (x.Platform == 'Windows' && x.Architecture == 'x64'))?.ProductVersion
        }


    } catch (error) {
        throw log('USERAGENT-EDGE-VERSION', 'An error occurred:' + error, 'error')
    }
}

export function getSystemComponents(mobile: boolean): string {
    const osId: string = mobile ? 'Linux' : 'Windows NT 10.0'
    const uaPlatform: string = mobile ? `Android 1${Math.floor(Math.random() * 5)}` : 'Win64; x64'

    if (mobile) {
        return `${uaPlatform}; ${osId}; K`
    }

    return `${uaPlatform}; ${osId}`
}

export async function getAppComponents(mobile: boolean) {
    const versions = await getEdgeVersions()
    const edgeVersion = mobile ? versions.android : versions.windows as string
    const edgeMajorVersion = edgeVersion?.split('.')[0]

    const chromeVersion = await getChromeVersion()
    const chromeMajorVersion = chromeVersion?.split('.')[0]
    const chromeReducedVersion = `${chromeMajorVersion}.0.0.0`

    return {
        edge_version: edgeVersion as string,
        edge_major_version: edgeMajorVersion as string,
        chrome_version: chromeVersion as string,
        chrome_major_version: chromeMajorVersion as string,
        chrome_reduced_version: chromeReducedVersion as string
    }
}