import { Page } from 'rebrowser-playwright'
import { Workers } from '../Workers'

export class UrlReward extends Workers {
    async doUrlReward(page: Page) {
        this.bot.log(this.bot.isMobile, 'URL-REWARD', 'Trying to complete UrlReward')

        try {
            // 检查页面是否已关闭
            if (page.isClosed()) {
                this.bot.log(this.bot.isMobile, 'URL-REWARD', 'Page is already closed', 'warn')
                return
            }

            await this.bot.utils.wait(2000)

            // 确保页面仍然打开
            if (!page.isClosed()) {
                await page.close()
            }

            this.bot.log(this.bot.isMobile, 'URL-REWARD', 'Completed the UrlReward successfully')
        } catch (error) {
            this.bot.log(this.bot.isMobile, 'URL-REWARD', `An error occurred: ${error}`, 'error')
            // 确保页面被关闭，即使发生错误
            if (!page.isClosed()) {
                try {
                    await page.close()
                } catch (closeError) {
                    this.bot.log(this.bot.isMobile, 'URL-REWARD', `Error closing page: ${closeError}`, 'error')
                }
            }
        }
    }
}