import assert from 'node:assert/strict'
import test from 'node:test'

import { applyLogToRunState, createRunState, parseLogLine, summarizeRunState } from './logParser.js'

function line(user, title, message, level = 'INFO', platform = 'MAIN') {
    return `[8/6/2026, 11:20:01 AM] [${user}] [${level}] ${platform} [${title}] ${message}`
}

function apply(state, raw, receivedAt) {
    const entry = parseLogLine(raw)
    entry.receivedAt = receivedAt
    applyLogToRunState(state, entry)
    return entry
}

test('parses the logger envelope and strips ANSI formatting', () => {
    const entry = parseLogLine(
        `\u001b[32m${line('account.n', 'LOGIN', 'Starting login process', 'INFO', 'MOBILE')}\u001b[39m`
    )

    assert.equal(entry.parsed, true)
    assert.equal(entry.user, 'account.n')
    assert.equal(entry.level, 'info')
    assert.equal(entry.platform, 'MOBILE')
    assert.equal(entry.title, 'LOGIN')
    assert.equal(entry.message, 'Starting login process')
})

test('keeps account geoLocale, resolved locale, and cached region as separate fields', () => {
    const state = createRunState()

    apply(
        state,
        line(
            'account.n',
            'ACCOUNT-START',
            'Starting account: account.n@example.com | geoLocale: auto | locale: nl-NL | cachedRegion: NL'
        ),
        '2026-08-06T09:20:01.000Z'
    )

    assert.equal(state.accounts['account.n@example.com'].geoLocale, 'auto')
    assert.equal(state.accounts['account.n@example.com'].locale, 'nl-NL')
    assert.equal(state.accounts['account.n@example.com'].cachedRegion, 'NL')
})

test('keeps mobile and desktop browser search pools separate in earnable points', () => {
    const state = createRunState()

    apply(
        state,
        line(
            'account.n',
            'POINTS',
            'Earnable today | Mobile: 60 | Browser: 90 | App: 0 | account.n@example.com | locale: nl-NL'
        ),
        '2026-08-06T09:20:01.000Z'
    )

    assert.deepEqual(state.accounts['account.n@example.com'].earnable, {
        mobile: 60,
        browser: 90,
        app: 0
    })
})

test('attributes per-account summaries by logger user when cluster output is interleaved', () => {
    const state = createRunState()

    apply(
        state,
        line('alpha', 'ACCOUNT-START', 'Starting account: alpha@example.com | geoLocale: US | locale: en-US'),
        '2026-08-06T09:20:01.000Z'
    )
    apply(
        state,
        line('beta', 'ACCOUNT-START', 'Starting account: beta@example.com | geoLocale: GB | locale: en-GB'),
        '2026-08-06T09:20:02.000Z'
    )
    apply(
        state,
        line('alpha', 'SEARCH-MANAGER', 'Search summary | mobile=30 | desktop=90 | bonus=0 | total=120'),
        '2026-08-06T09:20:03.000Z'
    )

    assert.deepEqual(state.accounts['alpha@example.com'].searchSummary, {
        mobile: 30,
        desktop: 90,
        bonus: 0,
        total: 120
    })
    assert.equal(state.accounts['beta@example.com'].searchSummary, null)
})

test('tracks the most recently received point update across interleaved accounts', () => {
    const state = createRunState()

    apply(
        state,
        line('alpha', 'ACCOUNT-START', 'Starting account: alpha@example.com | geoLocale: US | locale: en-US'),
        '2026-08-06T09:20:01.000Z'
    )
    apply(
        state,
        line('alpha', 'SEARCH-BING', 'pointsGained=3 | currentBalance=1003', 'INFO', 'DESKTOP'),
        '2026-08-06T09:20:02.000Z'
    )
    apply(
        state,
        line('beta', 'ACCOUNT-START', 'Starting account: beta@example.com | geoLocale: GB | locale: en-GB'),
        '2026-08-06T09:20:03.000Z'
    )
    apply(
        state,
        line('beta', 'SEARCH-BING', 'pointsGained=3 | currentBalance=2003', 'INFO', 'DESKTOP'),
        '2026-08-06T09:20:04.000Z'
    )
    apply(
        state,
        line('alpha', 'SEARCH-BING', 'pointsGained=3 | currentBalance=1006', 'INFO', 'DESKTOP'),
        '2026-08-06T09:20:05.000Z'
    )

    const summary = summarizeRunState(state)
    assert.equal(summary.live.updatedAt, '2026-08-06T09:20:05.000Z')
    assert.equal(state.accounts['alpha@example.com'].live.gained, 6)
    assert.equal(state.accounts['beta@example.com'].live.gained, 3)
})

test('recognizes every activity format used for live point accumulation', () => {
    const state = createRunState()
    apply(
        state,
        line('alpha', 'ACCOUNT-START', 'Starting account: alpha@example.com | geoLocale: US | locale: en-US'),
        '2026-08-06T09:20:00.000Z'
    )

    const events = [
        ['SEARCH-BING', 'pointsGained=3 | currentBalance=1003', 'search'],
        ['SEARCH-BONUS', 'pointsGained=3 | currentBalance=1006 | progress=3/30', 'bonus'],
        ['READ-TO-EARN', 'Read article 1/10 | status=200 | pointsGained=3 | currentBalance=1009', 'read'],
        ['DAILY-CHECK-IN', 'Completed Daily Check-In | type=103 | pointsGained=3 | currentBalance=1012', 'checkIn'],
        [
            'CLAIM-BONUS-POINTS',
            'Completed ClaimBonusPoints | acknowledged=true | pointsGained=3 | currentBalance=1015',
            'claimBonus'
        ],
        [
            'CLAIM-REWARD',
            'Reward claimed | offerId=test | status=200 | pointsGained=3 | currentBalance=1018',
            'claimReward'
        ],
        ['URL-REWARD', 'Completed UrlReward | offerId=test | pointsGained=3 | currentBalance=1021', 'urlReward'],
        [
            'VISUAL-SEARCH',
            'Daily visual search done | pointsGained=3 | currentBalance=1024 | query="test"',
            'visualSearch'
        ],
        ['APP-REWARD', 'Completed AppReward | offerId=test | pointsGained=3 | currentBalance=1027', 'appReward'],
        [
            'PUNCHCARD',
            'Reported child | offerId=test | status=200 | acknowledged=true | pointsGained=3 | currentBalance=1030',
            'punchcard'
        ],
        [
            'SEARCH-ON-BING-SEARCH',
            'SearchOnBing activity completed | pointsGained=3 | currentBalance=1033 | query="test" | offerProgress=1',
            'searchOnBing'
        ]
    ]

    events.forEach(([title, message], index) => {
        apply(state, line('alpha', title, message), `2026-08-06T09:20:${String(index + 1).padStart(2, '0')}.000Z`)
    })

    const account = state.accounts['alpha@example.com']
    assert.equal(account.live.gained, events.length * 3)
    assert.deepEqual(Object.fromEntries(events.map(([, , source]) => [source, 3])), account.live.bySource)

    apply(
        state,
        line('alpha', 'FLOW', 'Points collected | pointsGained=40 | currentBalance=1040 | account=alpha@example.com'),
        '2026-08-06T09:21:00.000Z'
    )
    assert.equal(account.live.gained, 40)
    assert.equal(account.live.balance, 1040)
})

test('tracks background Edge browsing progress and ETA for the correct account', () => {
    const state = createRunState()

    apply(
        state,
        line('alpha', 'ACCOUNT-START', 'Starting account: alpha@example.com | geoLocale: US | locale: en-US'),
        '2026-08-06T09:20:00.000Z'
    )
    apply(
        state,
        line('beta', 'ACCOUNT-START', 'Starting account: beta@example.com | geoLocale: GB | locale: en-GB'),
        '2026-08-06T09:20:01.000Z'
    )
    apply(
        state,
        line(
            'alpha',
            'EDGE-BROWSING',
            'Started background Edge browsing activity | offerId=DailyCheckIn_Edge | type=29 | targetMinutes=30 | reports=6 | serverIntervalMinutes=5 | jitterSeconds=5-20 | estimatedDurationMinutes=31.2',
            'INFO',
            'MOBILE'
        ),
        '2026-08-06T09:20:02.000Z'
    )
    apply(
        state,
        line(
            'alpha',
            'EDGE-BROWSING',
            'Edge browsing progress | reportsCompleted=0/6 | reportsRemaining=6 | scheduledMinutesCovered=0/30 | nextReportInSeconds=311.4 | accepted=0 | duplicates=0 | failed=0 | elapsedMinutes=0 | estimatedRemainingMinutes=31.2',
            'INFO',
            'MOBILE'
        ),
        '2026-08-06T09:20:03.000Z'
    )
    apply(
        state,
        line(
            'alpha',
            'EDGE-BROWSING',
            'Submitted Edge browsing report | report=1/6 | status=200 | duplicate=false | cookies=MUID,MC1 | reportsRemaining=5 | scheduledMinutesCovered=5/30 | accepted=1 | duplicates=0 | failed=0 | elapsedMinutes=5.2 | estimatedRemainingMinutes=26',
            'INFO',
            'MOBILE'
        ),
        '2026-08-06T09:25:14.000Z'
    )
    apply(
        state,
        line(
            'alpha',
            'EDGE-BROWSING',
            'Foreground activities finished; waiting for the background Edge browsing activity',
            'INFO',
            'MOBILE'
        ),
        '2026-08-06T09:26:00.000Z'
    )

    assert.deepEqual(state.accounts['alpha@example.com'].edgeBrowsing, {
        status: 'running',
        targetMinutes: 30,
        serverIntervalMinutes: 5,
        reportsCompleted: 1,
        reportsTotal: 6,
        reportsRemaining: 5,
        scheduledMinutesCovered: 5,
        nextReportInSeconds: null,
        estimatedRemainingMinutes: 26,
        elapsedMinutes: 5.2,
        accepted: 1,
        duplicates: 0,
        failed: 0,
        waitingForBackground: true,
        updatedAt: '2026-08-06T09:26:00.000Z'
    })
    assert.equal(state.accounts['beta@example.com'].edgeBrowsing, null)

    apply(
        state,
        line(
            'alpha',
            'EDGE-BROWSING',
            'Finished background Edge browsing activity | reports=6 | scheduledMinutesCovered=30/30 | accepted=6 | duplicates=0 | failed=0 | elapsedMinutes=31.2 | estimatedRemainingMinutes=0',
            'INFO',
            'MOBILE'
        ),
        '2026-08-06T09:51:14.000Z'
    )

    const finished = state.accounts['alpha@example.com'].edgeBrowsing
    assert.equal(finished.status, 'complete')
    assert.equal(finished.reportsCompleted, 6)
    assert.equal(finished.reportsRemaining, 0)
    assert.equal(finished.scheduledMinutesCovered, 30)
    assert.equal(finished.estimatedRemainingMinutes, 0)
    assert.equal(finished.elapsedMinutes, 31.2)
    assert.equal(finished.waitingForBackground, false)
})
