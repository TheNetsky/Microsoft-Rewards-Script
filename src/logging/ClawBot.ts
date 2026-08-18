import PQueue from 'p-queue'
import type { WebhookClawBotConfig } from '../interface/Config'
import { flushQueue } from './Queue'
import {
    loadClawBotAuth,
    sendClawBotText,
    clearClawBotAuth,
    loginClawBotInteractive
} from '../util/ClawBotClient'

// iLink 服务端限频约 7 条/5 分钟，保守按 10 秒 1 条放行
const clawBotQueue = new PQueue({
    interval: 10000,
    intervalCap: 1,
    carryoverConcurrencyCount: true
})

export async function sendClawBot(config: WebhookClawBotConfig, content: string): Promise<void> {
    if (!config?.enabled) return

    const auth = loadClawBotAuth(config.authFile)
    if (!auth) {
        console.warn('[ClawBot] 未找到凭证（clawbot-auth.json），本次跳过推送')
        return
    }

    await clawBotQueue.add(async () => {
        try {
            const result = await sendClawBotText(auth, content)
            if (result === 'expired') {
                // 过期凭证直接清除，下次运行启动时会自动重新弹出扫码
                clearClawBotAuth(config.authFile)
                console.warn('[ClawBot] 凭证已过期并清除，下次运行时将重新弹出扫码登录')
            } else if (result === 'rate-limited') {
                console.warn('[ClawBot] 触发服务端限频（约 7 条/5 分钟），本条消息未送达')
            } else if (result === 'error') {
                console.warn('[ClawBot] 发送失败，已跳过（不影响任务运行）')
            }
        } catch {
            // 通知失败不影响主流程
        }
    })
}

export function flushClawBotQueue(timeoutMs = 5000): Promise<void> {
    return flushQueue(clawBotQueue, timeoutMs)
}

/**
 * 启动钩子：配置开启 ClawBot 但本地无有效凭证时，自动进入扫码登录。
 * 登录成功后发送一条验证消息确认链路畅通。超时或失败时仅跳过推送，不阻塞任务。
 */
export async function ensureClawBotReady(config?: WebhookClawBotConfig): Promise<boolean> {
    if (!config?.enabled) return false
    if (loadClawBotAuth(config.authFile)) return true

    console.warn('[ClawBot] 已启用微信 ClawBot 推送但尚未登录，开始扫码连接（等待 5 分钟）…')
    const result = await loginClawBotInteractive(config.authFile)
    if (!result.ok || !result.auth) {
        console.warn(`[ClawBot] ${result.message}`)
        return false
    }

    await sendClawBot(config, '✅ ClawBot 通知已接通：Microsoft Rewards 脚本将在此推送运行摘要')
    return true
}
