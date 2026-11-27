function parseBoolEnv(value: string | undefined): boolean | undefined {
    if (value === undefined) return undefined
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
    return undefined
}

export function hasDisplay(env: NodeJS.ProcessEnv = process.env): boolean {
    if (process.platform !== 'linux') return true
    return Boolean(env.DISPLAY?.trim() || env.WAYLAND_DISPLAY?.trim())
}

export interface HeadlessResolution {
    headless: boolean
    reason: string
}

/**
 * Resolve the effective headless mode for browser launches.
 *
 * `config.json` is the source of truth:
 * - `headless: true` runs invisibly, `headless: false` runs headed.
 *
 * An explicit `HEADLESS` / `CONFIG_HEADLESS` env var wins over the file,
 * so Docker / CI can still override without editing config.json.
 */
export function resolveHeadless(configHeadless: boolean, env: NodeJS.ProcessEnv = process.env): HeadlessResolution {
    const explicit = parseBoolEnv(env.HEADLESS) ?? parseBoolEnv(env.CONFIG_HEADLESS)
    if (explicit !== undefined) {
        return {
            headless: explicit,
            reason: `env override (${env.HEADLESS !== undefined ? 'HEADLESS' : 'CONFIG_HEADLESS'}=${explicit})`
        }
    }

    return { headless: configHeadless, reason: `config.json headless=${configHeadless}` }
}
