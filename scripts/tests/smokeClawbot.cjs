/* 冒烟测试：验证 iLink 接口连通性与请求头构造（不扫码、不写凭证）
   运行：npm run test:clawbot-smoke */
const { randomBytes } = require('crypto')
const { httpRequest } = require('../../src/util/Http')

async function main() {
    const uin = Buffer.from(String(randomBytes(4).readUInt32BE(0)), 'utf-8').toString('base64')
    const resp = await httpRequest({
        method: 'POST',
        url: 'https://ilinkai.weixin.qq.com/ilink/bot/get_bot_qrcode?bot_type=3',
        headers: {
            'Content-Type': 'application/json',
            AuthorizationType: 'ilink_bot_token',
            'X-WECHAT-UIN': uin,
            'iLink-App-Id': 'bot',
            'iLink-App-ClientVersion': String((2 << 16) | (4 << 8) | 3)
        },
        data: { local_token_list: [] },
        timeout: 15000
    })
    const d = resp.data || {}
    console.log('status:', resp.status)
    console.log('has qrcode:', Boolean(d.qrcode))
    console.log('img url head:', String(d.qrcode_img_content || '').slice(0, 60))
    console.log('ret:', d.ret, 'errmsg:', d.errmsg)

    if (resp.status !== 200 || !d.qrcode) {
        console.error('SMOKE FAIL')
        process.exit(1)
    }
    console.log('SMOKE OK')
}

main().catch(err => {
    console.error('FAIL:', err instanceof Error ? err.message : String(err))
    process.exit(1)
})
