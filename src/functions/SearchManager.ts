import type { BrowserContext } from 'patchright'
import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator'
import { MicrosoftRewardsBot, executionContext } from '../index'
import type { DashboardData } from '../interface/DashboardData'
import type { Account } from '../interface/Account'

interface BrowserSession {
    context: BrowserContext
    fingerprint: BrowserFingerprintWithHeaders
}

interface MissingSearchPoints {
    mobilePoints: number
    desktopPoints: number
}

interface SearchResults {
    mobilePoints: number
    desktopPoints: number
}

export class SearchManager {
    constructor(private bot: MicrosoftRewardsBot) {}

    async doSearches(
        data: DashboardData,
        missingSearchPoints: MissingSearchPoints,
        mobileSession: BrowserSession,
        account: Account,
        accountEmail: string
    ): Promise<SearchResults> {
        this.bot.logger.debug(
            'main',
            'SEARCH-MANAGER',
            `Start | account=${accountEmail} | mobileMissing=${missingSearchPoints.mobilePoints} | desktopMissing=${missingSearchPoints.desktopPoints}`
        )

        const doMobile = this.bot.config.workers.doMobileSearch && missingSearchPoints.mobilePoints > 0
        const doDesktop = this.bot.config.workers.doDesktopSearch && missingSearchPoints.desktopPoints > 0

        const mobileStatus = this.bot.config.workers.doMobileSearch
            ? missingSearchPoints.mobilePoints > 0
                ? 'run'
                : 'skip-no-points'
            : 'skip-disabled'
        const desktopStatus = this.bot.config.workers.doDesktopSearch
            ? missingSearchPoints.desktopPoints > 0
                ? 'run'
                : 'skip-no-points'
            : 'skip-disabled'

        this.bot.logger.info(
            'main',
            'SEARCH-MANAGER',
            `Mobile: ${mobileStatus} (enabled=${this.bot.config.workers.doMobileSearch}, missing=${missingSearchPoints.mobilePoints})`
        )
        this.bot.logger.info(
            'main',
            'SEARCH-MANAGER',
            `Desktop: ${desktopStatus} (enabled=${this.bot.config.workers.doDesktopSearch}, missing=${missingSearchPoints.desktopPoints})`
        )

        if (!doMobile && !doDesktop) {
            const bothWorkersEnabled = this.bot.config.workers.doMobileSearch && this.bot.config.workers.doDesktopSearch
            const bothNoPoints = missingSearchPoints.mobilePoints <= 0 && missingSearchPoints.desktopPoints <= 0

            if (bothWorkersEnabled && bothNoPoints) {
                this.bot.logger.info(
                    'main',
                    'SEARCH-MANAGER',
                    'All searches skipped: no mobile or desktop points left.'
                )
            } else {
                this.bot.logger.info('main', 'SEARCH-MANAGER', 'No searches scheduled (disabled or no points).')
            }

            this.bot.logger.info('main', 'SEARCH-MANAGER', 'Closing mobile session')
            try {
                await executionContext.run({ isMobile: true, account }, async () => {
                    await this.bot.browser.func.closeBrowser(mobileSession.context, accountEmail)
                })
                this.bot.logger.info('main', 'SEARCH-MANAGER', 'Mobile session closed')
            } catch (error) {
                this.bot.logger.warn(
                    'main',
                    'SEARCH-MANAGER',
                    `Failed to close mobile session: ${error instanceof Error ? error.message : String(error)}`
                )
                if (error instanceof Error && error.stack) {
                    this.bot.logger.debug('main', 'SEARCH-MANAGER', `Mobile close stack: ${error.stack}`)
                }
            }
            return { mobilePoints: 0, desktopPoints: 0 }
        }

        const useParallel = this.bot.config.searchSettings.parallelSearching
        this.bot.logger.info('main', 'SEARCH-MANAGER', `Mode: ${useParallel ? 'parallel' : 'sequential'}`)
        this.bot.logger.debug('main', 'SEARCH-MANAGER', `parallelSearching=${useParallel} | account=${accountEmail}`)

        if (useParallel) {
            return await this.doParallelSearches(
                data,
                missingSearchPoints,
                mobileSession,
                account,
                accountEmail,
                executionContext
            )
        } else {
            return await this.doSequentialSearches(
                data,
                missingSearchPoints,
                mobileSession,
                account,
                accountEmail,
                executionContext
            )
        }
    }

    private async doParallelSearches(
        data: DashboardData,
        missingSearchPoints: MissingSearchPoints,
        mobileSession: BrowserSession,
        account: Account,
        accountEmail: string,
        executionContext: any
    ): Promise<SearchResults> {
        this.bot.logger.info('main', 'SEARCH-MANAGER', 'Parallel start')
        this.bot.logger.debug(
            'main',
            'SEARCH-MANAGER',
            `Parallel config | account=${accountEmail} | mobileMissing=${missingSearchPoints.mobilePoints} | desktopMissing=${missingSearchPoints.desktopPoints}`
        )

        const shouldDoMobile = this.bot.config.workers.doMobileSearch && missingSearchPoints.mobilePoints > 0
        const shouldDoDesktop = this.bot.config.workers.doDesktopSearch && missingSearchPoints.desktopPoints > 0

        this.bot.logger.debug(
            'main',
            'SEARCH-MANAGER',
            `Parallel flags | mobile=${shouldDoMobile} | desktop=${shouldDoDesktop}`
        )

        let desktopSession: BrowserSession | null = null
        let mobileContextClosed = false

        try {
            const promises: Promise<number>[] = []
            const searchTypes: string[] = []

            if (shouldDoMobile) {
                this.bot.logger.debug(
                    'main',
                    'SEARCH-MANAGER',
                    `Schedule mobile | target=${missingSearchPoints.mobilePoints}`
                )
                searchTypes.push('Mobile')
                promises.push(
                    this.doMobileSearch(data, missingSearchPoints, mobileSession, accountEmail, executionContext).then(
                        points => {
                            mobileContextClosed = true
                            this.bot.logger.info('main', 'SEARCH-MANAGER', `Mobile done | earned=${points}`)
                            return points
                        }
                    )
                )
            } else {
                const reason = !this.bot.config.workers.doMobileSearch ? 'disabled' : 'no-points'
                this.bot.logger.info('main', 'SEARCH-MANAGER', `Skip mobile (${reason}); closing mobile session`)
                await this.bot.browser.func.closeBrowser(mobileSession.context, accountEmail)
                mobileContextClosed = true
                this.bot.logger.info('main', 'SEARCH-MANAGER', 'Mobile session closed (no mobile search)')
            }

            if (shouldDoDesktop) {
                this.bot.logger.info('main', 'SEARCH-MANAGER', 'Desktop login start')
                this.bot.logger.debug(
                    'main',
                    'SEARCH-MANAGER',
                    `Desktop login | account=${accountEmail} | proxy=${account.proxy ?? 'none'}`
                )
                desktopSession = await executionContext.run({ isMobile: false, accountEmail }, async () =>
                    this.createDesktopSession(account, accountEmail)
                )
                this.bot.logger.info('main', 'SEARCH-MANAGER', 'Desktop login done')
            } else {
                const reason = !this.bot.config.workers.doDesktopSearch ? 'disabled' : 'no-points'
                this.bot.logger.info('main', 'SEARCH-MANAGER', `Skip desktop login (${reason})`)
            }

            if (shouldDoDesktop && desktopSession) {
                this.bot.logger.debug(
                    'main',
                    'SEARCH-MANAGER',
                    `Schedule desktop | target=${missingSearchPoints.desktopPoints}`
                )
                searchTypes.push('Desktop')
                promises.push(
                    this.doDesktopSearch(
                        data,
                        missingSearchPoints,
                        desktopSession,
                        accountEmail,
                        executionContext
                    ).then(points => {
                        this.bot.logger.info('main', 'SEARCH-MANAGER', `Desktop done | earned=${points}`)
                        return points
                    })
                )
            }

            this.bot.logger.info('main', 'SEARCH-MANAGER', `Running parallel: ${searchTypes.join(' + ') || 'none'}`)

            const results = await Promise.all(promises)

            this.bot.logger.debug(
                'main',
                'SEARCH-MANAGER',
                `Parallel results | account=${accountEmail} | results=${JSON.stringify(results)}`
            )

            const mobilePoints = shouldDoMobile ? (results[0] ?? 0) : 0
            const desktopPoints = shouldDoDesktop ? (results[shouldDoMobile ? 1 : 0] ?? 0) : 0

            this.bot.logger.info(
                'main',
                'SEARCH-MANAGER',
                `Parallel summary | mobile=${mobilePoints} | desktop=${desktopPoints} | total=${
                    mobilePoints + desktopPoints
                }`
            )

            return { mobilePoints, desktopPoints }
        } catch (error) {
            this.bot.logger.error(
                'main',
                'SEARCH-MANAGER',
                `Parallel failed: ${error instanceof Error ? error.message : String(error)}`
            )
            if (error instanceof Error && error.stack) {
                this.bot.logger.debug('main', 'SEARCH-MANAGER', `Parallel stack: ${error.stack}`)
            }
            throw error
        } finally {
            if (!mobileContextClosed && mobileSession) {
                this.bot.logger.info('main', 'SEARCH-MANAGER', 'Cleanup: closing mobile session')
                this.bot.logger.debug('main', 'SEARCH-MANAGER', `Cleanup mobile | account=${accountEmail}`)
                try {
                    await executionContext.run({ isMobile: true, accountEmail }, async () => {
                        await this.bot.browser.func.closeBrowser(mobileSession.context, accountEmail)
                    })
                    this.bot.logger.info('main', 'SEARCH-MANAGER', 'Cleanup: mobile session closed')
                } catch (error) {
                    this.bot.logger.warn(
                        'main',
                        'SEARCH-MANAGER',
                        `Cleanup: mobile close failed: ${error instanceof Error ? error.message : String(error)}`
                    )
                    if (error instanceof Error && error.stack) {
                        this.bot.logger.debug('main', 'SEARCH-MANAGER', `Cleanup mobile stack: ${error.stack}`)
                    }
                }
            }
        }
    }

    private async doSequentialSearches(
        data: DashboardData,
        missingSearchPoints: MissingSearchPoints,
        mobileSession: BrowserSession,
        account: Account,
        accountEmail: string,
        executionContext: any
    ): Promise<SearchResults> {
        this.bot.logger.info('main', 'SEARCH-MANAGER', 'Sequential start')
        this.bot.logger.debug(
            'main',
            'SEARCH-MANAGER',
            `Sequential config | account=${accountEmail} | mobileMissing=${missingSearchPoints.mobilePoints} | desktopMissing=${missingSearchPoints.desktopPoints}`
        )

        const shouldDoMobile = this.bot.config.workers.doMobileSearch && missingSearchPoints.mobilePoints > 0
        const shouldDoDesktop = this.bot.config.workers.doDesktopSearch && missingSearchPoints.desktopPoints > 0

        this.bot.logger.debug(
            'main',
            'SEARCH-MANAGER',
            `Sequential flags | mobile=${shouldDoMobile} | desktop=${shouldDoDesktop}`
        )

        let mobilePoints = 0
        let desktopPoints = 0

        if (shouldDoMobile) {
            this.bot.logger.info('main', 'SEARCH-MANAGER', 'Step 1: mobile')
            this.bot.logger.debug(
                'main',
                'SEARCH-MANAGER',
                `Sequential mobile | target=${missingSearchPoints.mobilePoints}`
            )
            mobilePoints = await this.doMobileSearch(
                data,
                missingSearchPoints,
                mobileSession,
                accountEmail,
                executionContext
            )
            this.bot.logger.info('main', 'SEARCH-MANAGER', `Step 1: mobile done | earned=${mobilePoints}`)
        } else {
            const reason = !this.bot.config.workers.doMobileSearch ? 'disabled' : 'no-points'
            this.bot.logger.info('main', 'SEARCH-MANAGER', `Step 1: skip mobile (${reason}); closing mobile session`)
            this.bot.logger.debug('main', 'SEARCH-MANAGER', 'Closing unused mobile context')
            try {
                await executionContext.run({ isMobile: true, accountEmail }, async () => {
                    await this.bot.browser.func.closeBrowser(mobileSession.context, accountEmail)
                })
                this.bot.logger.info('main', 'SEARCH-MANAGER', 'Unused mobile session closed')
            } catch (error) {
                this.bot.logger.warn(
                    'main',
                    'SEARCH-MANAGER',
                    `Unused mobile close failed: ${error instanceof Error ? error.message : String(error)}`
                )
                if (error instanceof Error && error.stack) {
                    this.bot.logger.debug('main', 'SEARCH-MANAGER', `Unused mobile stack: ${error.stack}`)
                }
            }
        }

        if (shouldDoDesktop) {
            this.bot.logger.info('main', 'SEARCH-MANAGER', 'Step 2: desktop')
            this.bot.logger.debug(
                'main',
                'SEARCH-MANAGER',
                `Sequential desktop | target=${missingSearchPoints.desktopPoints}`
            )
            desktopPoints = await this.doDesktopSearchSequential(
                data,
                missingSearchPoints,
                account,
                accountEmail,
                executionContext
            )
            this.bot.logger.info('main', 'SEARCH-MANAGER', `Step 2: desktop done | earned=${desktopPoints}`)
        } else {
            const reason = !this.bot.config.workers.doDesktopSearch ? 'disabled' : 'no-points'
            this.bot.logger.info('main', 'SEARCH-MANAGER', `Step 2: skip desktop (${reason})`)
        }

        this.bot.logger.info(
            'main',
            'SEARCH-MANAGER',
            `Sequential summary | mobile=${mobilePoints} | desktop=${desktopPoints} | total=${
                mobilePoints + desktopPoints
            }`
        )
        this.bot.logger.debug('main', 'SEARCH-MANAGER', `Sequential done | account=${accountEmail}`)

        return { mobilePoints, desktopPoints }
    }

    private async createDesktopSession(account: Account, accountEmail: string): Promise<BrowserSession> {
        this.bot.logger.info('main', 'SEARCH-DESKTOP-LOGIN', 'Init desktop session')
        this.bot.logger.debug(
            'main',
            'SEARCH-DESKTOP-LOGIN',
            `Init | account=${accountEmail} | proxy=${account.proxy ?? 'none'}`
        )

        const session = await this.bot['browserFactory'].createBrowser(account)
        this.bot.logger.debug('main', 'SEARCH-DESKTOP-LOGIN', 'Browser created, new page')

        this.bot.mainDesktopPage = await session.context.newPage()

        this.bot.logger.info('main', 'SEARCH-DESKTOP-LOGIN', `Browser ready | account=${accountEmail}`)
        this.bot.logger.info('main', 'SEARCH-DESKTOP-LOGIN', 'Login start')
        this.bot.logger.debug('main', 'SEARCH-DESKTOP-LOGIN', 'Calling login handler')

        await this.bot['login'].login(this.bot.mainDesktopPage, account)

        this.bot.logger.info('main', 'SEARCH-DESKTOP-LOGIN', 'Login passed, verifying')
        this.bot.logger.debug('main', 'SEARCH-DESKTOP-LOGIN', 'verifyBingSession')

        await this.bot['login'].verifyBingSession(this.bot.mainDesktopPage)
        this.bot.cookies.desktop = await session.context.cookies()

        this.bot.logger.debug('main', 'SEARCH-DESKTOP-LOGIN', 'Cookies stored')
        this.bot.logger.info('main', 'SEARCH-DESKTOP-LOGIN', 'Desktop session ready')

        return session
    }

    private async doMobileSearch(
        data: DashboardData,
        missingSearchPoints: MissingSearchPoints,
        mobileSession: BrowserSession,
        accountEmail: string,
        executionContext: any
    ): Promise<number> {
        this.bot.logger.debug(
            'main',
            'SEARCH-MOBILE-SEARCH',
            `Start | account=${accountEmail} | target=${missingSearchPoints.mobilePoints}`
        )

        return await executionContext.run({ isMobile: true, accountEmail }, async () => {
            try {
                if (!this.bot.config.workers.doMobileSearch) {
                    this.bot.logger.info('main', 'SEARCH-MOBILE-SEARCH', 'Skip: worker disabled in config')
                    return 0
                }

                if (missingSearchPoints.mobilePoints === 0) {
                    this.bot.logger.info('main', 'SEARCH-MOBILE-SEARCH', 'Skip: no points left')
                    return 0
                }

                this.bot.logger.info(
                    'main',
                    'SEARCH-MOBILE-SEARCH',
                    `Search start | target=${missingSearchPoints.mobilePoints}`
                )
                this.bot.logger.debug('main', 'SEARCH-MOBILE-SEARCH', 'activities.doSearch (mobile)')

                const pointsEarned = await this.bot.activities.doSearch(data, this.bot.mainMobilePage, true)

                this.bot.logger.info(
                    'main',
                    'SEARCH-MOBILE-SEARCH',
                    `Search done | earned=${pointsEarned}/${missingSearchPoints.mobilePoints}`
                )
                this.bot.logger.debug(
                    'main',
                    'SEARCH-MOBILE-SEARCH',
                    `Result | account=${accountEmail} | earned=${pointsEarned}`
                )

                return pointsEarned
            } catch (error) {
                this.bot.logger.error(
                    'main',
                    'SEARCH-MOBILE-SEARCH',
                    `Failed: ${error instanceof Error ? error.message : String(error)}`
                )
                if (error instanceof Error && error.stack) {
                    this.bot.logger.debug('main', 'SEARCH-MOBILE-SEARCH', `Stack: ${error.stack}`)
                }
                return 0
            } finally {
                this.bot.logger.info('main', 'SEARCH-MOBILE-SEARCH', 'Closing mobile session')
                this.bot.logger.debug('main', 'SEARCH-MOBILE-SEARCH', `Closing context | account=${accountEmail}`)
                try {
                    await this.bot.browser.func.closeBrowser(mobileSession.context, accountEmail)
                    this.bot.logger.info('main', 'SEARCH-MOBILE-SEARCH', 'Mobile browser closed')
                } catch (error) {
                    this.bot.logger.warn(
                        'main',
                        'SEARCH-MOBILE-SEARCH',
                        `Close failed: ${error instanceof Error ? error.message : String(error)}`
                    )
                    if (error instanceof Error && error.stack) {
                        this.bot.logger.debug('main', 'SEARCH-MOBILE-SEARCH', `Close stack: ${error.stack}`)
                    }
                }
            }
        })
    }

    private async doDesktopSearch(
        data: DashboardData,
        missingSearchPoints: MissingSearchPoints,
        desktopSession: BrowserSession,
        accountEmail: string,
        executionContext: any
    ): Promise<number> {
        this.bot.logger.debug(
            'main',
            'SEARCH-DESKTOP-PARALLEL',
            `Start | account=${accountEmail} | target=${missingSearchPoints.desktopPoints}`
        )

        return await executionContext.run({ isMobile: false, accountEmail }, async () => {
            try {
                this.bot.logger.info(
                    'main',
                    'SEARCH-DESKTOP-PARALLEL',
                    `Search start | target=${missingSearchPoints.desktopPoints}`
                )
                const pointsEarned = await this.bot.activities.doSearch(data, this.bot.mainDesktopPage, false)

                this.bot.logger.info(
                    'main',
                    'SEARCH-DESKTOP-PARALLEL',
                    `Search done | earned=${pointsEarned}/${missingSearchPoints.desktopPoints}`
                )
                this.bot.logger.debug(
                    'main',
                    'SEARCH-DESKTOP-PARALLEL',
                    `Result | account=${accountEmail} | earned=${pointsEarned}`
                )

                return pointsEarned
            } catch (error) {
                this.bot.logger.error(
                    'main',
                    'SEARCH-DESKTOP-PARALLEL',
                    `Failed: ${error instanceof Error ? error.message : String(error)}`
                )
                if (error instanceof Error && error.stack) {
                    this.bot.logger.debug('main', 'SEARCH-DESKTOP-PARALLEL', `Stack: ${error.stack}`)
                }
                return 0
            } finally {
                this.bot.logger.info('main', 'SEARCH-DESKTOP-PARALLEL', 'Closing desktop session')
                this.bot.logger.debug('main', 'SEARCH-DESKTOP-PARALLEL', `Closing context | account=${accountEmail}`)
                try {
                    await this.bot.browser.func.closeBrowser(desktopSession.context, accountEmail)
                    this.bot.logger.info('main', 'SEARCH-DESKTOP-PARALLEL', 'Desktop browser closed')
                } catch (error) {
                    this.bot.logger.warn(
                        'main',
                        'SEARCH-DESKTOP-PARALLEL',
                        `Close failed: ${error instanceof Error ? error.message : String(error)}`
                    )
                    if (error instanceof Error && error.stack) {
                        this.bot.logger.debug('main', 'SEARCH-DESKTOP-PARALLEL', `Close stack: ${error.stack}`)
                    }
                }
            }
        })
    }

    private async doDesktopSearchSequential(
        data: DashboardData,
        missingSearchPoints: MissingSearchPoints,
        account: Account,
        accountEmail: string,
        executionContext: any
    ): Promise<number> {
        this.bot.logger.debug(
            'main',
            'SEARCH-DESKTOP-SEQUENTIAL',
            `Start | account=${accountEmail} | target=${missingSearchPoints.desktopPoints}`
        )

        return await executionContext.run({ isMobile: false, accountEmail }, async () => {
            if (!this.bot.config.workers.doDesktopSearch) {
                this.bot.logger.info('main', 'SEARCH-DESKTOP-SEQUENTIAL', 'Skip: worker disabled in config')
                return 0
            }

            if (missingSearchPoints.desktopPoints === 0) {
                this.bot.logger.info('main', 'SEARCH-DESKTOP-SEQUENTIAL', 'Skip: no points left')
                return 0
            }

            let desktopSession: BrowserSession | null = null
            try {
                this.bot.logger.info('main', 'SEARCH-DESKTOP-SEQUENTIAL', 'Init desktop session')
                desktopSession = await this.createDesktopSession(account, accountEmail)

                this.bot.logger.info(
                    'main',
                    'SEARCH-DESKTOP-SEQUENTIAL',
                    `Search start | target=${missingSearchPoints.desktopPoints}`
                )

                const pointsEarned = await this.bot.activities.doSearch(data, this.bot.mainDesktopPage, false)

                this.bot.logger.info(
                    'main',
                    'SEARCH-DESKTOP-SEQUENTIAL',
                    `Search done | earned=${pointsEarned}/${missingSearchPoints.desktopPoints}`
                )
                this.bot.logger.debug(
                    'main',
                    'SEARCH-DESKTOP-SEQUENTIAL',
                    `Result | account=${accountEmail} | earned=${pointsEarned}`
                )

                return pointsEarned
            } catch (error) {
                this.bot.logger.error(
                    'main',
                    'SEARCH-DESKTOP-SEQUENTIAL',
                    `Failed: ${error instanceof Error ? error.message : String(error)}`
                )
                if (error instanceof Error && error.stack) {
                    this.bot.logger.debug('main', 'SEARCH-DESKTOP-SEQUENTIAL', `Stack: ${error.stack}`)
                }
                return 0
            } finally {
                if (desktopSession) {
                    this.bot.logger.info('main', 'SEARCH-DESKTOP-SEQUENTIAL', 'Closing desktop session')
                    this.bot.logger.debug(
                        'main',
                        'SEARCH-DESKTOP-SEQUENTIAL',
                        `Closing context | account=${accountEmail}`
                    )
                    try {
                        await this.bot.browser.func.closeBrowser(desktopSession.context, accountEmail)
                        this.bot.logger.info('main', 'SEARCH-DESKTOP-SEQUENTIAL', 'Desktop browser closed')
                    } catch (error) {
                        this.bot.logger.warn(
                            'main',
                            'SEARCH-DESKTOP-SEQUENTIAL',
                            `Close failed: ${error instanceof Error ? error.message : String(error)}`
                        )
                        if (error instanceof Error && error.stack) {
                            this.bot.logger.debug('main', 'SEARCH-DESKTOP-SEQUENTIAL', `Close stack: ${error.stack}`)
                        }
                    }
                }
            }
        })
    }
}
