import type { Logger } from '../../logging/Logger'
import type { ParentQuest } from './parsers/RewardsPageParser'
import type { BasePromotion } from './Promotion'
import { pointValue, promotionProgress } from './PointAccounting'

export interface PunchCardProgress {
    offerId: string
    title: string
    completedSteps: number | null
    totalSteps: number | null
    lockedSteps: number | null
    pointsGained: number | null
    pointsAvailable: number | null
    pointsKnown: boolean
    complete: boolean
}

interface PunchCardStep {
    complete: boolean
    locked: boolean
}

export function punchCardProgress(
    parent: ParentQuest,
    steps?: readonly PunchCardStep[],
    promotion?: BasePromotion
): PunchCardProgress {
    const totalSteps = parent.totalSteps ?? (steps?.length || null)
    const completed = parent.completedSteps ?? (steps ? steps.filter(step => step.complete).length : null)
    const completedSteps = completed !== null && totalSteps !== null ? Math.min(completed, totalSteps) : completed
    const complete =
        parent.complete ||
        promotion?.complete === true ||
        (totalSteps !== null && totalSteps > 0 && completedSteps === totalSteps)
    const pointsGained =
        (parent.pointProgressKnown === false ? null : pointValue(parent.pointProgress)) ?? promotionProgress(promotion)
    const parentMaximumKnown = parent.pointProgressMaxKnown ?? parent.pointProgressMax > 0
    const maximum = parentMaximumKnown ? parent.pointProgressMax : promotion?.pointProgressMax
    const maximumKnown =
        parentMaximumKnown || (promotion?.pointProgressMaxKnown ?? (maximum !== undefined && maximum > 0))

    return {
        offerId: parent.offerId,
        title: parent.title || promotion?.title || parent.offerId,
        completedSteps: complete && totalSteps !== null ? totalSteps : completedSteps,
        totalSteps,
        lockedSteps: complete
            ? 0
            : steps?.length && (totalSteps === null || steps.length >= totalSteps)
              ? steps.filter(step => !step.complete && step.locked).length
              : null,
        pointsGained,
        pointsAvailable: maximumKnown ? pointValue(maximum) : null,
        pointsKnown: pointsGained !== null,
        complete
    }
}

export function observePunchCard(
    bot: { logger: Pick<Logger, 'event'>; isMobile: boolean },
    parent: ParentQuest,
    steps?: readonly PunchCardStep[],
    promotion?: BasePromotion
): void {
    const progress = punchCardProgress(parent, steps, promotion)
    bot.logger.event(
        bot.isMobile,
        'PUNCHCARD-PROGRESS',
        `Quest progress | offerId=${parent.offerId} | progress=${progress.completedSteps ?? '?'}/${progress.totalSteps ?? '?'}`,
        { kind: 'punchcard', ...progress }
    )
}
