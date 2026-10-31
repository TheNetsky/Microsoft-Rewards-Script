import { BrowserTaskPage } from '../../browser/BrowserTaskPage'
import { BaseActivity } from '../shared/activities/BaseActivity'
import type { BasePromotion, RewardsState } from '../types/RewardsState'
import { BrowserRewardNavigator } from './actions/BrowserRewardNavigator'
import { browserOfferKey, confirmBrowserOffer } from './BrowserTaskPass'
import { readEarnPage } from './parsers/EarnPageParser'
import type { Page } from 'patchright'
import { mergeAccountInfo } from '../shared/parsers/NormalizeRewards'

export class BrowserEarnTasks extends BaseActivity {
    private readonly loggedResets = new Set<string>()

    async read(seed: RewardsState | (() => Promise<RewardsState>), passPage?: Page): Promise<RewardsState> {
        const navigator = new BrowserRewardNavigator(this.bot)
        const source = navigator.getActivePage()
        if (!source) throw new Error('Browser page unavailable for /earn tasks')
        const task = passPage ? undefined : await BrowserTaskPage.createRewards(source)
        const page = passPage ?? task!.page
        try {
            await navigator.openEarn(page, true)

            const account = typeof seed === 'function' ? await seed() : seed
            const snapshot = this.bot.pageParser.snapshotPage(await page.content())
            const rendered = await readEarnPage(page)
            const resetTimes = new Set(
                snapshot.streaks.map(streak => streak.resetAt).filter((time): time is string => !!time)
            )
            for (const resetAt of resetTimes) {
                if (this.loggedResets.has(resetAt)) continue
                this.loggedResets.add(resetAt)
                const timezone = this.bot.userData.timezone
                const local = new Date(resetAt).toLocaleString('en-GB', { timeZone: timezone, hour12: false })
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'REWARDS-RESET',
                    `Daily streak reset | resetAt=${resetAt} | local=${local} | timezone=${timezone} | remainingMinutes=${Math.max(0, Math.ceil((Date.parse(resetAt) - Date.now()) / 60000))}`
                )
            }
            if (!resetTimes.size && rendered.streakResetText && !this.loggedResets.has(rendered.streakResetText)) {
                this.loggedResets.add(rendered.streakResetText)
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'REWARDS-RESET',
                    `Daily streak reset | displayed="${rendered.streakResetText}" | exactTime=unavailable`
                )
            }
            snapshot.account = mergeAccountInfo(account.account, snapshot.account)
            this.bot.reactSnapshot = snapshot
            if (this.bot.isMobile) this.bot.reactSnapshots.mobile = snapshot
            else this.bot.reactSnapshots.desktop = snapshot
            const today = this.bot.utils.formatDate(Date.now(), this.bot.userData.timezone)
            const date = today.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$1-$2')
            const daily: BasePromotion[] = []
            const more: BasePromotion[] = []
            const seen = new Set<string>()
            for (const card of rendered.cards) {
                const cardKey = browserOfferKey({
                    title: card.title,
                    description: card.description,
                    destinationUrl: card.destination
                })
                const matches = snapshot.offers.filter(offer =>
                    card.offerId
                        ? offer.offerId === card.offerId
                        : browserOfferKey({
                              title: offer.title,
                              description: offer.description,
                              destinationUrl: offer.destination
                          }) === cardKey
                )
                const offer = matches.length === 1 ? matches[0] : undefined
                if (offer?.isPromotional || (offer?.date && offer.date > date)) continue
                if (!card.hasPointsBadge && !offer) continue
                const promotion: BasePromotion = {
                    offerId: card.offerId || offer?.offerId || cardKey,
                    name: offer?.offerId ?? null,
                    title: card.title,
                    description: card.description,
                    destinationUrl: card.destination,
                    promotionType: 'urlreward',
                    promotionSubtype:
                        card.section === 'exploreonbing' ? 'exploreOnBing' : (offer?.promotionSubtype ?? ''),
                    attributes: { earnSection: card.section },
                    complete: card.complete,
                    priority: 0,
                    isHidden: false,
                    pointProgress: card.complete ? card.points : 0,
                    pointProgressKnown: false,
                    pointProgressMax: card.points,
                    activityProgress: card.complete ? 1 : 0,
                    activityProgressMax: 1,
                    exclusiveLockedFeatureStatus: card.disabled && !card.complete ? 'locked' : ''
                }
                if (seen.has(promotion.offerId)) continue
                seen.add(promotion.offerId)
                if (promotion.complete) confirmBrowserOffer(promotion)
                const section = card.section === 'dailyset' ? daily : more
                section.push(promotion)
            }
            this.bot.logger.debug(
                this.bot.isMobile,
                'EARN-TASKS',
                `Read rendered /earn cards | dailySet=${daily.length} | more=${more.length} | explore=${more.filter(item => item.promotionSubtype === 'exploreOnBing').length}`
            )
            return {
                ...account,
                account: snapshot.account,
                dashboard: {
                    ...account.dashboard,
                    userStatus: { ...account.dashboard.userStatus, level: snapshot.account.level },
                    dailySetPromotions: { [today]: daily },
                    morePromotions: more,
                    morePromotionsWithoutPromotionalItems: [],
                    promotionalItem: null,
                    promotionalItems: [],
                    punchCards: []
                },
                sourceInfo: {
                    source: 'rewards-earn',
                    activities: [],
                    missingSections: account.sourceInfo.missingSections.filter(section => section === 'userWarnings')
                },
                raw: { source: 'rewards-earn', payload: { snapshot, rendered } }
            }
        } finally {
            await task?.close()
        }
    }
}
