import cluster from 'cluster'
import { Page } from 'rebrowser-playwright'

import Browser from './browser/Browser'
import BrowserFunc from './browser/BrowserFunc'
import BrowserUtil from './browser/BrowserUtil'

import { log } from './util/Logger'
import Util from './util/Utils'
import { loadAccounts, loadConfig, saveSessionData } from './util/Load'

import { Login } from './functions/Login'
import { Workers } from './functions/Workers'
import Activities from './functions/Activities'

import { Account } from './interface/Account'
import Axios from './util/Axios'


// Main bot class
export class MicrosoftRewardsBot {
    public log: typeof log
    public config
    public utils: Util
    public activities: Activities = new Activities(this)
    public browser: {
        func: BrowserFunc,
        utils: BrowserUtil
    }
    public isMobile: boolean
    public homePage!: Page

    private collectedPoints: number = 0
    private activeWorkers: number
    private mobileRetryAttempts: number
    private browserFactory: Browser = new Browser(this)
    private accounts: Account[]
    private workers: Workers
    private login = new Login(this)
    private accessToken: string = ''

    //@ts-expect-error Will be initialized later
    public axios: Axios

    constructor(isMobile: boolean) {
        this.isMobile = isMobile
        this.log = log

        this.accounts = []
        this.utils = new Util()
        this.workers = new Workers(this)
        this.browser = {
            func: new BrowserFunc(this),
            utils: new BrowserUtil(this)
        }
        this.config = loadConfig()
        this.activeWorkers = this.config.clusters
        this.mobileRetryAttempts = 0
    }

    async initialize() {
        this.accounts = loadAccounts()
    }

    async run() {
        log('main', 'MAIN', `Bot started with ${this.config.clusters} clusters`)

        // Only cluster when there's more than 1 cluster demanded
        if (this.config.clusters > 1) {
            if (cluster.isPrimary) {
                this.runMaster()
            } else {
                this.runWorker()
            }
        } else {
            await this.runTasks(this.accounts)
        }
    }

    private runMaster() {
        log('main', 'MAIN-PRIMARY', 'Primary process started')

        const accountChunks = this.utils.chunkArray(this.accounts, this.config.clusters)

        for (let i = 0; i < accountChunks.length; i++) {
            const worker = cluster.fork()
            const chunk = accountChunks[i]
            worker.send({ chunk })
        }

        cluster.on('exit', (worker, code) => {
            this.activeWorkers -= 1

            log('main', 'MAIN-WORKER', `Worker ${worker.process.pid} destroyed | Code: ${code} | Active workers: ${this.activeWorkers}`, 'warn')

            // Check if all workers have exited
            if (this.activeWorkers === 0) {
                log('main', 'MAIN-WORKER', 'All workers destroyed. Exiting main process!', 'warn')
                process.exit(0)
            }
        })
    }

    private runWorker() {
        log('main', 'MAIN-WORKER', `Worker ${process.pid} spawned`)
        // Receive the chunk of accounts from the master
        process.on('message', async ({ chunk }) => {
            await this.runTasks(chunk)
        })
    }

    private async runTasks(accounts: Account[]) {
        for (const account of accounts) {
            log('main', 'MAIN-WORKER', `Started tasks for account ${account.email}`)

            this.axios = new Axios(account.proxy)

            if (this.isMobile) {
                // Mobile Searches and app Check-in
                await this.Mobile(account)
            } else {
                // Desktop Searches, DailySet and More Promotions
                await this.Desktop(account)
            }

            log('main', 'MAIN-WORKER', `Completed tasks for account ${account.email}`, 'log', 'green')
        }

        log(this.isMobile, 'MAIN-PRIMARY', 'Completed tasks for ALL accounts', 'log', 'green')
    }

    // Desktop
    async Desktop(account: Account) {
        const browser = await this.browserFactory.createBrowser(account.proxy, account.email)
        this.homePage = await browser.newPage()

        log(this.isMobile, 'MAIN', 'Starting browser')

        //await this.utils.wait(300_000)

        // Login into MS Rewards, then go to rewards homepage
        await this.login.login(this.homePage, account.email, account.password)

        await this.browser.func.goHome(this.homePage)

        const data = await this.browser.func.getDashboardData()
        log(this.isMobile, 'MAIN-POINTS', `Current point count: ${data.userStatus.availablePoints}`, 'log')

        const browserEnarablePoints = await this.browser.func.getBrowserEarnablePoints()

        // Tally all the desktop points
        this.collectedPoints = browserEnarablePoints.dailySetPoints + browserEnarablePoints.desktopSearchPoints + browserEnarablePoints.morePromotionsPoints
        log(this.isMobile, 'MAIN-POINTS', `You can earn ${this.collectedPoints} points today`)

        // If runOnZeroPoints is false and 0 points to earn, don't continue
        if (!this.config.runOnZeroPoints && this.collectedPoints === 0) {
            log(this.isMobile, 'MAIN', 'No points to earn and "runOnZeroPoints" is set to "false", stopping!', 'log', 'yellow')

            // Close desktop browser
            await this.browser.func.closeBrowser(browser, account.email)
            return
        }

        // Open a new tab to where the tasks are going to be completed
        const workerPage = await browser.newPage()

        // Go to homepage on worker page
        await this.browser.func.goHome(workerPage)

        // Complete daily set
        if (this.config.workers.doDailySet) {
            await this.workers.doDailySet(workerPage, data)
        }

        // Complete more promotions
        if (this.config.workers.doMorePromotions) {
            await this.workers.doMorePromotions(workerPage, data)
        }

        // Complete punch cards
        if (this.config.workers.doPunchCards) {
            await this.workers.doPunchCard(workerPage, data)
        }

        // Do desktop searches
        if (this.config.workers.doDesktopSearch) {
            await this.activities.doSearch(workerPage, data)
        }

        // Save cookies
        await saveSessionData(this.config.sessionPath, browser, account.email, this.isMobile)

        // Close desktop browser
        await this.browser.func.closeBrowser(browser, account.email)
        return
    }

    // Mobile
    async Mobile(account: Account) {
        const browser = await this.browserFactory.createBrowser(account.proxy, account.email)
        this.homePage = await browser.newPage()

        log(this.isMobile, 'MAIN', 'Starting browser')

        //await this.utils.wait(300_000)

        // Login into MS Rewards, then go to rewards homepage
        await this.login.login(this.homePage, account.email, account.password)
        this.accessToken = await this.login.getMobileAccessToken(this.homePage, account.email)

        await this.browser.func.goHome(this.homePage)

        const data = await this.browser.func.getDashboardData()

        const browserEnarablePoints = await this.browser.func.getBrowserEarnablePoints()
        const appEarnablePoints = await this.browser.func.getAppEarnablePoints(this.accessToken)

        const beforeEarnablePoints = browserEnarablePoints.mobileSearchPoints + appEarnablePoints
        this.collectedPoints = beforeEarnablePoints
        log(this.isMobile, 'MAIN-POINTS', `You can earn ${beforeEarnablePoints} points today (Browser: ${browserEnarablePoints.mobileSearchPoints} points, App: ${appEarnablePoints} points)`)

        // If runOnZeroPoints is false and 0 points to earn, don't continue
        if (!this.config.runOnZeroPoints && this.collectedPoints === 0) {
            log(this.isMobile, 'MAIN', 'No points to earn and "runOnZeroPoints" is set to "false", stopping!', 'log', 'yellow')

            // Close desktop browser
            await this.browser.func.closeBrowser(browser, account.email)
            return
        }

        // Do daily check in
        if (this.config.workers.doDailyCheckIn) {
            await this.activities.doDailyCheckIn(this.accessToken, data)
        }

        // Do read to earn
        if (this.config.workers.doReadToEarn) {
            await this.activities.doReadToEarn(this.accessToken, data)
        }

        // If no mobile searches data found, stop (Does not exist on new accounts)
        if (data.userStatus.counters.mobileSearch) {
            // Open a new tab to where the tasks are going to be completed
            const workerPage = await browser.newPage()

            // Go to homepage on worker page
            await this.browser.func.goHome(workerPage)

            // Do mobile searches
            // Add a retry count variable outside the loop or function, if applicable

            if (this.config.workers.doMobileSearch) {
                await this.activities.doSearch(workerPage, data)

                // Fetch current search points
                let mobileSearchPoints = (await this.browser.func.getSearchPoints()).mobileSearch?.[0]

                // Check if retries are enabled and start retry loop
                while (this.config.searchSettings.retryMobileSearchAmount > this.mobileRetryAttempts && mobileSearchPoints && (mobileSearchPoints.pointProgressMax - mobileSearchPoints.pointProgress) > 0) {

                    log(this.isMobile, 'MAIN', `Attempt ${this.mobileRetryAttempts + 1}/${this.config.searchSettings.retryMobileSearchAmount}: Unable to complete mobile searches, bad User-Agent? Increase search delay? Retrying...`, 'log', 'yellow')

                    // Close mobile browser
                    await this.browser.func.closeBrowser(browser, account.email)

                    // Increment retry count
                    this.mobileRetryAttempts++

                    // Retry
                    await this.Mobile(account)

                    // Re-fetch search points after retry
                    mobileSearchPoints = (await this.browser.func.getSearchPoints()).mobileSearch?.[0]
                }

                if (this.mobileRetryAttempts >= this.config.searchSettings.retryMobileSearchAmount) {
                    log(this.isMobile, 'MAIN', `Max retry limit of ${this.config.searchSettings.retryMobileSearchAmount} reached. Exiting retry loop`, 'warn')
                }
            }

        } else {
            log(this.isMobile, 'MAIN', 'No mobile searches found!')
        }

        // Fetch new points
        const earnablePoints = (await this.browser.func.getBrowserEarnablePoints()).totalEarnablePoints + await this.browser.func.getAppEarnablePoints(this.accessToken)

        // If the new earnable is 0, means we got all the points, else retract
        this.collectedPoints = earnablePoints === 0 ? this.collectedPoints : (this.collectedPoints - earnablePoints)
        log(this.isMobile, 'MAIN-POINTS', `The script collected ${this.collectedPoints} points today`)

        // Close mobile browser
        await this.browser.func.closeBrowser(browser, account.email)
        return
    }

}

async function main() {
    const desktopBot = new MicrosoftRewardsBot(false)  // For desktop tasks
    const mobileBot = new MicrosoftRewardsBot(true)   // For mobile tasks

    if (desktopBot.config.parallel) {
        // Run desktop and mobile tasks concurrently
        await Promise.all([
            desktopBot.initialize().then(() => {
                desktopBot.run().catch(error => {
                    log(false, 'MAIN-ERROR', `Error running bots: ${error?.message}`, 'error')
                })
            }),
            mobileBot.initialize().then(() => {
                mobileBot.run().catch(error => {
                    log(true, 'MAIN-ERROR', `Error running bots: ${error?.message}`, 'error')
                })
            })
        ])

    } else {
        // Run desktop tasks first, then mobile tasks sequentially
        try {
            await desktopBot.initialize()
            await desktopBot.run()
        } catch (error: any) {
            log(false, 'MAIN-ERROR', `Error running desktop bot: ${error.message}`, 'error')
        }

        // Mobile
        try {
            await mobileBot.initialize()
            await mobileBot.run()
        } catch (error: any) {
            log(true, 'MAIN-ERROR', `Error running bots: ${error.message}`, 'error')
        }

        process.exit(1)
    }
}

// Start the bots
main().catch(error => {
    log('main', 'MAIN-ERROR', `Error running bots: ${error.message}`, 'error')
    process.exit(1)
})