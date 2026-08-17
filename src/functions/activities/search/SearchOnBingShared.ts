import * as fs from 'fs'
import path from 'path'

import { URLs } from '../../../constants/urls'
import type { BasePromotion, Dashboard } from '../../../interface/DashboardData'
import type { MicrosoftRewardsBot } from '../../../index'

interface ActivityQueries {
    title: string
    queries: string[]
}

export async function activateSearchOnBing(bot: MicrosoftRewardsBot, promotion: BasePromotion): Promise<boolean> {
    const offerId = promotion.offerId
    const actionId = bot.nextActions.reportActivity

    if (!actionId) {
        bot.logger.warn(
            bot.isMobile,
            'SEARCH-ON-BING-ACTIVATE',
            `跳过 ${offerId}: 未在 bundle 中发现 "reportActivity"`
        )
        return false
    }

    const live = await bot.browser.func.ensureOffer(offerId)
    const hash = live?.hash ?? promotion.hash ?? null
    if (!hash) {
        bot.logger.warn(
            bot.isMobile,
            'SEARCH-ON-BING-ACTIVATE',
            `跳过 ${offerId}: 激活活动无可用 hash`
        )
        return false
    }

    try {
        const { status, acknowledged } = await bot.browser.func.reportServerAction(actionId, [
            hash,
            11,
            {
                offerid: offerId,
                isPromotional: '$undefined',
                timezoneOffset: bot.userData.timezoneOffset
            }
        ])

        bot.logger.info(
            bot.isMobile,
            'SEARCH-ON-BING-ACTIVATE',
            `活动已激活 | offerId=${offerId} | 状态=${status} | 已确认=${acknowledged}`
        )
        return acknowledged
    } catch (error) {
        bot.logger.error(
            bot.isMobile,
            'SEARCH-ON-BING-ACTIVATE',
            `激活失败 | offerId=${offerId} | 错误=${error instanceof Error ? error.message : String(error)}`
        )
        return false
    }
}

export function findSearchOnBingOffer(dashboard: Dashboard, offerId: string): BasePromotion | undefined {
    const offers = [
        ...Object.values(dashboard.dailySetPromotions ?? {}).flat(),
        ...(dashboard.morePromotions ?? []),
        ...(dashboard.promotionalItems ?? []),
        ...(dashboard.promotionalItem ? [dashboard.promotionalItem] : [])
    ]
    return offers.find(offer => offer.offerId === offerId)
}

export async function getSearchOnBingQueries(bot: MicrosoftRewardsBot, promotion: BasePromotion): Promise<string[]> {
    try {
        let activities: ActivityQueries[]

        if (bot.config.searchOnBingLocalQueries) {
            bot.logger.debug(bot.isMobile, 'SEARCH-ON-BING-QUERY', '使用本地查询词配置文件')
            activities = JSON.parse(
                fs.readFileSync(path.join(__dirname, '../../bing-search-activity-queries.json'), 'utf8')
            ) as ActivityQueries[]
        } else {
            bot.logger.debug(bot.isMobile, 'SEARCH-ON-BING-QUERY', '从远程仓库获取查询词配置')
            activities = (
                await bot.http.request<ActivityQueries[]>({
                    method: 'GET',
                    url: URLs.github.searchOnBingQueries
                })
            ).data
        }

        const match = activities.find(
            activity => bot.utils.normalizeString(activity.title) === bot.utils.normalizeString(promotion.title)
        )
        if (match?.queries.length) {
            const shuffled = bot.utils.shuffleArray(match.queries)
            bot.logger.info(
                bot.isMobile,
                'SEARCH-ON-BING-QUERY',
                `为 "${promotion.title}" 找到 ${shuffled.length} 条查询词 | 来源=${bot.config.searchOnBingLocalQueries ? '本地' : '远程'}`
            )
            return shuffled
        }

        bot.logger.info(
            bot.isMobile,
            'SEARCH-ON-BING-QUERY',
            `"${promotion.title}" 无精选查询词，回退使用活动标题与描述`
        )
        return fallbackQueries(promotion)
    } catch (error) {
        bot.logger.error(
            bot.isMobile,
            'SEARCH-ON-BING-QUERY',
            `解析查询词出错 | 标题="${promotion.title}" | 错误=${error instanceof Error ? error.message : String(error)} | 回退=标题与描述`
        )
        return fallbackQueries(promotion)
    }
}

function fallbackQueries(promotion: BasePromotion): string[] {
    const title = (promotion.title ?? '').trim()
    const description = (promotion.description ?? '').trim()
    const derived = extractSearchTerm(description)
    return [...new Set([derived, title, description].map(value => value.trim()).filter(Boolean))]
}

// Microsoft currently supplies English instruction prefixes for this fallback path.
function extractSearchTerm(description: string): string {
    if (!description) return ''

    return description
        .trim()
        .replace(
            /^\s*(?:search(?:\s+on\s+bing|\s+bing|\s+the\s+web)?\s+for|look\s+up|find|explore|discover)\b[\s:]+/i,
            ''
        )
        .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
        .replace(/[.!?]+$/g, '')
        .trim()
}
