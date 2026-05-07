import type { Config } from '../interface/Config'

/** Non-empty Gemini API keys from config (trimmed). Comma-separated in `geminiApiKey` for rotation. */
export function resolveGeminiApiKeys(config: Config): string[] {
    const raw = (config.geminiApiKey ?? '').trim()
    if (!raw) {
        return []
    }
    return raw
        .split(',')
        .map(k => k.trim())
        .filter(Boolean)
}
