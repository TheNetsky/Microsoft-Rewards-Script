/* 诊断：带 context_token 真实发送 + getupdates。运行：node -r ts-node/register/transpile-only scripts/tests/clawbotDiag.cjs */
const { randomBytes } = require('crypto')
const { httpRequest } = require('../../src/util/Http')

const auth = require(require('path').resolve('clawbot-auth.json'))
const BASE = 'https://ilinkai.weixin.qq.com'

function headers() {
    return {
        'Content-Type': 'application/json',
        AuthorizationType: 'ilink_bot_token',
        'X-WECHAT-UIN': Buffer.from(String(randomBytes(4).readUInt32BE(0)), 'utf-8').toString('base64'),
        'iLink-App-Id': 'bot',
        'iLink-App-ClientVersion': String((2 << 16) | (4 << 8) | 3),
        Authorization: `Bearer ${auth.token}`
    }
}

async function diag() {
    console.log('contextToken present:', Boolean(auth.contextToken))
    console.log('=== sendmessage（带 context_token）===')
    try {
        const r = await httpRequest({
            method: 'POST',
            url: `${BASE}/ilink/bot/sendmessage`,
            headers: headers(),
            data: {
                msg: {
                    from_user_id: '',
                    to_user_id: auth.userId,
                    client_id: `openclaw-weixin-${randomBytes(16).toString('hex')}`,
                    message_type: 2,
                    message_state: 2,
                    ...(auth.contextToken ? { context_token: auth.contextToken } : {}),
                    item_list: [{ type: 1, text_item: { text: '🔧 ClawBot 发送链路验证：收到此消息说明推送正常' } }]
                },
                base_info: { channel_version: '2.4.3', bot_agent: 'microsoft-rewards-script/4.3.0' }
            },
            timeout: 15000,
            responseType: 'text'
        })
        console.log('HTTP', r.status, '| body:', String(r.data).slice(0, 300))
    } catch (e) {
        console.log('SEND FAIL:', e?.message, '| status:', e?.status, '| body:', String(e?.response?.data ?? '').slice(0, 300))
    }
}

diag()
