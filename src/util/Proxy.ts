export const BROWSER_PROXY_PROTOCOLS = ['http:', 'https:', 'socks4:', 'socks5:'] as const

const browserProxyProtocols = new Set<string>(BROWSER_PROXY_PROTOCOLS)
const explicitProtocolPattern = /^[a-z][a-z\d+.-]*:\/\//i

export function parseBrowserProxyUrl(value: string): URL {
    const input = value.trim()
    if (!input) throw new Error('Proxy URL is empty')

    let url: URL
    try {
        url = new URL(explicitProtocolPattern.test(input) ? input : `http://${input}`)
    } catch {
        throw new Error(`Invalid proxy URL: ${value}`)
    }

    const protocol = url.protocol.toLowerCase()
    if (!browserProxyProtocols.has(protocol)) {
        const supported = BROWSER_PROXY_PROTOCOLS.map(item => item.slice(0, -1)).join(', ')
        throw new Error(`Unsupported browser proxy protocol "${protocol.slice(0, -1)}"; supported: ${supported}`)
    }
    if (!url.hostname) throw new Error(`Invalid proxy URL: ${value}`)

    return url
}

export function formatBrowserProxyServer(value: string, port: number): string {
    const url = parseBrowserProxyUrl(value)
    return `${url.protocol}//${url.hostname}:${port}`
}
