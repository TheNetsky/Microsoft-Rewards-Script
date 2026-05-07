#!/usr/bin/env node
/* eslint-disable no-console */
const https = require('https')
const fs = require('fs')

function parseArgs(argv) {
    const out = {}
    for (let i = 2; i < argv.length; i += 1) {
        const arg = argv[i]
        if (!arg.startsWith('--')) continue
        const key = arg.slice(2)
        const next = argv[i + 1]
        if (!next || next.startsWith('--')) {
            out[key] = true
            continue
        }
        out[key] = next
        i += 1
    }
    return out
}

function usage() {
    console.log(`Usage:
  node scripts/fetch-quest-hashes.js --questId <QUEST_ID> [--rsc 178ia] [--cookie "<cookie>"] [--cookieFile <path>] [--stateTree "<encoded>"]

Examples:
  node scripts/fetch-quest-hashes.js --questId ENWW_pcparent_FY26_BingMonthlyPC_Apr_punchcard --cookieFile cookies.txt
  node scripts/fetch-quest-hashes.js --questId ENWW_pcparent_FY26_BingMonthlyPC_Apr_punchcard --cookie "$COOKIE_HEADER"

Notes:
  - You must provide authenticated cookies (non-empty _C_Auth).
  - You can set COOKIE_HEADER env var instead of --cookie.
  - Output is JSON lines: { offerId, hash }`)
}

function buildDefaultStateTree(questId) {
    const tree = [
        '',
        {
            children: [
                '(nav)',
                {
                    children: [
                        'earn',
                        {
                            children: [
                                'quest',
                                {
                                    children: [
                                        ['questId', questId, 'd', null],
                                        { children: ['__PAGE__', {}, null, null, 0] },
                                        null,
                                        null,
                                        0
                                    ]
                                },
                                null,
                                null,
                                0
                            ]
                        },
                        null,
                        null,
                        0
                    ]
                },
                null,
                null,
                0
            ]
        },
        null,
        'refetch',
        16
    ]
    return encodeURIComponent(JSON.stringify(tree))
}

function request(url, headers) {
    return new Promise((resolve, reject) => {
        const req = https.request(
            url,
            {
                method: 'GET',
                headers
            },
            res => {
                let data = ''
                res.setEncoding('utf8')
                res.on('data', chunk => {
                    data += chunk
                })
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode || 0,
                        headers: res.headers,
                        body: data
                    })
                })
            }
        )
        req.on('error', reject)
        req.setTimeout(30000, () => req.destroy(new Error('Request timeout')))
        req.end()
    })
}

function extractPairs(text) {
    const re = /"offerId":"([^"]+)".*?"hash":"([a-f0-9]{40,128})"/gis
    const map = new Map()
    let match = re.exec(text)
    while (match) {
        const offerId = match[1]
        const hash = match[2]
        map.set(offerId, hash)
        match = re.exec(text)
    }
    return [...map.entries()].map(([offerId, hash]) => ({ offerId, hash }))
}

async function main() {
    const args = parseArgs(process.argv)
    if (args.help || args.h || !args.questId) {
        usage()
        process.exit(args.help || args.h ? 0 : 1)
    }

    const questId = String(args.questId)
    const rsc = String(args.rsc || '178ia')
    const cookieFromFile = args.cookieFile ? fs.readFileSync(String(args.cookieFile), 'utf8').trim() : ''
    const cookieHeader = String(args.cookie || process.env.COOKIE_HEADER || cookieFromFile || '').trim()

    if (!cookieHeader) {
        throw new Error('Missing cookie header. Pass --cookie, --cookieFile, or COOKIE_HEADER env var.')
    }
    if (/_C_Auth=\s*(;|$)/i.test(cookieHeader)) {
        console.warn('Warning: _C_Auth looks empty; endpoint may return anonymous/error content.')
    }

    const stateTree = String(args.stateTree || buildDefaultStateTree(questId))
    const path = `/earn/quest/${encodeURIComponent(questId)}?_rsc=${encodeURIComponent(rsc)}`
    const url = `https://rewards.bing.com${path}`

    const headers = {
        accept: '*/*',
        rsc: '1',
        'next-router-state-tree': stateTree,
        referer: `https://rewards.bing.com/earn/quest/${encodeURIComponent(questId)}`,
        cookie: cookieHeader,
        'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
    }

    const resp = await request(url, headers)
    const body = resp.body || ''
    const pairs = extractPairs(body)

    console.log(`status=${resp.statusCode}`)
    console.log(`content-type=${resp.headers['content-type'] || ''}`)
    console.log(`body-length=${body.length}`)
    console.log(`pair-count=${pairs.length}`)
    for (const item of pairs) {
        console.log(JSON.stringify(item))
    }
}

main().catch(err => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
})
