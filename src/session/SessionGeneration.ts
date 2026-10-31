export type SessionPlatform = 'desktop' | 'mobile'
export type SessionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface SessionGenerationOptions {
    platform: SessionPlatform | 'both'
    fresh: boolean
}

export interface SessionGenerationProgress {
    fresh: boolean
    platforms: SessionPlatform[]
    accounts: { index: number; email: string }[]
    steps: {
        email: string
        platform: SessionPlatform
        status: SessionStatus
        startedAt: string | null
        endedAt: string | null
        error: string | null
    }[]
}

export function resolveSessionOptions(input: { platform?: unknown; fresh?: unknown }): SessionGenerationOptions {
    const platform = input.platform === undefined ? 'both' : input.platform
    const fresh = input.fresh === undefined ? true : input.fresh
    if (!['desktop', 'mobile', 'both'].includes(String(platform)) || typeof platform !== 'string') {
        throw Object.assign(new Error('`platform` must be desktop, mobile, or both.'), { code: 'BAD_REQUEST' })
    }
    if (typeof fresh !== 'boolean') {
        throw Object.assign(new Error('`fresh` must be a boolean.'), { code: 'BAD_REQUEST' })
    }
    return { platform: platform as SessionGenerationOptions['platform'], fresh }
}

export function sessionPlatforms(platform: SessionGenerationOptions['platform']): SessionPlatform[] {
    return platform === 'both' ? ['desktop', 'mobile'] : [platform]
}
