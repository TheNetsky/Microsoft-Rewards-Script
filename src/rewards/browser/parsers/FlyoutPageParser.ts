import type { RewardsFlyoutData } from '../../shared/data/FlyoutTypes'

const VIEW_MODEL_MARKER = /window\.flyoutViewModel\s*=\s*/

export function extractFlyoutViewModel(html: string): RewardsFlyoutData {
    const marker = VIEW_MODEL_MARKER.exec(html)
    if (!marker) throw new Error('Rendered Bing flyout did not contain window.flyoutViewModel')

    const objectStart = html.indexOf('{', marker.index + marker[0].length)
    if (objectStart < 0) throw new Error('Rendered Bing flyout view model has no JSON object')

    const objectEnd = findJsonObjectEnd(html, objectStart)
    let parsed: unknown
    try {
        parsed = JSON.parse(html.slice(objectStart, objectEnd))
    } catch (error) {
        throw new Error(
            `Rendered Bing flyout view model is invalid JSON: ${error instanceof Error ? error.message : String(error)}`
        )
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Rendered Bing flyout view model is not an object')
    }
    return parsed as RewardsFlyoutData
}

function findJsonObjectEnd(source: string, start: number): number {
    let depth = 0
    let inString = false
    let escaped = false

    for (let index = start; index < source.length; index++) {
        const character = source[index]!
        if (escaped) {
            escaped = false
            continue
        }
        if (inString && character === '\\') {
            escaped = true
            continue
        }
        if (character === '"') {
            inString = !inString
            continue
        }
        if (inString) continue

        if (character === '{') depth += 1
        if (character === '}' && --depth === 0) return index + 1
    }

    throw new Error('Rendered Bing flyout view model JSON object is incomplete')
}
