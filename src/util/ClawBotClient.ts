import fs from 'fs'
import path from 'path'
import { randomBytes } from 'crypto'
import { httpRequest } from './Http'
import { getProjectRoot } from './Load'

// 微信 ClawBot 推送：直连腾讯 iLink 官方灰度接口。
// 请求结构与登录流程对照 @tencent-weixin/openclaw-weixin 2.4.x 插件源码实现（MIT）。
const BASE_URL = 'https://ilinkai.weixin.qq.com'
const ILINK_APP_ID = 'bot'
const CHANNEL_VERSION = '2.4.3'
// iLink-App-ClientVersion 编码: 0x00MMNNPP（major<<16 | minor<<8 | patch）
const ILINK_APP_CLIENT_VERSION = (2 << 16) | (4 << 8) | 3
const BOT_AGENT = 'microsoft-rewards-script/4.3.0'

const QR_LONG_POLL_TIMEOUT_MS = 35_000
const API_TIMEOUT_MS = 15_000
const MAX_QR_REFRESH_COUNT = 3
const DEFAULT_LOGIN_TIMEOUT_MS = 5 * 60 * 1000

export interface ClawBotAuth {
    token: string
    accountId: string
    userId: string
    savedAt: string
}

export type ClawBotSendResult = 'ok' | 'expired' | 'rate-limited' | 'error'

export function resolveClawBotAuthFile(customPath?: string): string {
    if (customPath) return path.resolve(customPath)
    return path.join(getProjectRoot(), 'clawbot-auth.json')
}

export function loadClawBotAuth(customPath?: string): ClawBotAuth | null {
    const file = resolveClawBotAuthFile(customPath)
    try {
        if (!fs.existsSync(file)) return null
        const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>
        if (typeof raw.token === 'string' && raw.token && typeof raw.userId === 'string' && raw.userId) {
            return {
                token: raw.token,
                accountId: typeof raw.accountId === 'string' ? raw.accountId : '',
                userId: raw.userId,
                savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : new Date().toISOString()
            }
        }
        return null
    } catch {
        return null
    }
}

export function saveClawBotAuth(auth: ClawBotAuth, customPath?: string): void {
    const file = resolveClawBotAuthFile(customPath)
    fs.writeFileSync(file, JSON.stringify(auth, null, 4))
}

export function clearClawBotAuth(customPath?: string): void {
    try {
        fs.unlinkSync(resolveClawBotAuthFile(customPath))
    } catch {
        // ignore missing file
    }
}

// X-WECHAT-UIN: 每次请求随机生成（uint32 -> 十进制字符串 -> base64）
function randomWechatUin(): string {
    const uint32 = randomBytes(4).readUInt32BE(0)
    return Buffer.from(String(uint32), 'utf-8').toString('base64')
}

function buildHeaders(token?: string): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        AuthorizationType: 'ilink_bot_token',
        'X-WECHAT-UIN': randomWechatUin(),
        'iLink-App-Id': ILINK_APP_ID,
        'iLink-App-ClientVersion': String(ILINK_APP_CLIENT_VERSION)
    }
    if (token?.trim()) headers.Authorization = `Bearer ${token.trim()}`
    return headers
}

async function iLinkPost<T>(url: string, data: unknown, opts: { token?: string; timeout?: number } = {}): Promise<T> {
    const response = await httpRequest<T>({
        method: 'POST',
        url,
        headers: buildHeaders(opts.token),
        data,
        timeout: opts.timeout ?? API_TIMEOUT_MS
    })
    return response.data
}

async function iLinkGet<T>(
    url: string,
    params: Record<string, string>,
    opts: { timeout?: number } = {}
): Promise<T> {
    const response = await httpRequest<T>({
        method: 'GET',
        url,
        params,
        headers: buildHeaders(),
        timeout: opts.timeout ?? API_TIMEOUT_MS
    })
    return response.data
}

interface SendMessageResponse {
    ret?: number
    errmsg?: string
}

export async function sendClawBotText(auth: ClawBotAuth, text: string): Promise<ClawBotSendResult> {
    const clientId = `openclaw-weixin-${randomBytes(16).toString('hex')}`
    const body = {
        msg: {
            from_user_id: '',
            to_user_id: auth.userId,
            client_id: clientId,
            message_type: 2,
            message_state: 2,
            item_list: [{ type: 1, text_item: { text } }]
        },
        base_info: {
            channel_version: CHANNEL_VERSION,
            bot_agent: BOT_AGENT
        }
    }

    try {
        const resp = await iLinkPost<SendMessageResponse>(`${BASE_URL}/ilink/bot/sendmessage`, body, {
            token: auth.token
        })
        const ret = resp?.ret ?? 0
        if (ret === 0) return 'ok'
        if (ret === -14) return 'expired'
        if (ret === -2) return 'rate-limited'
        return 'error'
    } catch (err) {
        const status = (err as { status?: number })?.status
        if (status === 401 || status === 403) return 'expired'
        return 'error'
    }
}

// ---------------------------------------------------------------------------
// 交互式扫码登录
// ---------------------------------------------------------------------------

interface QrCodeResponse {
    qrcode?: string
    qrcode_img_content?: string
}

interface QrStatusResponse {
    status?: string
    redirect_host?: string
    bot_token?: string
    ilink_bot_id?: string
    ilink_user_id?: string
}

function log(msg: string): void {
    process.stdout.write(`[ClawBot] ${msg}\n`)
}

async function displayQrCode(qrUrl: string): Promise<void> {
    try {
        const qrterm = (await import('qrcode-terminal')) as { default?: { generate: (text: string, opts?: unknown) => void } }
        const generate = qrterm.default?.generate ?? (qrterm as unknown as { generate: (text: string, opts?: unknown) => void }).generate
        generate(qrUrl, { small: true })
    } catch {
        // 二维码渲染失败时仅打印链接
    }
    process.stdout.write('若二维码无法显示，可在浏览器打开以下链接后用微信扫描：\n')
    process.stdout.write(`${qrUrl}\n`)
}

async function fetchQrCode(pollBaseUrl: string, localTokenList: string[]): Promise<QrCodeResponse> {
    return iLinkPost<QrCodeResponse>(`${pollBaseUrl}/ilink/bot/get_bot_qrcode?bot_type=3`, {
        local_token_list: localTokenList
    })
}

function readVerifyCodeFromStdin(prompt: string): Promise<string> {
    process.stdout.write(prompt)
    return new Promise(resolve => {
        let input = ''
        const onData = (chunk: Buffer) => {
            input += chunk.toString()
            if (input.includes('\n')) {
                process.stdin.removeListener('data', onData)
                process.stdin.pause()
                resolve(input.trim())
            }
        }
        process.stdin.resume()
        process.stdin.setEncoding('utf-8')
        process.stdin.on('data', onData)
    })
}

export interface ClawBotLoginResult {
    ok: boolean
    auth?: ClawBotAuth
    message: string
}

/**
 * 交互式扫码登录：终端展示二维码，等待手机微信确认。
 * 总超时默认 5 分钟；期间处理数字配对码、二维码过期刷新与 IDC 重定向。
 */
export async function loginClawBotInteractive(customAuthPath?: string, timeoutMs = DEFAULT_LOGIN_TIMEOUT_MS): Promise<ClawBotLoginResult> {
    const existing = loadClawBotAuth(customAuthPath)
    const localTokenList = existing?.token ? [existing.token] : []

    let pollBaseUrl = BASE_URL
    let qrRefreshCount = 0
    let pendingVerifyCode: string | undefined
    let scannedNotified = false

    const refreshQr = async (): Promise<string | null> => {
        const resp = await fetchQrCode(pollBaseUrl, localTokenList)
        if (!resp.qrcode) return null
        scannedNotified = false
        if (resp.qrcode_img_content) await displayQrCode(resp.qrcode_img_content)
        return resp.qrcode
    }

    let qrcode: string
    try {
        log('请使用手机微信扫描以下二维码，以连接微信 ClawBot：')
        qrcode = (await refreshQr()) ?? ''
    } catch (err) {
        return { ok: false, message: `获取二维码失败: ${String(err)}` }
    }
    if (!qrcode) {
        return { ok: false, message: '获取二维码失败（接口可能未放量或网络异常）' }
    }

    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        let status: QrStatusResponse
        try {
            const params: Record<string, string> = { qrcode }
            if (pendingVerifyCode) params.verify_code = pendingVerifyCode
            status = await iLinkGet<QrStatusResponse>(`${pollBaseUrl}/ilink/bot/get_qrcode_status`, params, {
                timeout: QR_LONG_POLL_TIMEOUT_MS
            })
        } catch {
            // 长轮询超时或网络抖动，视为等待状态继续轮询
            await new Promise(resolve => setTimeout(resolve, 1000))
            continue
        }

        switch (status.status) {
            case 'wait':
                break
            case 'scaned':
                pendingVerifyCode = undefined
                if (!scannedNotified) {
                    log('已扫码，等待手机确认…')
                    scannedNotified = true
                }
                break
            case 'need_verifycode': {
                const prompt = pendingVerifyCode ? '❌ 数字不匹配，请重新输入手机微信显示的数字：' : '请输入手机微信上显示的数字以继续：'
                pendingVerifyCode = await readVerifyCodeFromStdin(prompt)
                continue
            }
            case 'expired':
            case 'verify_code_blocked': {
                if (status.status === 'verify_code_blocked') log('⛔ 多次输入错误，正在刷新二维码…')
                else log('⏳ 二维码已过期，正在刷新…')
                pendingVerifyCode = undefined
                qrRefreshCount++
                if (qrRefreshCount > MAX_QR_REFRESH_COUNT) {
                    return { ok: false, message: '二维码多次失效，登录已停止，请稍后重试' }
                }
                try {
                    const renewed = await refreshQr()
                    if (!renewed) return { ok: false, message: '刷新二维码失败' }
                    qrcode = renewed
                } catch {
                    return { ok: false, message: '刷新二维码失败' }
                }
                break
            }
            case 'scaned_but_redirect':
                if (status.redirect_host) {
                    pollBaseUrl = `https://${status.redirect_host}`
                    log(`服务节点切换: ${status.redirect_host}`)
                }
                break
            case 'binded_redirect':
                return { ok: false, message: '该微信已连接过其他 ClawBot 客户端，请先在原客户端解绑后重试' }
            case 'confirmed': {
                if (!status.ilink_bot_id) {
                    return { ok: false, message: '登录失败：服务器未返回账号标识' }
                }
                const auth: ClawBotAuth = {
                    token: status.bot_token ?? '',
                    accountId: status.ilink_bot_id,
                    userId: status.ilink_user_id ?? '',
                    savedAt: new Date().toISOString()
                }
                if (!auth.token || !auth.userId) {
                    return { ok: false, message: '登录失败：服务器未返回完整凭证' }
                }
                saveClawBotAuth(auth, customAuthPath)
                log('✅ 微信 ClawBot 连接成功，凭证已保存')
                return { ok: true, auth, message: '连接成功' }
            }
            default:
                break
        }

        await new Promise(resolve => setTimeout(resolve, 1000))
    }

    return { ok: false, message: '等待扫码超时（5 分钟），本次跳过 ClawBot 推送' }
}
