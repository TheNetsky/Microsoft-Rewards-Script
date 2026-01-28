import type { Page } from 'patchright'
import type { BasePromotion } from '../../../interface/DashboardData'
import { Workers } from '../../Workers'

export class WelcomeTour extends Workers {
    public async doWelcomeTour(promotion: BasePromotion, page: Page): Promise<void> {
        const offerId = promotion.offerId
        const oldBalance = Number(this.bot.userData.currentPoints ?? 0)

        this.bot.logger.info(
            this.bot.isMobile,
            'WELCOME-TOUR',
            `Starting WelcomeTour | offerId=${offerId} | geo=${this.bot.userData.geoLocale} | oldBalance=${oldBalance}`
        )

        try {
            const destinationUrl = promotion.destinationUrl
            if (!destinationUrl) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'WELCOME-TOUR',
                    `No destination URL for WelcomeTour | offerId=${offerId}`
                )
                return
            }

            await page.goto(destinationUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
            await this.bot.utils.wait(this.bot.utils.randomDelay(3000, 5000))

            await this.bot.browser.utils.tryDismissAllMessages(page)

            const tourStarted = await this.startTour(page, offerId)
            if (!tourStarted) {
                this.bot.logger.warn(this.bot.isMobile, 'WELCOME-TOUR', `Could not start tour | offerId=${offerId}`)
                return
            }

            await this.navigateTour(page, offerId)

            const newBalance = await this.bot.browser.func.getCurrentPoints()
            const gainedPoints = newBalance - oldBalance

            if (gainedPoints > 0) {
                this.bot.userData.currentPoints = newBalance
                this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + gainedPoints

                this.bot.logger.info(
                    this.bot.isMobile,
                    'WELCOME-TOUR',
                    `Completed WelcomeTour | offerId=${offerId} | gainedPoints=${gainedPoints} | newBalance=${newBalance}`,
                    'green'
                )
            } else {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'WELCOME-TOUR',
                    `Completed WelcomeTour (no points) | offerId=${offerId} | oldBalance=${oldBalance} | newBalance=${newBalance}`
                )
            }
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'WELCOME-TOUR',
                `Error in doWelcomeTour | offerId=${promotion.offerId} | message=${error instanceof Error ? error.message : String(error)}`
            )
        } finally {
            await page.goto(this.bot.config.baseURL, { timeout: 10000 }).catch(() => {})
            await this.bot.utils.wait(this.bot.utils.randomDelay(2000, 3000))
        }
    }

    private async startTour(page: Page, offerId: string): Promise<boolean> {
        const startSelectors = [
            'a:has-text("Start Earning Points")',
            'a:has-text("Start earning points")',
            'button:has-text("Start Earning Points")',
            'a:has-text("Start earning")',
            '[data-bi-id*="start"]',
            'a.c-call-to-action:has-text("Start")'
        ]

        for (const selector of startSelectors) {
            try {
                const element = await page.$(selector)
                if (element && (await element.isVisible())) {
                    await element.click()
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'WELCOME-TOUR',
                        `Started tour | selector=${selector} | offerId=${offerId}`
                    )
                    await this.bot.utils.wait(this.bot.utils.randomDelay(3000, 4000))
                    return true
                }
            } catch {
                continue
            }
        }

        this.bot.logger.debug(this.bot.isMobile, 'WELCOME-TOUR', `No start button found | offerId=${offerId}`)
        return false
    }

    private async navigateTour(page: Page, offerId: string): Promise<void> {
        const categoryNames = [
            'Entertainment',
            'Shopping',
            'News',
            'Gaming',
            'Sports',
            'Technology',
            'Travel',
            'Finance',
            'Music',
            'Movies',
            'Food',
            'Health'
        ]

        const nextSelectors = [
            '[aria-label*="next" i]',
            '[aria-label*="forward" i]',
            'button:has-text("Next")',
            'a:has-text("Next")',
            'button:has-text("Continue")',
            '[data-bi-id*="next"]',
            '.c-flipper[aria-label*="next" i]',
            '.c-glyph.glyph-chevron-right'
        ]

        let slidesClicked = 0
        const maxSlides = 15

        for (let i = 0; i < maxSlides; i++) {
            await this.bot.utils.wait(this.bot.utils.randomDelay(1000, 1500))

            const categoryClicked = await this.tryCategoryInModal(page, categoryNames, offerId)
            if (categoryClicked) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'WELCOME-TOUR',
                    `Category selected after ${slidesClicked} slides | offerId=${offerId}`
                )
                return
            }

            let clickedNext = false
            for (const selector of nextSelectors) {
                try {
                    const element = await page.$(selector)
                    if (element && (await element.isVisible())) {
                        await element.click()
                        slidesClicked++
                        clickedNext = true

                        this.bot.logger.info(
                            this.bot.isMobile,
                            'WELCOME-TOUR',
                            `Clicked Next | slide=${slidesClicked} | selector=${selector} | offerId=${offerId}`
                        )

                        await this.bot.utils.wait(this.bot.utils.randomDelay(1500, 2500))
                        break
                    }
                } catch {
                    continue
                }
            }

            if (!clickedNext) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'WELCOME-TOUR',
                    `No more next buttons | totalSlides=${slidesClicked} | offerId=${offerId}`
                )
                break
            }
        }
    }

    private async tryCategoryInModal(page: Page, categoryNames: string[], offerId: string): Promise<boolean> {
        for (const category of categoryNames) {
            const modalSelectors = [
                `[role="dialog"] button:has-text("${category}")`,
                `[role="dialog"] [role="button"]:has-text("${category}")`,
                `[role="dialog"] label:has-text("${category}")`,
                `[role="dialog"] span:text-is("${category}")`,
                `[class*="modal"] button:has-text("${category}")`,
                `[class*="dialog"] button:has-text("${category}")`
            ]

            for (const selector of modalSelectors) {
                try {
                    const element = await page.$(selector)
                    if (element && (await element.isVisible())) {
                        await element.click()
                        this.bot.logger.info(
                            this.bot.isMobile,
                            'WELCOME-TOUR',
                            `Selected category "${category}" in modal | selector=${selector} | offerId=${offerId}`
                        )
                        await this.bot.utils.wait(this.bot.utils.randomDelay(2000, 3000))
                        return true
                    }
                } catch {
                    continue
                }
            }
        }

        return false
    }
}
