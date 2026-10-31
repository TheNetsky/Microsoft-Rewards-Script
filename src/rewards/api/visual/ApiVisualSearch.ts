import { resolveActivationMetadata } from '../../shared/ActivationMetadata'
import { BaseActivity } from '../../shared/activities/BaseActivity'
import { activationOutcome, activationException } from '../../shared/ActivationOutcome'
import type { RewardsState } from '../../types/RewardsState'
import type {
    ActivationTarget,
    ActivationResult,
    VisualSearchCandidate,
    VisualSearchDriver
} from '../../types/VisualSearchTypes'
import { VisualSearchClient } from './VisualSearchClient'

const VERIFIED_ACTIVITY_TYPES = new Map<string, number>([
    ['ww_visualsearch_summerjuly26_activation_banner', 11],
    ['visualsearch_streak_activation_v2', 714]
])

export class ApiVisualSearch extends BaseActivity implements VisualSearchDriver {
    readonly reportsOnAcquire = false
    private readonly acquisition = new VisualSearchClient(this.bot)

    getSeedUrls(): Promise<string[]> {
        return this.acquisition.getSeedUrls()
    }

    acquire(seed: string): Promise<VisualSearchCandidate | null> {
        return this.acquisition.acquire(seed)
    }

    report(candidate: VisualSearchCandidate) {
        return this.acquisition.report(candidate)
    }

    async dispose(): Promise<void> {}

    fallbackTarget(): ActivationTarget | null {
        return null
    }

    async activate(
        offer: ActivationTarget,
        data: RewardsState,
        confirm: (offerId: string) => Promise<boolean | null>
    ): Promise<ActivationResult> {
        if (!offer.hash) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Activation offer present but missing a hash | offerId=${offer.offerId}`
            )
            return activationOutcome('unconfirmed', 'activation-metadata-missing', offer.offerId)
        }

        if (!offer.reportable) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Activation offer is not actionable | offerId=${offer.offerId}`
            )
            return activationOutcome('unconfirmed', 'activation-metadata-missing', offer.offerId)
        }

        const actionId = this.bot.nextActions.reportActivity
        if (!actionId) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                'Skipping activation: "reportActivity" action id not discovered in bundle'
            )
            return activationOutcome('unconfirmed', 'activation-metadata-missing', offer.offerId)
        }

        const dashboard = await this.resolveDashboard(data)
        const metadata = resolveActivationMetadata(offer, dashboard.dashboard, VERIFIED_ACTIVITY_TYPES)
        if (!metadata) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Skipping activation: no valid activity type found | offerId=${offer.offerId}`
            )
            return activationOutcome('unconfirmed', 'activation-metadata-missing', offer.offerId)
        }

        this.bot.logger.debug(
            this.bot.isMobile,
            'VISUAL-SEARCH',
            `Activating visual search | offerId=${offer.offerId} | activationSource=${offer.activationSource} | activityType=${metadata.activityType} | activityTypeSource=${metadata.activityTypeSource} | promotional=${metadata.isPromotional} | geo=${this.bot.userData.geoLocale}`
        )

        try {
            const { status, acknowledged } = await this.bot.rewards.reportServerAction(actionId, [
                offer.hash,
                metadata.activityType,
                {
                    offerid: offer.offerId,
                    isPromotional: metadata.isPromotional ? 'true' : '$undefined',
                    timezoneOffset: this.bot.userData.timezoneOffset
                }
            ])

            if (status < 200 || status >= 300)
                return activationOutcome(
                    status >= 400 && status < 500 ? 'failed' : 'unconfirmed',
                    status >= 400 && status < 500 ? 'activation-request-rejected' : 'activation-request-error',
                    offer.offerId,
                    true,
                    { httpStatus: status, acknowledged }
                )

            await this.bot.utils.wait(this.bot.utils.randomDelay(3000, 6000))
            const confirmed = await confirm(offer.offerId)

            if (acknowledged || confirmed) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `Activated visual search | offerId=${offer.offerId} | acknowledged=${acknowledged} | confirmed=${confirmed}`
                )
                return activationOutcome(
                    'activated',
                    confirmed ? 'activation-confirmed' : 'activation-acknowledged',
                    offer.offerId,
                    true,
                    { httpStatus: status, acknowledged, verified: confirmed === true }
                )
            }

            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Activation not acknowledged | offerId=${offer.offerId} | status=${status}`
            )
            return activationOutcome(
                'unconfirmed',
                confirmed === null ? 'activation-state-unavailable' : 'activation-not-confirmed',
                offer.offerId,
                true,
                { httpStatus: status, acknowledged, verified: false }
            )
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Activation error | offerId=${offer.offerId} | ${error instanceof Error ? error.message : String(error)}`
            )
            return activationException(error, offer.offerId, true)
        }
    }

    private async resolveDashboard(fallback: RewardsState): Promise<RewardsState> {
        try {
            return await this.bot.rewards.getDashboardData()
        } catch {
            this.bot.logger.debug(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                'Desktop dashboard fetch failed - falling back to the earlier dashboard read'
            )
            return fallback
        }
    }
}
