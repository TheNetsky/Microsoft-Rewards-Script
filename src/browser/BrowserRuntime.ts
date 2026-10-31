import COMMON_BROWSER_ARGS from '../../scripts/lib/browser-args.json'
import type { AccountLocale } from '../util/Locale'

export type FingerprintOperatingSystem = 'windows' | 'macos' | 'linux'

export interface BrowserRuntime {
    headless: boolean
    headlessReason: 'configured' | 'forced' | 'no-display'
    sandboxDisabled: boolean
    args: string[]
}

export function browserLocaleArgs(locale: Pick<AccountLocale, 'locale' | 'acceptedLocales'>): string[] {
    return [`--lang=${locale.locale}`, `--accept-lang=${locale.acceptedLocales.join(',')}`]
}

export function requireGraphicalDisplay(env: NodeJS.ProcessEnv = process.env, platform = process.platform): void {
    if (platform === 'linux' && !env.DISPLAY && !env.WAYLAND_DISPLAY) {
        throw new Error(
            'This command needs a graphical desktop. Run it locally with DISPLAY or WAYLAND_DISPLAY available, or use POST /sessions/regenerate for headless sign-in.'
        )
    }
}

export function resolveBrowserRuntime(options: {
    configuredHeadless: boolean
    ignoreCertificateErrors: boolean
    platform?: NodeJS.Platform
    env?: NodeJS.ProcessEnv
    runningAsRoot?: boolean
}): BrowserRuntime {
    const platform = options.platform ?? process.platform
    const env = options.env ?? process.env
    const forced = ['1', 'true', 'yes', 'on'].includes((env.FORCE_HEADLESS ?? '').trim().toLowerCase())
    const lacksDisplay = platform === 'linux' && !env.DISPLAY && !env.WAYLAND_DISPLAY
    const headless = options.configuredHeadless || forced || lacksDisplay
    const headlessReason = forced ? 'forced' : lacksDisplay && !options.configuredHeadless ? 'no-display' : 'configured'
    const runningAsRoot = options.runningAsRoot ?? (typeof process.getuid === 'function' && process.getuid() === 0)
    const sandboxDisabled = platform === 'linux' && runningAsRoot

    const args: string[] = [...COMMON_BROWSER_ARGS]
    if (platform === 'linux') args.push('--disable-dev-shm-usage')
    if (sandboxDisabled) args.push('--no-sandbox', '--disable-setuid-sandbox')
    if (options.ignoreCertificateErrors) {
        args.push('--ignore-certificate-errors', '--ignore-certificate-errors-spki-list', '--ignore-ssl-errors')
    }

    return { headless, headlessReason, sandboxDisabled, args }
}

export function fingerprintOperatingSystem(platform: NodeJS.Platform = process.platform): FingerprintOperatingSystem {
    switch (platform) {
        case 'win32':
            return 'windows'
        case 'darwin':
            return 'macos'
        case 'linux':
            return 'linux'
        default:
            throw new Error(`Unsupported browser host platform "${platform}"; use Windows, macOS, or Linux`)
    }
}

export function desktopUaArchitecture(architecture: NodeJS.Architecture = process.arch): {
    architecture: string
    bitness: string
} {
    switch (architecture) {
        case 'x64':
            return { architecture: 'x86', bitness: '64' }
        case 'ia32':
            return { architecture: 'x86', bitness: '32' }
        case 'arm64':
            return { architecture: 'arm', bitness: '64' }
        case 'arm':
            return { architecture: 'arm', bitness: '32' }
        case 'ppc64':
            return { architecture: 'ppc', bitness: '64' }
        case 's390x':
            return { architecture: 's390', bitness: '64' }
        case 'riscv64':
            return { architecture: 'riscv', bitness: '64' }
        default:
            return { architecture, bitness: architecture.endsWith('64') ? '64' : '' }
    }
}

export function desktopUaPlatform(platform: NodeJS.Platform = process.platform): 'Windows' | 'macOS' | 'Linux' {
    switch (fingerprintOperatingSystem(platform)) {
        case 'windows':
            return 'Windows'
        case 'macos':
            return 'macOS'
        case 'linux':
            return 'Linux'
    }
}
