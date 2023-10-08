import Browser from './browser/Browser'
import { getDashboardData, getEarnablePoints, goHome } from './browser/BrowserFunc'
import { log } from './util/Logger'

import { login } from './functions/Login'
import { doDailySet, doMorePromotions } from './functions/Workers'
import { doSearch } from './functions/activities/Search'

import { Account } from './interface/Account'

import accounts from './accounts.json'
import { runOnZeroPoints, searches } from './config.json'

// Main bot class
class MicrosoftRewardsBot {
    private collectedPoints: number = 0
    private browserFactory: Browser = new Browser()

    async run() {
        log('MAIN', 'Bot started')

        for (const account of accounts) {
            log('MAIN', `Started tasks for account ${account.email}`)

            // Desktop Searches, DailySet and More Promotions
            await this.Desktop(account)

            // If runOnZeroPoints is false and 0 points to earn, stop and try the next account
            if (!runOnZeroPoints && this.collectedPoints === 0) {
                continue
            }

            // Mobile Searches
            await this.Mobile(account)

            log('MAIN', `Completed tasks for account ${account.email}`)
        }


        // Clean exit
        log('MAIN', 'Completed tasks for ALL accounts')
        log('MAIN', 'Bot exited')
        process.exit(0)
    }

    // Desktop
    async Desktop(account: Account) {
        const browser = await this.browserFactory.createBrowser(account.email, false)
        const page = await browser.newPage()

        log('MAIN', 'Starting DESKTOP browser')

        // Login into MS Rewards
        await login(page, account.email, account.password)

        const wentHome = await goHome(page)
        if (!wentHome) {
            throw log('MAIN', 'Unable to get dashboard page', 'error')
        }

        const data = await getDashboardData(page)
        log('MAIN-POINTS', `Current point count: ${data.userStatus.availablePoints}`)

        const earnablePoints = await getEarnablePoints(data)
        this.collectedPoints = earnablePoints
        log('MAIN-POINTS', `You can earn ${earnablePoints} points today`)

        // If runOnZeroPoints is false and 0 points to earn, don't continue
        if (!runOnZeroPoints && this.collectedPoints === 0) {
            log('MAIN', 'No points to earn and "runOnZeroPoints" is set to "false", stopping')

            // Close desktop browser
            return await browser.close()
        }

        // Complete daily set
        await doDailySet(page, data)

        // Complete more promotions
        await doMorePromotions(page, data)

        // Do desktop searches
        if (searches.doDesktop) {
            await doSearch(page, data, false)
        }

        // Close desktop browser
        await browser.close()
    }

    async Mobile(account: Account) {
        const browser = await this.browserFactory.createBrowser(account.email, true)
        const page = await browser.newPage()

        log('MAIN', 'Starting MOBILE browser')

        // Login into MS Rewards
        await login(page, account.email, account.password)

        await goHome(page)

        const data = await getDashboardData(page)

        // If no mobile searches data found, stop (Does not exist on new accounts)
        if (!data.userStatus.counters.mobileSearch) {
            log('MAIN', 'No mobile searches found, stopping')

            // Close mobile browser
            return await browser.close()
        }

        // Do mobile searches
        if (searches.doMobile) {
            await doSearch(page, data, true)
        }

        // Fetch new points
        const earnablePoints = await getEarnablePoints(data, page)

        // If the new earnable is 0, means we got all the points, else retract
        this.collectedPoints = earnablePoints === 0 ? this.collectedPoints : (this.collectedPoints - earnablePoints)
        log('MAIN-POINTS', `The script collected ${this.collectedPoints} points today`)

        // Close mobile browser
        await browser.close()
    }
}

new MicrosoftRewardsBot().run()