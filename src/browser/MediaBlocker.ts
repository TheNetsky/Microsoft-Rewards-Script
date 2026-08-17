import type { BrowserContext } from 'patchright'

import type { MicrosoftRewardsBot } from '../index'

const BLOCKED_RESOURCE_TYPES = new Set(['image', 'media'])

export async function configureMediaBlocking(bot: MicrosoftRewardsBot, context: BrowserContext): Promise<void> {
    if (!bot.config.experimental.blockMedia) return

    await context.route('**/*', async route => {
        if (BLOCKED_RESOURCE_TYPES.has(route.request().resourceType())) {
            await route.abort()
            return
        }

        await route.fallback()
    })

    bot.logger.info(
        bot.isMobile,
        'BROWSER',
        '媒体加载已禁用 | 拦截资源类型=image,media | http缓存=已通过路由禁用'
    )
}
