import type { BotContext } from '../../core/BotContext'
import { activityResult, type ActivityResult } from './ActivityResult'
import { creditedPoints, findPointOffer, pointDelta, pointValue, promotionProgress } from './PointAccounting'
import type { BasePromotion } from './Promotion'

type VerificationContext = Pick<BotContext, 'isMobile' | 'logger' | 'rewards' | 'signal' | 'userData' | 'utils'>

export interface OfferReading {
    complete: boolean
    progress: number | null
    maximum: number | null
}

export interface OfferReport {
    offerId?: string
    accepted: boolean
    offerComplete: boolean
    earnedCredits: number | null
}

export function offerReading(offer?: BasePromotion | null): OfferReading | undefined {
    if (!offer) return undefined
    const progress = promotionProgress(offer)
    const maximum = pointValue(offer.pointProgressMax)
    return {
        complete: offer.complete || (progress !== null && maximum !== null && maximum > 0 && progress >= maximum),
        progress,
        maximum
    }
}

export class OfferVerifier {
    private before?: OfferReading
    private beforeBalance: number | null = null
    private balance: number | null = null

    constructor(
        private readonly bot: VerificationContext,
        private readonly offerId: string,
        private readonly readAdditional?: () => Promise<OfferReading | undefined>
    ) {}

    async capture(): Promise<boolean> {
        this.before = await this.read()
        this.beforeBalance = this.balance
        return this.before?.complete === true
    }

    async verify(fallback: ActivityResult, report?: OfferReport): Promise<ActivityResult> {
        if (report?.offerId && report.offerId !== this.offerId) report = undefined
        let gained = report?.accepted ? pointValue(report.earnedCredits) : null
        let complete = report?.accepted === true && report.offerComplete
        for (let check = 1; check <= 3; check++) {
            this.bot.signal.throwIfAborted()
            if (check > 1) await this.bot.utils.wait(2000)
            const after = await this.read(true)
            const delta =
                this.before && after && this.before.maximum === after.maximum
                    ? pointDelta(this.before.progress, after.progress)
                    : null
            const credited = creditedPoints(delta, this.beforeBalance, this.balance)
            if (credited !== null) gained = gained === null ? credited : Math.max(gained, credited)
            else if (gained === 0 && !report?.accepted) gained = null
            complete ||= after?.complete === true
            this.bot.logger.debug(
                this.bot.isMobile,
                'OFFER-VERIFY',
                `Offer verification | offerId=${this.offerId} | check=${check}/3 | complete=${complete}` +
                    ` | pointProgress=${this.before?.progress ?? 'unknown'}->${after?.progress ?? 'unknown'}` +
                    ` | reportedCredits=${report?.accepted ? (report.earnedCredits ?? 'unknown') : 'unknown'}` +
                    ` | balanceDelta=${pointDelta(this.beforeBalance, this.balance) ?? 'unknown'}` +
                    ` | pointsGained=${gained ?? 'unknown'}`
            )
            if (complete && gained !== null && gained > 0) break
        }
        return {
            ...fallback,
            ...activityResult(
                complete ? 'confirmed' : fallback.status,
                complete ? 'offer-complete' : fallback.reason,
                this.offerId,
                gained
            ),
            balanceBefore: this.beforeBalance,
            balanceAfter: this.balance
        }
    }

    private async read(checkCompletion = false): Promise<OfferReading | undefined> {
        this.balance = null
        let observed: OfferReading | undefined
        const reads = [
            async () => {
                const { dashboard } = await this.bot.rewards.getDashboardData()
                this.bot.userData.currentPoints = dashboard.userStatus.availablePoints
                this.balance = pointValue(dashboard.userStatus.availablePoints)
                return offerReading(findPointOffer(dashboard, this.offerId))
            },
            ...(this.readAdditional ? [this.readAdditional] : []),
            async () => {
                const { dashboard } = await this.bot.rewards.getTaskData()
                this.balance = pointValue(dashboard.userStatus.availablePoints)
                return offerReading(findPointOffer(dashboard, this.offerId))
            }
        ]
        for (const read of reads) {
            try {
                const offer = await read()
                if (!offer) continue
                const best =
                    observed?.progress !== null &&
                    observed?.progress !== undefined &&
                    (offer.progress === null ||
                        (observed.maximum === offer.maximum && observed.progress >= offer.progress))
                        ? observed
                        : offer
                observed = {
                    ...best,
                    complete: offer.complete || observed?.complete === true
                }
                if (observed.complete || (!checkCompletion && observed.progress !== null)) return observed
            } catch (error) {
                this.bot.signal.throwIfAborted()
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'OFFER-VERIFY',
                    `Offer read unavailable | offerId=${this.offerId} | ${error instanceof Error ? error.message : String(error)}`
                )
            }
        }
        return observed
    }
}
