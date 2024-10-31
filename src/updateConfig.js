const fs = require('fs')
const path = require('path')

const configPath = path.join(__dirname, '../dist/config.json')

// Read the existing config file
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

// Update the config with environment variables if they are set
config.baseURL = process.env.BASE_URL || config.baseURL
config.sessionPath = process.env.SESSION_PATH || config.sessionPath
config.headless = process.env.HEADLESS ? process.env.HEADLESS === 'true' : config.headless
config.runOnZeroPoints = process.env.RUN_ON_ZERO_POINTS ? process.env.RUN_ON_ZERO_POINTS === 'true' : config.runOnZeroPoints
config.clusters = process.env.CLUSTERS ? parseInt(process.env.CLUSTERS, 10) : config.clusters
config.saveFingerprint = process.env.SAVE_FINGERPRINT ? process.env.SAVE_FINGERPRINT === 'true' : config.saveFingerprint
config.searchOnBingLocalQueries = process.env.SEARCH_BING_LOCAL_QUERIES ? process.env.SEARCH_BING_LOCAL_QUERIES === 'true' : config.searchOnBingLocalQueries
config.globalTimeout = process.env.GLOBAL_TIMEOUT
    ? isNaN(process.env.GLOBAL_TIMEOUT)
        ? process.env.GLOBAL_TIMEOUT
        : parseInt(process.env.GLOBAL_TIMEOUT, 10)
    : config.globalTimeout

config.workers.doDailySet = process.env.DO_DAILY_SET ? process.env.DO_DAILY_SET === 'true' : config.workers.doDailySet
config.workers.doMorePromotions = process.env.DO_MORE_PROMOTIONS ? process.env.DO_MORE_PROMOTIONS === 'true' : config.workers.doMorePromotions
config.workers.doPunchCards = process.env.DO_PUNCH_CARDS ? process.env.DO_PUNCH_CARDS === 'true' : config.workers.doPunchCards
config.workers.doDesktopSearch = process.env.DO_DESKTOP_SEARCH ? process.env.DO_DESKTOP_SEARCH === 'true' : config.workers.doDesktopSearch
config.workers.doMobileSearch = process.env.DO_MOBILE_SEARCH ? process.env.DO_MOBILE_SEARCH === 'true' : config.workers.doMobileSearch
config.workers.doDailyCheckIn = process.env.DO_DAILY_CHECK_IN ? process.env.DO_DAILY_CHECK_IN === 'true' : config.workers.doDailyCheckIn
config.workers.doReadToEarn = process.env.DO_READ_TO_EARN ? process.env.DO_READ_TO_EARN === 'true' : config.workers.doReadToEarn

config.searchSettings.useGeoLocaleQueries = process.env.USE_GEO_LOCALE_QUERIES ? process.env.USE_GEO_LOCALE_QUERIES === 'true' : config.searchSettings.useGeoLocaleQueries
config.searchSettings.scrollRandomResults = process.env.SCROLL_RANDOM_RESULTS ? process.env.SCROLL_RANDOM_RESULTS === 'true' : config.searchSettings.scrollRandomResults
config.searchSettings.clickRandomResults = process.env.CLICK_RANDOM_RESULTS ? process.env.CLICK_RANDOM_RESULTS === 'true' : config.searchSettings.clickRandomResults
config.searchSettings.searchDelay.min = process.env.SEARCH_DELAY_MIN
    ? isNaN(process.env.SEARCH_DELAY_MIN)
        ? process.env.SEARCH_DELAY_MIN
        : parseInt(process.env.SEARCH_DELAY_MIN, 10)
    : config.searchSettings.searchDelay.min

config.searchSettings.searchDelay.max = process.env.SEARCH_DELAY_MAX
    ? isNaN(process.env.SEARCH_DELAY_MAX)
        ? process.env.SEARCH_DELAY_MAX
        : parseInt(process.env.SEARCH_DELAY_MAX, 10)
    : config.searchSettings.searchDelay.max

config.searchSettings.retryMobileSearchAmount = process.env.RETRY_MOBILE_SEARCH_AMOUNT ? parseInt(process.env.RETRY_MOBILE_SEARCH_AMOUNT, 10) : config.searchSettings.retryMobileSearchAmount

config.webhook.enabled = process.env.WEBHOOK_ENABLED ? process.env.WEBHOOK_ENABLED === 'true' : config.webhook.enabled
config.webhook.url = process.env.WEBHOOK_URL || config.webhook.url

// Write the updated config back to the file
try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
    console.log('Config file updated with environment variables')
} catch (error) {
    console.error(`Failed to write updated config file to ${configPath}:`, error)
    process.exit(1)
}