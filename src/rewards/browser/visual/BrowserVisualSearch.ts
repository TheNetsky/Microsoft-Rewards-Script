import { BaseActivity } from '../../shared/activities/BaseActivity'
import type { RewardsState } from '../../types/RewardsState'
import type {
    ActivationTarget,
    ActivationResult,
    VisualSearchCandidate,
    VisualSearchDriver
} from '../../types/VisualSearchTypes'
import { VisualSearchPage } from './VisualSearchPage'
import { VisualSearchActivation } from './VisualSearchActivation'
import { activationOutcome, activationException } from '../../shared/ActivationOutcome'

const VISUAL_SEARCH_ACTIVATION_OFFER = 'visualsearch_streak_activation_v2'

export class BrowserVisualSearch extends BaseActivity implements VisualSearchDriver {
    readonly reportsOnAcquire = true
    private readonly flow = new VisualSearchPage(this.bot)

    getSeedUrls(): Promise<string[]> {
        return this.flow.getSeedUrls()
    }

    acquire(seed: string): Promise<VisualSearchCandidate | null> {
        return this.flow.acquire(seed)
    }

    async report(candidate: VisualSearchCandidate) {
        return this.flow.takeCapturedReport(candidate)
    }

    dispose(): Promise<void> {
        return this.flow.dispose()
    }

    fallbackTarget(): ActivationTarget | null {
        return {
            offerId: VISUAL_SEARCH_ACTIVATION_OFFER,
            hash: null,
            title: 'Visual Search Streak',
            description: '',
            points: 0,
            promotionSubtype: null,
            destination: '',
            isCompleted: false,
            isPromotional: false,
            isLocked: false,
            unlockCriteria: null,
            date: null,
            activityType: null,
            reportable: false,
            activationSource: 'browser-ui-fallback'
        }
    }

    async activate(
        offer: ActivationTarget,
        _data: RewardsState,
        confirm: (offerId: string) => Promise<boolean | null>
    ): Promise<ActivationResult> {
        let attempted = false
        try {
            const clicked = await new VisualSearchActivation(this.bot).click(offer)
            attempted = clicked.attempted
            if (!clicked.attempted || clicked.reason !== 'activation-not-confirmed') return clicked

            await this.bot.utils.wait(this.bot.utils.randomDelay(3000, 6000))
            const confirmed = await confirm(offer.offerId)
            if (confirmed) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `Activated visual search through the rendered control | offerId=${offer.offerId}`
                )
            } else {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'VISUAL-SEARCH',
                    `Activation click was not confirmed; continuing with rendered Visual Search and registration checks | offerId=${offer.offerId}`
                )
            }
            return activationOutcome(
                confirmed ? 'activated' : 'unconfirmed',
                confirmed
                    ? 'activation-confirmed'
                    : confirmed === null
                      ? 'activation-state-unavailable'
                      : 'activation-not-confirmed',
                offer.offerId,
                true,
                { verified: confirmed === true }
            )
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'VISUAL-SEARCH',
                `Rendered activation failed | offerId=${offer.offerId} | ${
                    error instanceof Error ? error.message : String(error)
                }`
            )
            return activationException(error, offer.offerId, attempted)
        }
    }
}
