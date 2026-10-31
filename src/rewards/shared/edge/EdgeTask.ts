import { activityFailure } from '../ActivityResult'
import type { BotContext } from '../../../core/BotContext'
import { executionContext, getCurrentContext } from '../../../core/ExecutionContext'
import type { RewardsState } from '../../types/RewardsState'

export class EdgeTask {
    private readonly controller = new AbortController()
    private task: Promise<void> | null = null
    private desktopBrowser: Promise<void> = Promise.resolve()
    private started = false
    private finished = false

    constructor(private readonly bot: BotContext) {}

    get running(): boolean {
        return this.task !== null && !this.finished
    }

    start(data: RewardsState): void {
        if (this.started || !this.bot.config.experimental.edgeBrowsing) return
        this.started = true
        const signal = AbortSignal.any([this.controller.signal, this.bot.signal])
        let release = (): void => undefined
        this.desktopBrowser = new Promise<void>(resolve => {
            release = resolve
        })
        const context = getCurrentContext()
        const run = () =>
            this.bot.activities
                .runEdgeBrowsing(data, signal, release)
                .then(result => this.bot.recordActivity('edge-browsing', result))
                .catch(error => {
                    this.bot.recordActivity('edge-browsing', activityFailure(error))
                    this.bot.logger.error(
                        false,
                        'EDGE-BROWSING',
                        `Unexpected background task failure | message=${error instanceof Error ? error.message : String(error)}`
                    )
                })
                .finally(() => {
                    this.finished = true
                    this.bot.accountState.backgroundRewardsActive = false
                    release()
                })
        this.task = context ? executionContext.run({ ...context, isMobile: false }, run) : run()
    }

    desktopReleased(): Promise<void> {
        return this.desktopBrowser
    }

    async wait(): Promise<void> {
        if (this.running) {
            this.bot.logger.info(
                false,
                'EDGE-BROWSING',
                'Foreground activities finished; waiting for the background Edge browsing activity'
            )
        }
        await this.task
        this.task = null
    }

    async cancel(): Promise<void> {
        this.controller.abort()
        await this.task
        this.task = null
    }
}
