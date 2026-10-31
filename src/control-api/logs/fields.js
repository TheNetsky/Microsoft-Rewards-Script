export function numericField(message, name) {
    const match = message.match(new RegExp(`(?:^| \\| )${name}=(-?\\d+(?:\\.\\d+)?)(?= \\| |$)`))
    return match ? Number(match[1]) : null
}

export function fractionField(message, name) {
    const match = message.match(new RegExp(`(?:^| \\| )${name}=(\\d+)\\/(\\d+)(?= \\| |$)`))
    return match ? { current: Number(match[1]), total: Number(match[2]) } : null
}

export function jsonStringField(message, name) {
    const value = message.match(new RegExp(`(?:^| \\| )${name}=("(?:[^"\\\\]|\\\\.)*")(?= \\| |$)`))?.[1]
    if (!value) return undefined
    try {
        return JSON.parse(value)
    } catch {
        return undefined
    }
}
