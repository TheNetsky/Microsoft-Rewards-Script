import type { ParsedOffer } from '../shared/parsers/RewardsPageParser'
import type { RewardsState } from './RewardsState'
import type { BingSearchReport } from '../shared/search/BingSearchReport'
import type { ActivationOutcome } from '../shared/ActivationOutcome'

export interface VisualSearchCandidate {
    bcid: string
    query: string
    serpUrl: string
}

export type ActivationResult = ActivationOutcome
export interface ActivationTarget extends ParsedOffer {
    activationSource: 'streak' | 'offer' | 'browser-ui-fallback'
}
export interface VisualSearchDriver {
    /** Browser acquisition submits the search and captures its report. */
    readonly reportsOnAcquire: boolean
    getSeedUrls(): Promise<string[]>
    acquire(seed: string): Promise<VisualSearchCandidate | null>
    report(candidate: VisualSearchCandidate): Promise<BingSearchReport>
    dispose(): Promise<void>
    fallbackTarget(): ActivationTarget | null
    activate(
        offer: ActivationTarget,
        data: RewardsState,
        confirm: (offerId: string) => Promise<boolean | null>
    ): Promise<ActivationResult>
}
