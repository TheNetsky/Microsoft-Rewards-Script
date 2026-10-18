import { anonymizeProxy, closeAnonymizedProxy } from 'proxy-chain'
import type { AccountProxy } from '../interface/Account'
import { parseBrowserProxyUrl } from './Proxy'

export async function startAuthenticatedSocks5Bridge(
    proxy: AccountProxy
): Promise<{ url: string; close: () => Promise<void> }> {
    const parsed = parseBrowserProxyUrl(proxy.url)

    if (parsed.protocol !== 'socks5:') {
        throw new Error('Authenticated SOCKS5 bridge requires a socks5:// proxy')
    }

    if (!proxy.username || !proxy.password) {
        throw new Error('SOCKS5 bridge requires both username and password')
    }

    if (!Number.isInteger(proxy.port) || proxy.port < 1 || proxy.port > 65535) {
        throw new Error('Invalid SOCKS5 proxy port')
    }

    // Use socks5h so hostname resolution is performed through the upstream proxy.
    const upstream = new URL(`socks5h://${parsed.hostname}:${proxy.port}`)
    upstream.username = encodeURIComponent(proxy.username)
    upstream.password = encodeURIComponent(proxy.password)

    const upstreamUrl = upstream.toString()

    // proxy-chain opens a temporary loopback HTTP proxy.
    const localUrl = await anonymizeProxy({
        url: upstreamUrl,
        port: 0
    })

    // Fail closed: never silently continue with the upstream URL directly.
    if (!localUrl.startsWith('http://127.0.0.1:')) {
        if (localUrl === upstreamUrl) {
            throw new Error('Failed to create local SOCKS5 proxy bridge')
        }

        throw new Error('Unexpected local proxy bridge address')
    }

    return {
        url: localUrl,
        close: async () => {
            await closeAnonymizedProxy(localUrl, true)
        }
    }
}