// 手动触发 ClawBot 登录+激活（可选入口）。
// 正常情况下无需手动运行：config.json 开启 clawbot 后，主任务启动时会自动完成同样流程。
// 流程：扫码登录（如需）→ 等待在微信给「微信 ClawBot」发一条消息完成激活 → 发送验证消息
// 运行：npm run clawbot:login
const { ensureClawBotReady, flushClawBotQueue } = require('../../src/logging/ClawBot')

async function main() {
    const ok = await ensureClawBotReady({ enabled: true })
    // 等待队列中的验证消息发出后再退出
    await flushClawBotQueue(10000)
    if (ok) {
        process.stdout.write('\nClawBot 推送通道已就绪，可在 config.json 中开启 webhook.clawbot.enabled\n')
        process.exit(0)
    }
    process.exit(1)
}

main()
