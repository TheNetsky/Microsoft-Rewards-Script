import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    createFeishuCard,
    createFeishuPayload,
    isFeishuWebhook,
    sendFeishuSummary,
    flushFeishuQueue
} from '../dist/logging/Feishu.js'
import { redactSecrets } from '../src/control-api/lib.js'
import { logAccountResult } from '../dist/logging/RunSummary.js'

const detail = (label, platform, points, message = '') => ({
    label,
    platform,
    pointsGained: points,
    pointsKnown: true,
    message
})
const stats = {
    email: 'private@example.com',
    status: 'partial',
    success: false,
    initialPoints: 100,
    finalPoints: 125,
    collectedPoints: 25,
    duration: 10,
    completion: {
        completed: [detail('Daily set', 'desktop', 25)],
        incomplete: [detail('Visual Search', 'mobile', 0, 'Not confirmed')],
        unavailable: [detail('Search perk', 'desktop', 0, 'Not available')],
        notApplicable: [],
        counts: { completed: 1, incomplete: 1, unavailable: 1, notApplicable: 0 },
        omitted: { completed: 0, incomplete: 0, unavailable: 0, notApplicable: 0 },
        accountReason: null
    }
}

test('partial card separates task outcomes without exposing account identity', () => {
    const card = createFeishuCard(stats)
    const text = JSON.stringify(card)
    assert.equal(card.header.template, 'orange')
    for (const value of ['Completed', 'Incomplete', 'Unavailable', 'Daily set', 'Visual Search', 'Search perk', '25'])
        assert.ok(text.includes(value), value)
    assert.ok(!text.includes(stats.email))
})

test('unknown points are not reported as confirmed and missing details are explicit', () => {
    const card = createFeishuCard({ ...stats, status: 'failed', pointsKnown: false, completion: undefined })
    const text = JSON.stringify(card)
    assert.equal(card.header.template, 'red')
    assert.match(text, /unknown/i)
    assert.match(text, /details unavailable/i)
})

test('webhooks are restricted to Feishu and Lark bot endpoints', () => {
    assert.equal(isFeishuWebhook('https://open.feishu.cn/open-apis/bot/v2/hook/abc'), true)
    assert.equal(isFeishuWebhook('https://open.larksuite.com/open-apis/bot/v2/hook/abc'), true)
    assert.equal(isFeishuWebhook('https://open.feishu.cn.evil.test/open-apis/bot/v2/hook/abc'), false)
    assert.equal(isFeishuWebhook('http://open.feishu.cn/open-apis/bot/v2/hook/abc'), false)
})

test('signing is optional and uses the documented timestamp and secret key', () => {
    const unsigned = createFeishuPayload(stats, '', '1700000000')
    assert.equal('sign' in unsigned, false)
    const signed = createFeishuPayload(stats, 'test-secret', '1700000000')
    assert.equal(signed.sign, 'mbm4Y4oluIPQ00qlBIhX8vAZ0EKv3nw0LuTb91jPL84=')
})

test('configured delivery sends a card and API redacts credentials', async () => {
    const config = {
        enabled: true,
        url: 'https://open.feishu.cn/open-apis/bot/v2/hook/example',
        signingSecret: 'test-secret'
    }
    const originalFetch = globalThis.fetch
    let request
    globalThis.fetch = async (url, options) => {
        request = { url, ...options, body: JSON.parse(options.body) }
        return { ok: true, json: async () => ({ code: 0 }) }
    }
    try {
        sendFeishuSummary(config, stats)
        await flushFeishuQueue(1000)
        assert.equal(request.url, config.url)
        assert.equal(request.body.card.header.template, 'orange')
        assert.ok(request.body.sign)
        assert.deepEqual(redactSecrets({ webhook: { feishu: config } }).webhook.feishu, {
            enabled: true,
            url: '***REDACTED***',
            signingSecret: '***REDACTED***'
        })
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('account completion triggers delivery while disabled configuration does not', async () => {
    const originalFetch = globalThis.fetch
    let count = 0
    globalThis.fetch = async () => {
        count++
        return { ok: true, json: async () => ({ code: 0 }) }
    }
    const config = { enabled: true, url: 'https://open.feishu.cn/open-apis/bot/v2/hook/example' }
    const context = {
        logger: { event() {} },
        userData: { userName: stats.email },
        activityResults: [],
        accountIssues: new Map(),
        config: { webhook: { feishu: config } }
    }
    try {
        logAccountResult(context, { ...stats })
        await flushFeishuQueue(1000)
        assert.equal(count, 1)
        config.enabled = false
        logAccountResult(context, { ...stats })
        await flushFeishuQueue(1000)
        assert.equal(count, 1)
    } finally {
        globalThis.fetch = originalFetch
    }
})
