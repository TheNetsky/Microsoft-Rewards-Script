import { Browser, mobileBrowser } from './Browser'
import { getDashboardData, goHome } from './BrowserFunc'
import { doDailySet } from './functions/DailySet'
import { login } from './functions/Login'
import { doMorePromotions } from './functions/MorePromotions'
import { doSearch } from './functions/activities/Search'
import { log } from './util/Logger'
import accounts from './accounts.json'

import { Account } from './interface/Account'

async function init() {

    log('MAIN', 'Bot started')

    for (const account of accounts) {
        log('MAIN', `Started tasks for account ${account.email}`)

        // DailySet, MorePromotions and Desktop Searches
        await Desktop(account)

        // Mobile Searches
        await Mobile(account)

        log('MAIN', `Completed tasks for account ${account.email}`)
    }

    // Clean exit
    log('MAIN', 'Bot exited')
    process.exit()
}

// Desktop
async function Desktop(account: Account) {
    const browser = await Browser(account.email)
    const page = await browser.newPage()

    // Login into MS Rewards
    await login(page, account.email, account.password)

    await goHome(page)

    const data = await getDashboardData(page)
    log('MAIN', `Current point count: ${data.userStatus.availablePoints}`)

    // Complete daily set
    await doDailySet(page, data)
    log('MAIN', `Current point count: ${data.userStatus.availablePoints}`)

    // Complete more promotions
    await doMorePromotions(page, data)
    log('MAIN', `Current point count: ${data.userStatus.availablePoints}`)

    // Do desktop searches
    await doSearch(page, data, false)
    log('MAIN', `Current point count: ${data.userStatus.availablePoints}`)

    // Close desktop browser
    await browser.close()
}

async function Mobile(account: Account) {
    const browser = await mobileBrowser(account.email)
    const page = await browser.newPage()

    // Login into MS Rewards
    await login(page, account.email, account.password)

    await goHome(page)

    const data = await getDashboardData(page)
    log('MAIN', `Current point count: ${data.userStatus.availablePoints}`)

    // Do mobile searches
    await doSearch(page, data, true)
    log('MAIN', `Current point count: ${data.userStatus.availablePoints}`)

    // Close mobile browser
    await browser.close()
}

init()