import { pointValue } from '../../shared/PointAccounting'
import type { BotContext } from '../../../core/BotContext'
import type { BasePromotion } from '../../types/RewardsState'
import type { RawPromotion } from '../../shared/Promotion'
import type { RewardsFlyoutData } from '../../shared/data/FlyoutTypes'
import { URLs } from '../../../constants/urls'
import { extractFlyoutViewModel } from '../../browser/parsers/FlyoutPageParser'
import { mergeRequestHeaders } from '../../../network/HttpClient'
import { localeRequestHeaders } from '../../../network/RequestHeaders'

export interface FlyoutReportResult {
    offerId: string
    accepted: boolean
    offerComplete: boolean
    earnedCredits: number | null
}

const text = (value: unknown, fallback: string): string => (typeof value === 'string' ? value : fallback)

function findCard(model: RewardsFlyoutData, offerId: string): RawPromotion | undefined {
    const result = model.flyoutResult
    const cards = [
        ...Object.values(result?.dailySetPromotions ?? {}).flat(),
        ...(result?.morePromotions ?? []),
        ...(result?.morePromotionsWithoutPromotionalItems ?? [])
    ]
    return cards.find(card => card.offerId === offerId)
}

export class FlyoutActivityReport {
    constructor(private readonly bot: BotContext) {}

    async report(promotion: BasePromotion): Promise<FlyoutReportResult | null> {
        const identity = this.bot.browser.userAgentManager.getRequestHeaders(this.bot.isMobile, true)
        const locale = localeRequestHeaders(this.bot.accountLocale.acceptLanguage)
        const page = await this.bot.sessionState.browserRequest<string>({
            url: URLs.bing.rewardsFlyoutPage,
            method: 'GET',
            headers: mergeRequestHeaders({ ...locale, Referer: `${URLs.bing.origin}/` }, identity),
            responseType: 'text',
            retries: 0
        })
        if (page.status < 200 || page.status >= 300 || typeof page.data !== 'string')
            throw new Error(`Flyout page returned status ${page.status}`)

        const model = extractFlyoutViewModel(page.data)
        const card = findCard(model, promotion.offerId)
        const userId = model.userId
        if (typeof userId !== 'string' || !userId || !card?.hash) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'FLYOUT-REPORT',
                `Flyout has no reportable card | offerId=${promotion.offerId} | card=${Boolean(card)} | hash=${Boolean(card?.hash)} | userId=${Boolean(userId)}`
            )
            return null
        }

        const response = await this.bot.sessionState.browserRequest<unknown>({
            url: URLs.bing.rewardsFlyoutReportActivity,
            method: 'POST',
            headers: mergeRequestHeaders(
                {
                    ...locale,
                    Accept: '*/*',
                    'Content-Type': 'application/json',
                    Origin: URLs.bing.origin,
                    Referer: URLs.bing.rewardsFlyoutPage
                },
                identity
            ),
            data: JSON.stringify({
                ActivityType: text(card.activityType, 'bingredirect'),
                ActivitySubType: text(card.promotionSubtype, ''),
                OfferId: promotion.offerId,
                Channel: text(model.channel, 'BingFlyout'),
                PartnerId: text(model.partnerId, 'BingRewards'),
                UserId: userId,
                AuthKey: card.hash,
                ActivityCount: 1
            }),
            responseType: 'json',
            retries: 0
        })

        const body = (typeof response.data === 'object' && response.data !== null ? response.data : {}) as {
            ErrorDetail?: { ErrorCode?: number }
            OfferComplete?: boolean
            EarnedCredits?: number
        }
        const result = {
            offerId: promotion.offerId,
            accepted: response.status >= 200 && response.status < 300 && body.ErrorDetail?.ErrorCode === 0,
            offerComplete: body.OfferComplete === true,
            earnedCredits: pointValue(body.EarnedCredits)
        }
        this.bot.logger.debug(
            this.bot.isMobile,
            'FLYOUT-REPORT',
            `Report response | offerId=${promotion.offerId} | status=${response.status} | errorCode=${body.ErrorDetail?.ErrorCode ?? 'none'} | offerComplete=${result.offerComplete} | earnedCredits=${result.earnedCredits ?? 'unknown'}`
        )
        return result
    }
}
