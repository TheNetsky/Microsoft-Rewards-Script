import type { ActivityResult } from '../rewards/types/ActivityResult'

export { sanitizeLogMessage, sanitizeLogData } from '../../scripts/lib/logging.cjs'

const ACTIVITY_LABELS: Record<string, string> = {
    doClaimBonusPoints: 'Bonus point claim',
    doEnsureStreakProtection: 'Streak protection',
    doClaimReward: 'Punchcard reward claim',
    doActivateSearchPerk: 'Search perk',
    'search-on-bing': 'Explore on Bing',
    'app-data': 'App data',
    'app-reward': 'App reward',
    'read-to-earn': 'Read to Earn',
    'daily-check-in': 'Daily Check-In',
    'url-reward': 'Website reward',
    'punchcard-data': 'Punchcard data',
    'browser-search-api-report': 'Experimental API search',
    'visual-search': 'Visual Search',
    'edge-browsing': 'Edge browsing'
}

const ACTIVITY_REASONS: Record<string, string> = {
    'earn-page-unavailable': 'Could not read the live Rewards earn page',
    'no-protection-days': 'No streak protection days remain',
    'protection-not-confirmed': 'Fresh Rewards data did not confirm that protection was enabled',
    'cookie-consent-blocked': 'Cookie consent could not be dismissed; page controls remain covered',
    'offer-not-present': 'Not offered in the latest account data; the service did not provide an eligibility reason',
    'offer-unavailable': 'Activity is not available for this account',
    'perk-unavailable': 'No search multiplier is offered to this account',
    'offer-locked': 'Offer is locked or requires a prerequisite',
    'offer-disabled': 'Offer is disabled by the service',
    'offer-not-yet-available': 'Offer is not available yet',
    'activation-data-unavailable': 'Could not read current activation data',
    'activation-metadata-missing': 'Offer is present, but required activation metadata is missing',
    'activation-control-missing': 'Offer activation could not be started because its rendered control was not found',
    'activation-page-unavailable': 'Browser page is unavailable for activation',
    'activation-not-confirmed': 'Activation was attempted, but its result could not be confirmed',
    'search-query-unavailable': 'No suitable search queries are available for this activity',
    'activation-state-unavailable': 'Activation was attempted, but its updated state could not be read',
    'activation-request-rejected': 'The service rejected the activation request',
    'activation-request-error': 'Activation request did not produce a verifiable result',
    'activation-confirmed': 'Activation confirmed',
    'offer-not-actionable': 'Offer is present, but an actionable state could not be established',
    'offer-hash-unavailable': 'Offer is present, but its required reporting hash is missing',
    'activation-acknowledged': 'Activation acknowledged by the service',
    'already-active': 'Already activated',
    'already-complete': 'Already completed',
    'mobile-not-applicable': 'Activity only applies to desktop'
}

export function activityLabel(activity: string): string {
    const label = ACTIVITY_LABELS[activity] ?? activity.replace(/[-_]/g, ' ')
    return label.charAt(0).toUpperCase() + label.slice(1)
}

export function activityReason(result: Pick<ActivityResult, 'message' | 'reason'>): string {
    return result.message || ACTIVITY_REASONS[result.reason] || result.reason.replace(/[-_]/g, ' ')
}

export function formatActivityResult(activity: string, result: ActivityResult): string {
    const label = activityLabel(activity) + (result.title ? `: ${JSON.stringify(result.title)}` : '')
    if (activity === 'doEnsureStreakProtection')
        return result.status === 'confirmed'
            ? `${label} | ${result.reason === 'already-enabled' ? 'already enabled' : 'enabled'}`
            : `${label} | could not be enabled or verified | ${activityReason(result)}`
    const outcome =
        result.status === 'confirmed'
            ? result.reason === 'search-report-sent'
                ? 'request sent'
                : /progressed/.test(result.reason)
                  ? 'progress confirmed'
                  : 'completed'
            : result.status === 'unconfirmed'
              ? 'completion not confirmed'
              : result.status === 'skipped'
                ? [
                      'offer-not-present',
                      'offer-unavailable',
                      'perk-unavailable',
                      'offer-locked',
                      'offer-disabled',
                      'offer-not-yet-available'
                  ].includes(result.reason)
                    ? 'unavailable (skipped)'
                    : ['already-complete', 'offer-already-complete', 'already-active'].includes(result.reason)
                      ? 'already completed (skipped)'
                      : 'not applicable (skipped)'
                : 'failed'
    const genericReason = ['offer-not-confirmed', 'offer-not-complete', 'quota-incomplete'].includes(result.reason)
    const reason =
        result.status === 'confirmed' || (genericReason && !result.message) ? '' : ` | ${activityReason(result)}`
    return `${label} | ${outcome} | points earned: ${result.pointsKnown === false ? 'unverified' : result.pointsGained}${reason}`
}
