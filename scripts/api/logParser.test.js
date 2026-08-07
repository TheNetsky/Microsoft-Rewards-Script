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
