import cluster from 'cluster'

import Browser from './browser/Browser'
import { getDashboardData, getEarnablePoints, goHome } from './browser/BrowserFunc'
import { log } from './util/Logger'
import { loadAccounts } from './util/Account'
import { chunkArray } from './util/Utils'

import { login } from './functions/Login'
import { doDailySet, doMorePromotions, doPunchCard } from './functions/Workers'
import { doSearch } from './functions/activities/Search'

import { Account } from './interface/Account'

import { runOnZeroPoints, workers, clusters } from './config.json'

// Main bot class
class MicrosoftRewardsBot {
    private activeWorkers: number = clusters
    private collectedPoints: number = 0
    private browserFactory: Browser = new Browser()
    private accounts: Account[]

    constructor() {
        this.accounts = []
    }

    async initialize() {
        this.accounts = await loadAccounts()
    }

    async run() {
        log('MAIN', `Bot started with ${clusters} clusters`)

        // Only cluster when there's more than 1 cluster demanded
        if (clusters > 1) {
            if (cluster.isPrimary) {
                this.runMaster()
            } else {
                this.runWorker()
            }
        } else {
            this.runTasks(this.accounts)
        }
    }

    private runMaster() {
        log('MAIN-PRIMARY', 'Primary process started')

        const accountChunks = chunkArray(this.accounts, clusters)

        for (let i = 0; i < accountChunks.length; i++) {
            const worker = cluster.fork()
            const chunk = accountChunks[i]
            worker.send({ chunk })
        }

        cluster.on('exit', (worker, code) => {
            this.activeWorkers -= 1

            log('MAIN-WORKER', `Worker ${worker.process.pid} destroyed | Code: ${code} | Active workers: ${this.activeWorkers}`, 'warn')

            // Check if all workers have exited
            if (this.activeWorkers === 0) {
                log('MAIN-WORKER', 'All workers destroyed. Exiting main process!', 'warn')
                process.exit(0)
            }
        })
    }

    private runWorker() {
        log('MAIN-WORKER', `Worker ${process.pid} spawned`)

        // Receive the chunk of accounts from the master
        process.on('message', async ({ chunk }) => {
            await this.runTasks(chunk)
        })
    }

    private async runTasks(accounts: Account[]) {
        for (const account of accounts) {
            log('MAIN-WORKER', `Started tasks for account ${account.email}`)

            // Desktop Searches, DailySet and More Promotions
            await this.Desktop(account)

            // If runOnZeroPoints is false and 0 points to earn, stop and try the next account
            if (!runOnZeroPoints && this.collectedPoints === 0) {
                continue
            }

            // Mobile Searches
            await this.Mobile(account)

            log('MAIN-WORKER', `Completed tasks for account ${account.email}`)
        }

        log('MAIN-PRIMARY', 'Completed tasks for ALL accounts')
        log('MAIN-PRIMARY', 'All workers destroyed!')
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
        if (workers.doDailySet) {
            await doDailySet(page, data)
        }

        // Complete more promotions
        if (workers.doMorePromotions) {
            await doMorePromotions(page, data)
        }

        // Complete punch cards
        if (workers.doPunchCards) {
            await doPunchCard(page, data)
        }

        // Do desktop searches
        if (workers.doDesktopSearch) {
            await doSearch(page, data, false)
        }

        // Close desktop browser
        await browser.close()
    }

    // Mobile
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
        if (workers.doMobileSearch) {
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

const bot = new MicrosoftRewardsBot()

// Initialize accounts first and then start the bot
bot.initialize().then(() => {
    bot.run()
})