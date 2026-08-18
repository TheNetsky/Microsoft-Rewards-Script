import PQueue from 'p-queue'
import type { WebhookClawBotConfig } from '../interface/Config'
import { flushQueue } from './Queue'
import {
    loadClawBotAuth,
    saveClawBotAuth,
    sendClawBotText,
    clearClawBotAuth,
    loginClawBotInteractive,
    waitForClawBotActivation
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
            } else if (result === 'needs-activation') {
                // context_token 缺失或失效（ret=-2）：清除后等待下次启动时重新激活
                auth.contextToken = undefined
                saveClawBotAuth(auth, config.authFile)
                console.warn('[ClawBot] 推送上下文失效，本次跳过；下次运行时请在微信给「微信 ClawBot」发一条消息完成激活')
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
 * 启动钩子：配置开启 ClawBot 时确保推送通道就绪。
 * - 无凭证：弹出扫码登录（5 分钟超时），登录后自动进入激活等待
 * - 有凭证但无 contextToken：提示在微信给「微信 ClawBot」发条消息，长轮询抓取（2 分钟超时）
 * 超时或失败仅跳过推送，不阻塞任务。
 */
export async function ensureClawBotReady(config?: WebhookClawBotConfig): Promise<boolean> {
    if (!config?.enabled) return false
    let auth = loadClawBotAuth(config.authFile)

    if (!auth) {
        console.warn('[ClawBot] 已启用微信 ClawBot 推送但尚未登录，开始扫码连接（等待 5 分钟）…')
        const result = await loginClawBotInteractive(config.authFile)
        if (!result.ok || !result.auth) {
            console.warn(`[ClawBot] ${result.message}`)
            return false
        }
        auth = result.auth
    }

    if (!auth.contextToken) {
        console.warn('[ClawBot] 需要激活：请现在在手机微信中给「微信 ClawBot」发送一条任意消息（等待 2 分钟）…')
        const activated = await waitForClawBotActivation(auth, config.authFile, 2 * 60 * 1000)
        if (!activated) {
            console.warn('[ClawBot] 激活超时，本次跳过推送；下次运行时会继续等待激活消息')
            return false
        }
        await sendClawBot(config, '✅ ClawBot 通知已接通：Microsoft Rewards 脚本将在此推送运行摘要')
    }

    return true
}
