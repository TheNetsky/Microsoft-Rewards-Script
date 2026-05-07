import type { AxiosRequestConfig } from 'axios'
import type { Page } from 'patchright'
import type { BasePromotion } from '../../../interface/DashboardData'
import type { PanelFlyoutData } from '../../../interface/PanelFlyoutData'
import { Workers } from '../../Workers'

export class UrlRewardNew extends Workers {
    private readonly modernQuestNextAction = '70babbc81d2724f60d29a95c03b3d739cba77cea92'

    private cookieHeader: string = ''

    private fingerprintHeader: { [x: string]: string } = {}

    private gainedPoints: number = 0

    private oldBalance: number = this.bot.userData.currentPoints

    private getPromotionAttributes(attributes: unknown): Record<string, unknown> {
        if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
            return {}
        }
        return attributes as Record<string, unknown>
    }

    private resolveTimezoneOffset(promotion: BasePromotion): string {
        const attrs = this.getPromotionAttributes(promotion.attributes)
        const fromAttrs = String(attrs.timezoneOffset ?? '').trim()
        if (fromAttrs) {
            return fromAttrs
        }

        return String(new Date().getTimezoneOffset())
    }

    private getActiveRewardsPageForUrlReward(): Page {
        const page = this.bot.isMobile ? this.bot.mainMobilePage : this.bot.mainDesktopPage
        if (!page || page.isClosed()) {
            throw new Error('No active rewards page available for UrlReward browser-context request')
        }
        return page
    }

    private async requestWithBrowserContext(
        request: AxiosRequestConfig
    ): Promise<{ status: number; data: string }> {
        const page = this.getActiveRewardsPageForUrlReward()
        const method = String(request.method ?? 'GET').toUpperCase()
        const url = String(request.url ?? '')
        const headers = (request.headers ?? {}) as Record<string, string>

        try {
            const response =
                method === 'POST'
                    ? await page.context().request.post(url, {
                          failOnStatusCode: false,
                          headers,
                          data:
                              typeof request.data === 'string'
                                  ? request.data
                                  : request.data !== undefined
                                    ? JSON.stringify(request.data)
                                    : undefined
                      })
                    : await page.context().request.get(url, {
                          failOnStatusCode: false,
                          headers
                      })

            return {
                status: response.status(),
                data: await response.text()
            }
        } catch (contextError) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'URL-REWARD',
                `Browser-context request failed, trying page fetch fallback | method=${method} | url=${url} | error=${
                    contextError instanceof Error ? contextError.message : String(contextError)
                }`
            )

            const result = await page.evaluate(
                async ({ requestUrl, requestMethod, requestHeaders, requestBody }) => {
                    const response = await fetch(requestUrl, {
                        method: requestMethod,
                        credentials: 'include',
                        cache: 'no-store',
                        headers: requestHeaders,
                        body: requestMethod === 'POST' ? requestBody : undefined
                    })

                    return {
                        status: response.status,
                        data: await response.text()
                    }
                },
                {
                    requestUrl: url,
                    requestMethod: method,
                    requestHeaders: headers,
                    requestBody:
                        typeof request.data === 'string'
                            ? request.data
                            : request.data !== undefined
                              ? JSON.stringify(request.data)
                              : undefined
                }
            )

            return {
                status: result.status,
                data: result.data
            }
        }
    }

    private redactHeaders(headers: Record<string, string>): Record<string, string> {
        const clone = { ...headers }
        if (clone.Cookie) clone.Cookie = `[redacted:${clone.Cookie.length}]`
        if (clone.cookie) clone.cookie = `[redacted:${clone.cookie.length}]`
        if (clone.Authorization) clone.Authorization = '[redacted]'
        if (clone.authorization) clone.authorization = '[redacted]'
        return clone
    }

    private buildQuestIdFromOfferId(offerId: string): string | undefined {
        const urlRewardPattern = offerId.match(/^(.*)_pcchild\d+_urlreward_(.*)$/i)
        if (urlRewardPattern?.[1] && urlRewardPattern[2]) {
            return `${urlRewardPattern[1]}_pcparent_${urlRewardPattern[2]}`
        }

        const genericPattern = offerId.match(/^(.*)_pcchild\d+_(.*)$/i)
        if (!genericPattern?.[1] || !genericPattern[2]) {
            return undefined
        }

        return `${genericPattern[1]}_pcparent_${genericPattern[2]}`
    }

    private buildStateTree(questId: string, forPost: boolean = false): string {
        const tree = [
            '',
            {
                children: [
                    '(nav)',
                    {
                        children: [
                            'earn',
                            {
                                children: [
                                    'quest',
                                    {
                                        children: [
                                            ['questId', questId, 'd', null],
                                            { children: ['__PAGE__', {}, null, null, 0] },
                                            null,
                                            null,
                                            0
                                        ]
                                    },
                                    null,
                                    null,
                                    0
                                ]
                            },
                            null,
                            null,
                            0
                        ]
                    },
                    null,
                    null,
                    0
                ]
            },
            null,
            ...(forPost ? [null, 16] : ['refetch', 16])
        ]

        return encodeURIComponent(JSON.stringify(tree))
    }

    private async resolvePunchCardHashFromQuest(offerId: string): Promise<string | undefined> {
        const questId = this.buildQuestIdFromOfferId(offerId)
        if (!questId) {
            return undefined
        }

        const stateTree = this.buildStateTree(questId)

        const request: AxiosRequestConfig = {
            url: `https://rewards.bing.com/earn/quest/${questId}?_rsc=178ia`,
            method: 'GET',
            headers: {
                ...this.fingerprintHeader,
                accept: '*/*',
                rsc: '1',
                'next-router-state-tree': stateTree,
                Cookie: this.cookieHeader,
                Referer: `https://rewards.bing.com/earn/quest/${questId}`,
                Origin: 'https://rewards.bing.com'
            }
        }

        this.bot.logger.debug(
            this.bot.isMobile,
            'URL-REWARD',
            `Fetching quest RSC for punchcard hash | offerId=${offerId} | questId=${questId}`
        )

        const response = await this.requestWithBrowserContext(request)
        const responseText = response.data
        const escapedOfferId = offerId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const hashRegex = new RegExp(`"offerId":"${escapedOfferId}".*?"hash":"([a-f0-9]{40,128})"`, 'is')
        const match = responseText.match(hashRegex)

        if (!match?.[1]) {
            return undefined
        }

        return match[1]
    }

    private async resolveHashFromDashboardPunchCards(offerId: string): Promise<string | undefined> {
        try {
            const dashboardData = await this.bot.browser.func.getDashboardData()
            const punchCards = dashboardData?.punchCards ?? []

            for (const card of punchCards) {
                const children = card?.childPromotions ?? []
                const child = children.find(
                    promotion => promotion?.offerId === offerId || promotion?.name === offerId
                )
                const hash = child?.hash
                if (hash) {
                    return hash
                }
            }
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'URL-REWARD',
                `Dashboard punchcard hash lookup failed | offerId=${offerId} | message=${error instanceof Error ? error.message : String(error)}`
            )
        }

        return undefined
    }

    private async submitModernPunchCardQuestAction(promotion: BasePromotion, questId: string): Promise<number> {
        const offerId = promotion.offerId
        const timezoneOffset = this.resolveTimezoneOffset(promotion)
        const stateTreeGet = this.buildStateTree(questId)
        const stateTreePost = this.buildStateTree(questId, true)
        const referer = `https://rewards.bing.com/earn/quest/${questId}`

        const getRequest: AxiosRequestConfig = {
            url: `${referer}?_rsc=178ia`,
            method: 'GET',
            headers: {
                ...this.fingerprintHeader,
                accept: '*/*',
                rsc: '1',
                'next-router-state-tree': stateTreeGet,
                Cookie: this.cookieHeader,
                Referer: referer,
                Origin: 'https://rewards.bing.com'
            }
        }

        this.bot.logger.debug(
            this.bot.isMobile,
            'URL-REWARD',
            `Fetching modern quest action context | offerId=${offerId} | questId=${questId}`
        )

        const getResponse = await this.requestWithBrowserContext(getRequest)
        const responseText = getResponse.data

        const sessionId = responseText.match(/\b[a-f0-9]{64}\b/i)?.[0]
        const nextAction = this.modernQuestNextAction

        if (!sessionId) {
            throw new Error('Missing modern quest action context | sessionId=false')
        }

        const payload = [
            sessionId,
            11,
            {
                offerid: offerId,
                isPromotional: '$undefined',
                timezoneOffset
            }
        ]

        const postHeaders: Record<string, string> = {
            ...this.fingerprintHeader,
            accept: 'text/x-component',
            'Content-Type': 'text/plain;charset=UTF-8',
            Cookie: this.cookieHeader,
            'next-router-state-tree': stateTreePost,
            Referer: referer,
            Origin: 'https://rewards.bing.com'
        }
        postHeaders['next-action'] = nextAction

        const postRequest: AxiosRequestConfig = {
            url: referer,
            method: 'POST',
            headers: postHeaders,
            data: JSON.stringify(payload)
        }

        this.bot.logger.debug(
            this.bot.isMobile,
            'URL-REWARD',
            `Sending modern quest action | offerId=${offerId} | questId=${questId} | nextAction=present`
        )
        this.bot.logger.debug(
            this.bot.isMobile,
            'URL-REWARD',
            `Modern quest POST request | url=${postRequest.url} | headers=${JSON.stringify(this.redactHeaders(postRequest.headers as Record<string, string>))} | body=${typeof postRequest.data === 'string' ? postRequest.data : JSON.stringify(postRequest.data)}`
        )

        const postResponse = await this.requestWithBrowserContext(postRequest)
        const postBody = postResponse.data
        this.bot.logger.debug(
            this.bot.isMobile,
            'URL-REWARD',
            `Modern quest POST response | status=${postResponse.status} | bodySnippet=${postBody.substring(0, 800)}`
        )
        return postResponse.status
    }

    public async doUrlReward(promotion: BasePromotion) {
        const offerId = promotion.offerId

        this.bot.logger.info(
            this.bot.isMobile,
            'URL-REWARD',
            `Starting UrlReward | offerId=${offerId} | geo=${this.bot.userData.geoLocale} | oldBalance=${this.oldBalance}`
        )

        try {
            this.cookieHeader = this.bot.browser.func.buildCookieHeader(
                this.bot.isMobile ? this.bot.cookies.mobile : this.bot.cookies.desktop,
                ['bing.com', 'live.com', 'microsoftonline.com']
            )

            const fingerprintHeaders = { ...this.bot.fingerprint.headers }
            delete fingerprintHeaders['Cookie']
            delete fingerprintHeaders['cookie']
            this.fingerprintHeader = fingerprintHeaders

            this.bot.logger.debug(
                this.bot.isMobile,
                'URL-REWARD',
                `Prepared UrlReward headers | offerId=${offerId} | cookieLength=${this.cookieHeader.length} | fingerprintHeaderKeys=${Object.keys(this.fingerprintHeader).length}`
            )

            const questId = this.buildQuestIdFromOfferId(offerId)
            const useQuestFlow = this.bot.rewardsVersion === 'modern' && !!questId
            let responseStatus = 0
            let shouldUsePanelFlow = !useQuestFlow

            if (useQuestFlow && questId) {
                try {
                    responseStatus = await this.submitModernPunchCardQuestAction(promotion, questId)
                } catch (questFlowError) {
                    shouldUsePanelFlow = true
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'URL-REWARD',
                        `Modern quest flow failed, falling back to panel/hash flow | offerId=${offerId} | questId=${questId} | message=${
                            questFlowError instanceof Error ? questFlowError.message : String(questFlowError)
                        }`
                    )
                }
            }

            if (shouldUsePanelFlow) {
                const panelData: PanelFlyoutData | undefined = this.bot.panelData
                const todayKey = this.bot.utils.getFormattedDate()
                const panelMorePromotions = panelData?.flyoutResult?.morePromotions ?? []
                const panelDailySetPromotions = panelData?.flyoutResult?.dailySetPromotions?.[todayKey] ?? []
                const panelPromotion = panelData
                    ? panelMorePromotions.find(p => p.offerId === offerId) ||
                      panelDailySetPromotions.find(p => p.offerId === offerId)
                    : undefined
                let authKey = panelPromotion?.hash
                let activityType = panelPromotion?.activityType || 'urlreward'

                if (!authKey && this.bot.rewardsVersion === 'modern') {
                    authKey = await this.resolvePunchCardHashFromQuest(offerId)
                    if (authKey) {
                        this.bot.logger.info(
                            this.bot.isMobile,
                            'URL-REWARD',
                            `Resolved hash via quest RSC fallback | offerId=${offerId}`
                        )
                    }
                }

                if (!authKey) {
                    authKey = await this.resolveHashFromDashboardPunchCards(offerId)
                    if (authKey) {
                        this.bot.logger.info(
                            this.bot.isMobile,
                            'URL-REWARD',
                            `Resolved hash via dashboard punchcards | offerId=${offerId}`
                        )
                    }
                }

                if (!authKey) {
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'URL-REWARD',
                        `Promotion hash not found in panel, quest, or dashboard punchcards | offerId=${offerId}`
                    )
                    return
                }

                const jsonData = {
                    ActivityCount: 1,
                    ActivityType: activityType,
                    ActivitySubType: '',
                    OfferId: offerId,
                    AuthKey: authKey,
                    Channel: panelData?.channel ?? 'BingFlyout',
                    PartnerId: panelData?.partnerId ?? 'BingRewards',
                    UserId: panelData?.userId ?? ''
                }

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'URL-REWARD',
                    `Prepared UrlReward form data | offerId=${offerId} | hash=${authKey} | activityType=${activityType}`
                )

                const request: AxiosRequestConfig = {
                    url: 'https://www.bing.com/msrewards/api/v1/reportactivity',
                    method: 'POST',
                    headers: {
                        ...this.fingerprintHeader,
                        Cookie: this.cookieHeader,
                        Referer: 'https://www.bing.com/',
                        Origin: 'https://www.bing.com'
                    },
                    data: jsonData
                }

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'URL-REWARD',
                    `Sending UrlReward request | offerId=${offerId} | url=${request.url}`
                )
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'URL-REWARD',
                    `Panel UrlReward request | headers=${JSON.stringify(this.redactHeaders(request.headers as Record<string, string>))} | body=${JSON.stringify(jsonData)}`
                )

                const response = await this.bot.axios.request(request)
                responseStatus = response.status
                const responseBody =
                    typeof response.data === 'string'
                        ? response.data
                        : JSON.stringify(response.data ?? {})
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'URL-REWARD',
                    `Panel UrlReward response | status=${response.status} | bodySnippet=${responseBody.substring(0, 800)}`
                )
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'URL-REWARD',
                `Received UrlReward response | offerId=${offerId} | status=${responseStatus}`
            )

            const newBalance = await this.bot.browser.func.getCurrentPoints()
            this.gainedPoints = newBalance - this.oldBalance

            this.bot.logger.debug(
                this.bot.isMobile,
                'URL-REWARD',
                `Balance delta after UrlReward | offerId=${offerId} | oldBalance=${this.oldBalance} | newBalance=${newBalance} | gainedPoints=${this.gainedPoints}`
            )

            if (this.gainedPoints > 0) {
                this.bot.userData.currentPoints = newBalance
                this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + this.gainedPoints

                this.bot.logger.info(
                    this.bot.isMobile,
                    'URL-REWARD',
                    `Completed UrlReward | offerId=${offerId} | status=${responseStatus} | gainedPoints=${this.gainedPoints} | newBalance=${newBalance}`,
                    'green'
                )
            } else {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'URL-REWARD',
                    `Failed UrlReward with no points | offerId=${offerId} | status=${responseStatus} | oldBalance=${this.oldBalance} | newBalance=${newBalance}`
                )
            }

            this.bot.logger.debug(this.bot.isMobile, 'URL-REWARD', `Waiting after UrlReward | offerId=${offerId}`)

            await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 10000))
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'URL-REWARD',
                `Error in doUrlReward | offerId=${promotion.offerId} | message=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }
}
