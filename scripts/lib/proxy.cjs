const BROWSER_PROXY_PROTOCOLS = ['http:', 'https:', 'socks4:', 'socks5:']
const explicitProtocolPattern = /^[a-z][a-z\d+.-]*:\/\//i

function parseBrowserProxyUrl(value) {
    const input = value.trim()
    if (!input) throw new Error('Proxy URL is empty')
    let url
    try {
        url = new URL(explicitProtocolPattern.test(input) ? input : `http://${input}`)
    } catch {
        throw new Error('Invalid proxy URL')
    }
    if (!BROWSER_PROXY_PROTOCOLS.includes(url.protocol)) {
        throw new Error(
            `Unsupported browser proxy protocol "${url.protocol.slice(0, -1)}"; supported: http, https, socks4, socks5`
        )
    }
    if (!url.hostname) throw new Error('Invalid proxy URL')
    return url
}

function proxyValidationIssues(settings) {
    const issues = []
    const issue = (field, message) => issues.push({ field, message })
    if (!settings?.url) {
        if (settings && (settings.proxyHttp || settings.port || settings.username || settings.password))
            issue('url', 'Proxy URL is required when other proxy settings are configured')
        return issues
    }
    let url
    try {
        url = parseBrowserProxyUrl(settings.url)
    } catch (error) {
        issue('url', error.message)
        return issues
    }
    if (!Number.isInteger(settings.port) || settings.port < 1 || settings.port > 65535)
        issue('port', 'Proxy port must be an integer from 1 to 65535')
    if (url.username || url.password)
        issue('url', 'Put proxy credentials in ACCOUNT_N_PROXY_USERNAME/PASSWORD, not in ACCOUNT_N_PROXY_URL')
    const hasUsername = Boolean(settings.username)
    const hasPassword = Boolean(settings.password)
    if (hasUsername !== hasPassword)
        issue(hasUsername ? 'password' : 'username', 'Proxy username and password must be configured together')
    if (['socks4:', 'socks5:'].includes(url.protocol) && hasUsername)
        issue(
            'username',
            `${url.protocol.slice(0, -1).toUpperCase()} proxy authentication is not supported by Patchright`
        )
    return issues
}

function buildBrowserProxy(settings) {
    const issues = proxyValidationIssues(settings)
    if (issues.length) throw new Error(issues[0].message)
    if (!settings?.url) return null
    const url = parseBrowserProxyUrl(settings.url)
    return {
        server: `${url.protocol}//${url.hostname}:${settings.port}`,
        ...(settings.username ? { username: settings.username, password: settings.password } : {})
    }
}

module.exports = { parseBrowserProxyUrl, proxyValidationIssues, buildBrowserProxy }
