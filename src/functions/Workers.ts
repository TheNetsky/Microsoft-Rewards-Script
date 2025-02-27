import { Page } from 'rebrowser-playwright'

import { DashboardData, MorePromotion, PromotionalItem, PunchCard } from '../interface/DashboardData'

import { MicrosoftRewardsBot } from '../index'

export class Workers {
    public bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    // Daily Set
    async doDailySet(page: Page, data: DashboardData) {
        const todayData = data.dailySetPromotions[this.bot.utils.getFormattedDate()]

        const activitiesUncompleted = todayData?.filter(x => !x.complete && x.pointProgressMax > 0) ?? []

        if (!activitiesUncompleted.length) {
            this.bot.log(this.bot.isMobile, 'DAILY-SET', 'All Daily Set" items have already been completed')
            return
        }

        // Solve Activities
        this.bot.log(this.bot.isMobile, 'DAILY-SET', 'Started solving "Daily Set" items')

        await this.solveActivities(page, activitiesUncompleted)

        page = await this.bot.browser.utils.getLatestTab(page)

        // Always return to the homepage if not already
        await this.bot.browser.func.goHome(page)

        this.bot.log(this.bot.isMobile, 'DAILY-SET', 'All "Daily Set" items have been completed')
    }

    // Punch Card
    async doPunchCard(page: Page, data: DashboardData) {

        const punchCardsUncompleted = data.punchCards?.filter(x => x.parentPromotion && !x.parentPromotion.complete) ?? [] // Only return uncompleted punch cards

        if (!punchCardsUncompleted.length) {
            this.bot.log(this.bot.isMobile, 'PUNCH-CARD', 'All "Punch Cards" have already been completed')
            return
        }

        for (const punchCard of punchCardsUncompleted) {

            // Ensure parentPromotion exists before proceeding
            if (!punchCard.parentPromotion?.title) {
                this.bot.log(this.bot.isMobile, 'PUNCH-CARD', `Skipped punchcard "${punchCard.name}" | Reason: Parent promotion is missing!`, 'warn')
                continue
            }

            // Get latest page for each card
            page = await this.bot.browser.utils.getLatestTab(page)

            const activitiesUncompleted = punchCard.childPromotions.filter(x => !x.complete) // Only return uncompleted activities

            // Solve Activities
            this.bot.log(this.bot.isMobile, 'PUNCH-CARD', `Started solving "Punch Card" items for punchcard: "${punchCard.parentPromotion.title}"`)

            // Got to punch card index page in a new tab
            await page.goto(punchCard.parentPromotion.destinationUrl, { referer: this.bot.config.baseURL })

            // Wait for new page to load, max 10 seconds, however try regardless in case of error
            await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { })

            await this.solveActivities(page, activitiesUncompleted, punchCard)

            page = await this.bot.browser.utils.getLatestTab(page)

            const pages = page.context().pages()

            if (pages.length > 3) {
                await page.close()
            } else {
                await this.bot.browser.func.goHome(page)
            }

            this.bot.log(this.bot.isMobile, 'PUNCH-CARD', `All items for punchcard: "${punchCard.parentPromotion.title}" have been completed`)
        }

        this.bot.log(this.bot.isMobile, 'PUNCH-CARD', 'All "Punch Card" items have been completed')
    }

    // More Promotions
    async doMorePromotions(page: Page, data: DashboardData) {
        const morePromotions = data.morePromotions

        // Check if there is a promotional item
        if (data.promotionalItem) {
            morePromotions.push(data.promotionalItem as unknown as MorePromotion)
        }

        // 更严格的筛选条件：
        // 1. !x.complete - 任务未完成
        // 2. x.pointProgressMax > 0 - 有积分可赚取
        // 3. x.exclusiveLockedFeatureStatus !== 'locked' - 任务未锁定
        // 4. x.promotionType in ['quiz', 'urlreward'] - 支持的任务类型
        // 5. x.pointProgress < x.pointProgressMax - 确保积分未达到上限
        const activitiesUncompleted = morePromotions?.filter(x => 
            !x.complete && 
            x.pointProgressMax > 0 && 
            x.exclusiveLockedFeatureStatus !== 'locked' &&
            ['quiz', 'urlreward'].includes(x.promotionType) &&
            x.pointProgress < x.pointProgressMax
        ) ?? []

        if (!activitiesUncompleted.length) {
            this.bot.log(this.bot.isMobile, 'MORE-PROMOTIONS', 'All "More Promotion" items have already been completed')
            return
        }

        // 添加详细日志
        this.bot.log(this.bot.isMobile, 'MORE-PROMOTIONS', `Found ${activitiesUncompleted.length} incomplete promotions:`)
        activitiesUncompleted.forEach(x => {
            this.bot.log(
                this.bot.isMobile, 
                'MORE-PROMOTIONS', 
                `- ${x.title} (${x.promotionType}): ${x.pointProgress}/${x.pointProgressMax} points`
            )
        })

        // Solve Activities
        this.bot.log(this.bot.isMobile, 'MORE-PROMOTIONS', 'Started solving "More Promotions" items')

        page = await this.bot.browser.utils.getLatestTab(page)

        await this.solveActivities(page, activitiesUncompleted)

        page = await this.bot.browser.utils.getLatestTab(page)

        // Always return to the homepage if not already
        await this.bot.browser.func.goHome(page)

        this.bot.log(this.bot.isMobile, 'MORE-PROMOTIONS', 'All "More Promotion" items have been completed')
    }

    // Solve all the different types of activities
    private async solveActivities(activityPage: Page, activities: PromotionalItem[] | MorePromotion[], punchCard?: PunchCard) {
        const activityInitial = activityPage.url() // Homepage for Daily/More and Index for promotions

        for (const activity of activities) {
            try {
                // Reselect the worker page
                activityPage = await this.bot.browser.utils.getLatestTab(activityPage)

                const pages = activityPage.context().pages()
                if (pages.length > 3) {
                    await activityPage.close()

                    activityPage = await this.bot.browser.utils.getLatestTab(activityPage)
                }

                await this.bot.utils.wait(1000)

                if (activityPage.url() !== activityInitial) {
                    await activityPage.goto(activityInitial)
                }


                let selector = `[data-bi-id^="${activity.offerId}"] .pointLink:not(.contentContainer .pointLink)`

                if (punchCard) {
                    selector = await this.bot.browser.func.getPunchCardActivity(activityPage, activity)

                } else if (activity.name.toLowerCase().includes('membercenter') || activity.name.toLowerCase().includes('exploreonbing')) {
                    selector = `[data-bi-id^="${activity.name}"] .pointLink:not(.contentContainer .pointLink)`
                }

                // 等待页面加载并等待confetti动画消失
                await activityPage.waitForLoadState('domcontentloaded')
                await this.bot.utils.wait(2000)
                
                // 尝试移除confetti元素
                await activityPage.evaluate(() => {
                    const confettiElements = document.querySelectorAll('.confetti-image-block, .dashboardPopUpModalImageContainer');
                    confettiElements.forEach(el => el.remove());
                }).catch(() => {});

                // 检查按钮是否存在
                const buttonExists = await activityPage.$(selector).then(Boolean)
                if (!buttonExists) {
                    this.bot.log(
                        this.bot.isMobile, 
                        'ACTIVITY', 
                        `Activity "${activity.title}" appears to be already completed (button not found)`
                    )
                    // 标记任务完成，继续下一个
                    continue
                }

                // 使用force选项强制点击
                await activityPage.click(selector, { 
                    timeout: 5000,
                    force: true // 忽略覆盖元素强制点击
                }).catch(async (error) => {
                    this.bot.log(this.bot.isMobile, 'ACTIVITY', `Failed to click button for "${activity.title}": ${error}`, 'warn')
                    return
                })

                // Wait for the new tab to fully load, ignore error.
                /*
                Due to common false timeout on this function, we're ignoring the error regardless, if it worked then it's faster,
                if it didn't then it gave enough time for the page to load.
                */
                await activityPage.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => { })
                await this.bot.utils.wait(2000)

                switch (activity.promotionType) {
                    // Quiz (Poll, Quiz or ABC)
                    case 'quiz':
                        switch (activity.pointProgressMax) {
                            // Poll or ABC (Usually 10 points)
                            case 10:
                                // Normal poll
                                if (activity.destinationUrl.toLowerCase().includes('pollscenarioid')) {
                                    this.bot.log(this.bot.isMobile, 'ACTIVITY', `Found activity type: "Poll" title: "${activity.title}"`)
                                    await activityPage.click(selector)
                                    activityPage = await this.bot.browser.utils.getLatestTab(activityPage)
                                    await this.bot.activities.doPoll(activityPage)
                                } else { // ABC
                                    this.bot.log(this.bot.isMobile, 'ACTIVITY', `Found activity type: "ABC" title: "${activity.title}"`)
                                    await activityPage.click(selector)
                                    activityPage = await this.bot.browser.utils.getLatestTab(activityPage)
                                    await this.bot.activities.doABC(activityPage)
                                }
                                break

                            // This Or That Quiz (Usually 50 points)
                            case 50:
                                this.bot.log(this.bot.isMobile, 'ACTIVITY', `Found activity type: "ThisOrThat" title: "${activity.title}"`)
                                await activityPage.click(selector)
                                activityPage = await this.bot.browser.utils.getLatestTab(activityPage)
                                await this.bot.activities.doThisOrThat(activityPage)
                                break

                            // Quizzes are usually 30-40 points
                            default:
                                this.bot.log(this.bot.isMobile, 'ACTIVITY', `Found activity type: "Quiz" title: "${activity.title}"`)
                                await activityPage.click(selector)
                                activityPage = await this.bot.browser.utils.getLatestTab(activityPage)
                                await this.bot.activities.doQuiz(activityPage)
                                break
                        }
                        break

                    // UrlReward (Visit)
                    case 'urlreward':
                        // Search on Bing are subtypes of "urlreward"
                        if (activity.name.toLowerCase().includes('exploreonbing')) {
                            this.bot.log(this.bot.isMobile, 'ACTIVITY', `Found activity type: "SearchOnBing" title: "${activity.title}"`)
                            await activityPage.click(selector, { timeout: 5000 }).catch(async (error) => {
                                this.bot.log(this.bot.isMobile, 'ACTIVITY', `Failed to click SearchOnBing button for "${activity.title}": ${error}`, 'warn')
                                return
                            })
                            activityPage = await this.bot.browser.utils.getLatestTab(activityPage)
                            await this.bot.activities.doSearchOnBing(activityPage, activity)

                        } else {
                            this.bot.log(this.bot.isMobile, 'ACTIVITY', `Found activity type: "UrlReward" title: "${activity.title}"`)
                            // 尝试点击按钮，如果失败则认为任务已完成
                            await activityPage.click(selector, { timeout: 5000 }).catch(async (error) => {
                                this.bot.log(this.bot.isMobile, 'ACTIVITY', `Failed to click UrlReward button for "${activity.title}": ${error}`, 'warn')
                                return
                            })
                            activityPage = await this.bot.browser.utils.getLatestTab(activityPage)
                            await this.bot.activities.doUrlReward(activityPage)
                        }
                        break

                    // Unsupported types
                    default:
                        this.bot.log(this.bot.isMobile, 'ACTIVITY', `Skipped activity "${activity.title}" | Reason: Unsupported type: "${activity.promotionType}"!`, 'warn')
                        break
                }

                // Cooldown
                await this.bot.utils.wait(2000)

            } catch (error) {
                this.bot.log(this.bot.isMobile, 'ACTIVITY', 'An error occurred:' + error, 'error')
            }

        }
    }

}