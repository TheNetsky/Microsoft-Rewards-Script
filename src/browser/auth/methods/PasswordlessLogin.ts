import type { Page } from 'patchright'
import type { MicrosoftRewardsBot } from '../../../index'

type ApprovalState = 'APPROVED' | 'RETRY_AVAILABLE' | 'PENDING'

export class PasswordlessLogin {
    private readonly approvalTimeoutSeconds = 60
    private readonly maxRequestRetries = 1
    private readonly numberDisplaySelector = '[data-testid="displaySign"]'
    private readonly rngcMarkerSelector = '[data-testid="psRNGCDefaultType"]'
    private readonly shieldMarkerSelector = '[data-testid="deviceShieldCheckmarkVideo"]'
    private readonly primaryButtonSelector = 'button[data-testid="primaryButton"]'

    constructor(private bot: MicrosoftRewardsBot) {}

    private async isAttached(page: Page, selector: string): Promise<boolean> {
        return page
            .locator(selector)
            .count()
            .then(count => count > 0)
            .catch(() => false)
    }

    private async getApprovalState(page: Page): Promise<ApprovalState> {
        const [hasRngcMarker, hasNumber, hasShield, hasPrimaryButton] = await Promise.all([
            this.isAttached(page, this.rngcMarkerSelector),
            this.isAttached(page, this.numberDisplaySelector),
            this.isAttached(page, this.shieldMarkerSelector),
            page
                .locator(this.primaryButtonSelector)
                .isVisible()
                .catch(() => false)
        ])

        if (hasRngcMarker && hasPrimaryButton && !hasNumber && !hasShield) return 'RETRY_AVAILABLE'
        if (!hasRngcMarker && !hasNumber && !hasShield) return 'APPROVED'
        return 'PENDING'
    }

    private async getStableApprovalState(page: Page): Promise<ApprovalState> {
        const state = await this.getApprovalState(page)
        if (state !== 'APPROVED') return state

        await this.bot.utils.wait(500)
        return this.getApprovalState(page)
    }

    private async getDisplayedNumber(page: Page): Promise<string | null> {
        try {
            const numberElement = await page
                .waitForSelector(this.numberDisplaySelector, {
                    state: 'visible',
                    timeout: 5000
                })
                .catch(() => null)

            if (numberElement) {
                const number = await numberElement.textContent()
                return number?.trim() || null
            }
        } catch {
            this.bot.logger.warn(this.bot.isMobile, 'LOGIN-PASSWORDLESS', '无法检索显示的号码')
        }
        return null
    }

    private async waitForApproval(page: Page): Promise<Exclude<ApprovalState, 'PENDING'> | 'TIMED_OUT'> {
        this.bot.logger.info(
            this.bot.isMobile,
            'LOGIN-PASSWORDLESS',
            `等待批准... (${this.approvalTimeoutSeconds}秒后超时)`
        )

        for (let elapsed = 1; elapsed <= this.approvalTimeoutSeconds; elapsed++) {
            const state = await this.getStableApprovalState(page)
            if (state === 'APPROVED') {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-PASSWORDLESS', '检测到批准')
                return state
            }
            if (state === 'RETRY_AVAILABLE') return state

            if (elapsed % 5 === 0) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'LOGIN-PASSWORDLESS',
                    `仍在等待... (已过去 ${elapsed}/${this.approvalTimeoutSeconds} 秒)`
                )
            }

            await this.bot.utils.wait(1000)
        }

        for (let gracePeriod = 0; gracePeriod < 5; gracePeriod++) {
            const state = await this.getStableApprovalState(page)
            if (state !== 'PENDING') return state
            await this.bot.utils.wait(1000)
        }

        this.bot.logger.warn(
            this.bot.isMobile,
            'LOGIN-PASSWORDLESS',
            `${this.approvalTimeoutSeconds} 秒后批准超时!`
        )
        return 'TIMED_OUT'
    }

    private async sendAnotherRequest(page: Page): Promise<boolean> {
        if ((await this.getApprovalState(page)) !== 'RETRY_AVAILABLE') return false

        const clicked = await this.bot.browser.utils.ghostClick(page, this.primaryButtonSelector)
        if (!clicked) return false

        const numberElement = await page
            .waitForSelector(this.numberDisplaySelector, {
                state: 'visible',
                timeout: 10000
            })
            .catch(() => null)

        return numberElement !== null
    }

    private async logApprovalNumber(page: Page): Promise<void> {
        const displayedNumber = await this.getDisplayedNumber(page)

        if (displayedNumber) {
            this.bot.logger.info(
                this.bot.isMobile,
                'LOGIN-PASSWORDLESS',
                `请批准登录并选择数字: ${displayedNumber}`,
                'yellowBright'
            )
            return
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'LOGIN-PASSWORDLESS',
            '请在您的身份验证器应用上批准登录',
            'yellowBright'
        )
    }

    async handle(page: Page): Promise<void> {
        try {
            this.bot.logger.info(this.bot.isMobile, 'LOGIN-PASSWORDLESS', '请求无密码身份验证')

            for (let retry = 0; retry <= this.maxRequestRetries; retry++) {
                await this.logApprovalNumber(page)

                const state = await this.waitForApproval(page)
                if (state === 'APPROVED') {
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN-PASSWORDLESS', '登录批准成功')
                    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
                    return
                }

                if (state === 'RETRY_AVAILABLE' && retry < this.maxRequestRetries) {
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'LOGIN-PASSWORDLESS',
                        `批准请求已过期；发送重试 ${retry + 1}/${this.maxRequestRetries}`
                    )
                    if (await this.sendAnotherRequest(page)) continue
                    throw new Error('Could not send another passwordless authentication request')
                }

                throw new Error('Passwordless authentication timeout')
            }
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'LOGIN-PASSWORDLESS',
                `发生错误: ${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }
}
