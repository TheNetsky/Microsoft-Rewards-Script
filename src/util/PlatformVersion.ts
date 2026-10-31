import { execFileSync } from 'node:child_process'
import os from 'node:os'

export function detectDesktopPlatformVersion(): string {
    switch (process.platform) {
        case 'win32':
            return detectWindowsPlatformVersion()
        case 'darwin':
            return detectMacPlatformVersion()
        case 'linux':
            return ''
        default:
            return ''
    }
}

function detectWindowsPlatformVersion(): string {
    const release = os.release()
    const match = /^\d+\.\d+\.(\d+)/.exec(release)
    if (!match) return ''
    const build = Number(match[1])
    if (!Number.isInteger(build)) return ''
    if (build >= 26100) return '19.0.0' // 24H2 / 25H2
    if (build >= 22621) return '15.0.0' // 22H2 / 23H2
    if (build >= 22000) return '14.0.0' // 21H2
    return '10.0.0'
}

function detectMacPlatformVersion(): string {
    try {
        const out = execFileSync('/usr/bin/sw_vers', ['-productVersion'], {
            timeout: 500,
            stdio: ['ignore', 'pipe', 'ignore']
        })
            .toString()
            .trim()
        if (/^\d+\.\d+(\.\d+)?$/.test(out)) {
            const parts = out.split('.')
            while (parts.length < 3) parts.push('0')
            return parts.join('.')
        }
    } catch {
        // Ignore
    }

    return ''
}
