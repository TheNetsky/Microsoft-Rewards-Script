// 手动触发 ClawBot 扫码登录（可选入口）。
// 正常情况下无需手动运行：config.json 开启 clawbot 后，主任务启动时会自动检测并弹出扫码。
// 运行：npm run clawbot:login
const { loginClawBotInteractive } = require('../../src/util/ClawBotClient')

async function main() {
    const result = await loginClawBotInteractive()
    if (result.ok) {
        process.stdout.write('\n凭证已保存到 clawbot-auth.json，可在 config.json 中开启 webhook.clawbot.enabled\n')
        process.exit(0)
    }
    process.stdout.write(`\n登录未完成: ${result.message}\n`)
    process.exit(1)
}

main()
