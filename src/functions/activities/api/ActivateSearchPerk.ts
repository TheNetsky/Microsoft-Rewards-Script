import type { Dashboard, DashboardData } from '../../../interface/DashboardData'
import { BaseActivity } from '../BaseActivity'

export interface SearchMultiplierPerk {
    offerId: string
    multiplier: number
}

export function detectSearchMultiplierPerk(dashboard: Dashboard): SearchMultiplierPerk | null {
    const candidates = [dashboard.promotionalItem, ...(dashboard.promotionalItems ?? [])]

    for (const item of candidates) {
        if (!item) continue

        const attributes = item.attributes
        const offerId = item.offerId || attributes?.offerid || ''
        const description = item.description || attributes?.description || ''
        if (!offerId) continue

        const multiplierAttr = attributes?.searchMultiplier
        const multiplierFromAttr = multiplierAttr != null ? Number(multiplierAttr) : NaN

        // Date-agnostic fallbacks
        const fromDescription = /search\s*(\d+)\s*x\s*more/i.exec(description)
        const fromOfferId = /optin[_-]?(\d+)x(?:[_-]|$)/i.exec(offerId)

        const isSearchMultiplier =
            (Number.isFinite(multiplierFromAttr) && multiplierFromAttr > 1) ||
            fromDescription !== null ||
            fromOfferId !== null
        if (!isSearchMultiplier) continue

        const multiplier =
            Number.isFinite(multiplierFromAttr) && multiplierFromAttr > 1
                ? multiplierFromAttr
                : fromDescription
                  ? Number(fromDescription[1])
                  : fromOfferId
                    ? Number(fromOfferId[1])
                    : 2

        return { offerId, multiplier }
    }

    return null
}

export class ActivateSearchPerk extends BaseActivity {
    public async activate(data: DashboardData) {
        const perk = detectSearchMultiplierPerk(data.dashboard)
        if (!perk) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'ACTIVATE-SEARCH-PERK',
                'No search-multiplier perk present on the dashboard'
            )
            return
        }

        const live = await this.bot.browser.func.ensureOffer(perk.offerId)
        if (!live) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'ACTIVATE-SEARCH-PERK',
                `${perk.multiplier}x search perk present in dashboard but missing from the page snapshot - cannot activate | offerId=${perk.offerId}`
            )
            return
        }

        if (!live.reportable) {
            this.bot.logger.info(
                this.bot.isMobile,
                'ACTIVATE-SEARCH-PERK',
                `${perk.multiplier}x search perk already active (or not activatable) | offerId=${perk.offerId}`,
                'green'
            )
            return
        }

        const actionId = this.bot.nextActions.reportActivity
        if (!actionId) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'ACTIVATE-SEARCH-PERK',
                'Skipping: "reportActivity" action id not discovered in bundle'
            )
            return
        }

        const activityType = live.activityType ?? 11

        this.bot.logger.info(
            this.bot.isMobile,
            'ACTIVATE-SEARCH-PERK',
            `Activating ${perk.multiplier}x search perk | offerId=${perk.offerId} | geo=${this.bot.userData.geoLocale}`
        )

        try {
            const { status, acknowledged } = await this.bot.browser.func.reportServerAction(actionId, [
                live.hash,
                activityType,
                {
                    offerid: perk.offerId,
                    isPromotional: 'true',
                    timezoneOffset: this.bot.userData.timezoneOffset
                }
            ])

            this.bot.logger.debug(
                this.bot.isMobile,
                'ACTIVATE-SEARCH-PERK',
                `Response | offerId=${perk.offerId} | status=${status} | acknowledged=${acknowledged}`
            )

            if (acknowledged) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'ACTIVATE-SEARCH-PERK',
                    `Activated ${perk.multiplier}x search perk | offerId=${perk.offerId} | daily search cap is now boosted`,
                    'green'
                )
            } else {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'ACTIVATE-SEARCH-PERK',
                    `Activation not acknowledged | offerId=${perk.offerId} | status=${status}`
                )
            }

            await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 10000))
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'ACTIVATE-SEARCH-PERK',
                `Error activating search perk | offerId=${perk.offerId} | message=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }
}
