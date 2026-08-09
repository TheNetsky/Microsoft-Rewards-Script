export { MicrosoftRewardsBot, executionContext, flushAllWebhooks } from './bot/MicrosoftRewardsBot'

if (require.main === module) {
    void import('./bootstrap').then(({ main }) => main())
}
