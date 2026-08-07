# Microsoft Rewards 脚本控制 API

这是一个轻量且零依赖的 HTTP API，可供仪表盘或其他本地工具
控制和监视 Microsoft Rewards 脚本。

此 API 可以：

- 启动、停止、重启机器人进程，以及远程关闭该进程；
- 运行所有已配置账号、某个指定账号，或运行除
  所选账号之外的所有账号；
- 提供实时进程状态和积分总数；
- 通过服务器发送事件（SSE）流式传输结构化日志；
- 返回最近的错误、内存中的运行历史、已配置账号摘要
  以及诊断捕获内容；
- 列出已保存的会话元数据，并删除属于某个账号的
  移动端和桌面端会话；
- 读取 `config.json`，并在明确启用后验证和更新该文件；
- 读取实际生效的 cron 计划，并在 Docker API 模式下持久化和应用
  计划变更，无需重启容器。

它仅使用 Node.js 内置模块，并遵循项目中其他脚本使用的
ESM `.js` 约定。

---

## 目录

- [架构与持久化](#架构与持久化)
- [环境要求](#环境要求)
- [快速设置](#快速设置)
    - [构建机器人](#构建机器人)
    - [无认证运行](#无认证运行)
    - [通过命令行启用认证](#通过命令行启用认证)
    - [通过 `.env` 启用认证](#通过-env-启用认证)
    - [连接仪表盘](#连接仪表盘)
    - [验证 API](#验证-api)
- [认证](#认证)
- [HTTP 约定](#http-约定)
- [Axios 设置](#axios-设置)
- [端点概览](#端点概览)
- [读取 API 状态](#读取-api-状态)
- [会话管理](#会话管理)
- [读取诊断信息](#读取诊断信息)
- [启动和控制运行](#启动和控制运行)
- [使用 SSE 获取实时事件流](#使用-sse-获取实时事件流)
- [读取和编辑配置](#读取和编辑配置)
- [读取和编辑计划](#读取和编辑计划)
- [Axios 响应和错误处理](#axios-响应和错误处理)
- [PowerShell 示例](#powershell-示例)
- [HTTP 状态码](#http-状态码)
- [环境变量](#环境变量)
- [安全建议](#安全建议)
- [保持 API 运行](#保持-api-运行)
- [启动就绪状态](#启动就绪状态)
- [文件布局](#文件布局)

---

## 架构与持久化

此 API 是机器人与仪表盘之间的轻量运行时控制器。它将常规机器人命令
作为子进程启动并解析其输出，
但不维护运行时数据库。

```text
bot repository                               dashboard or other client
┌───────────────────────────────┐            ┌────────────────────────┐
│ node scripts/api/server.js    │            │ HTTP client             │
│   ├─ starts/stops the bot     │ ◀──HTTP──▶ │ CONTROL_API_URL         │
│   ├─ parses logs and points   │   + token  │ CONTROL_API_TOKEN       │
│   └─ keeps short-lived state  │            │ persistent dashboard DB │
└───────────────────────────────┘            └────────────────────────┘
```

以下数据仅存在于内存中，并会在 API 进程
每次重启时重置：

- 缓冲日志；
- 实时运行状态；
- 已解析的错误；
- 已完成的运行历史；
- 根据该历史计算的账号统计信息。

此 API 不创建自己的数据库。配置和计划写入功能默认均为禁用，
且需要通过各自的环境变量明确启用：

- `PUT` 或 `PATCH /config` 会更新 `config.json`。替换前会尽力将原文件
  复制到 `config.json.bak`。
- `PUT` 或 `PATCH /schedule` 会以原子方式写入 `config/schedule.json`，并立即
  应用 cron 变更。该文件位于现有 Docker `./config`
  卷中，因此容器重启后仍会保留，且优先级高于
  `CRON_SCHEDULE`。
- `DELETE /sessions/:email` 只会从机器人现有的 `sessions.db` 中删除
  匹配该账号的记录。API 从不公开已保存的 Cookie 或
  指纹内容，也不提供删除全部会话的路由。

所有实时日志、已解析运行状态、错误、历史和计算所得的账号
统计信息仍只保存在内存中。需要持久历史时，仪表盘可以单独
保存这些结果。

## 环境要求

- Node.js 24 或更高版本；
- 已完成构建的机器人，通常应存在 `dist/index.js`；
- 机器人仓库的 `scripts/api/` 目录中包含 API 文件。

此实现与平台无关。终止进程树时，Windows 使用
`taskkill`，Linux 和 macOS 使用进程组信号。

## 快速设置

### 构建机器人

启动控制 API 前，请先安装并构建项目：

```bash
npm install
npm run build
```

`npm run api` 会启动 API 服务器，而不会立即运行奖励任务。API 开始
监听后，请使用 `POST /start` 或已连接的仪表盘
启动机器人。

### 无认证运行

不使用令牌启动 API：

```bash
npm run api
```

等效的直接命令为：

```bash
node scripts/api/server.js
```

这会在以下地址启动无认证 API：

```text
http://127.0.0.1:3010
```

> [!IMPORTANT]
> 仅当当前进程环境和已加载的 `.env` 文件中都不存在 `API_TOKEN`，
> 或其值为空时，API 才处于无认证状态。如果 `.env` 已包含
> `API_TOKEN`，请删除或注释该行，然后重启 API。

> [!WARNING]
> 仅当 `API_HOST` 为 `127.0.0.1`、`localhost`
> 或受信任计算机上的 `::1` 时，才能无认证运行。切勿通过局域网地址、
> 已发布的容器端口、反向代理或公网暴露无认证 API。

### 通过命令行启用认证

通过 npm 传入令牌，执行一次经过认证的启动：

```bash
npm run api -- --token "YOUR_API_TOKEN"
```

第一个 `--` 属于 npm，用于告诉 npm 将剩余参数转发给
`scripts/api/server.js`。API 本身收到的参数是
`--token "YOUR_API_TOKEN"`。

等效的直接命令为：

```bash
node scripts/api/server.js --token "YOUR_API_TOKEN"
```

> [!NOTE]
> 支持的选项是 `--token`，而不是 `--auth`。如果环境或 `.env` 中已设置
> `API_TOKEN`，该值的优先级高于命令行
> 令牌。

请生成高强度令牌，不要使用简短的示例值：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

也可以为同一次启动设置监听地址和端口：

```bash
npm run api -- --host 127.0.0.1 --port 3010 --token "YOUR_API_TOKEN"
```

### 通过 `.env` 启用认证

对于常规或重复使用，请在项目的 `.env` 中配置认证：

```dotenv
API_HOST=127.0.0.1
API_PORT=3010
API_TOKEN=replace-with-a-long-random-token
API_CORS_ORIGIN=http://127.0.0.1:3000
```

然后正常启动 API：

```bash
npm run api
```

API 会自动加载当前工作目录、仓库根目录或 `dist/` 目录中
第一个可用的 `.env`。认证模式在启动时确定，因此添加、更改或删除
`API_TOKEN` 后请重启 API。

### 连接仪表盘

向仪表盘提供 API 使用的同一基础 URL 和令牌：

```dotenv
CONTROL_API_URL=http://127.0.0.1:3010
CONTROL_API_TOKEN=replace-with-the-same-token
```

仅当 API 有意以无认证模式运行时，才将 `CONTROL_API_TOKEN`
留空。

### 验证 API

对于无认证服务器：

```bash
curl --request GET \
  --url http://127.0.0.1:3010/health
```

对于已认证服务器：

```bash
curl --request GET \
  --url http://127.0.0.1:3010/health \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

成功响应示例：

```json
{
    "ok": true,
    "name": "microsoft-rewards-script",
    "version": "4.1.0",
    "state": "idle",
    "uptimeSec": 12,
    "authRequired": true
}
```

如果已启用认证，同一请求在缺少有效令牌时会返回
`401 Unauthorized`。确切的软件包名称和版本读取自仓库的
`package.json`。

## 认证

未设置 `API_TOKEN` 时，所有端点都处于开放状态。只有当 API
绑定到受信任的环回接口时，这才是可接受的。

设置 `API_TOKEN` 后，**每个端点**都需要令牌，包括 `/`、
`/health`、诊断文件和 SSE 事件流。

服务器令牌既可以通过 `API_TOKEN` 持久配置，也可以使用
`npm run api -- --token "YOUR_API_TOKEN"` 仅为单次启动配置。当两者同时存在时，
环境变量或 `.env` 中的值优先。令牌在 API 进程的整个生命周期内保持不变；
如需更改认证模式或改用其他令牌，请重启
服务器。

可以通过以下三种方式之一提供令牌。

### Bearer 令牌

```bash
curl --request GET \
  --url http://127.0.0.1:3010/status \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

### API key 请求头

```bash
curl --request GET \
  --url http://127.0.0.1:3010/status \
  --header 'X-API-Key: YOUR_API_TOKEN'
```

### SSE 查询参数

```text
http://127.0.0.1:3010/events?token=<API_TOKEN>
```

查询参数形式只允许用于 `/events`，主要供无法设置自定义认证请求头的浏览器
`EventSource` 使用。其他请求都应使用请求头，因为 URL 可能被保存在浏览器历史和代理
日志中。


令牌无效或缺失时返回：

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json
```

```json
{
    "error": "Unauthorized",
    "hint": "Provide the API token via Authorization: Bearer or X-API-Key. Browser EventSource may use ?token= only on /events. ..."
}
```

## HTTP 约定

- 基础 URL 为 `http://<API_HOST>:<API_PORT>`。
- 除返回 SSE 或诊断文件的端点外，请求体和响应体均为 JSON。

- JSON 请求应包含 `Content-Type: application/json`。
- 省略或为空的 JSON 请求体按 `{}` 处理。
- 接受的请求体最大为 1,000,000 字节。
- 未知路由返回带 JSON 错误信息的 `404`。
- CORS 根据 `API_CORS_ORIGIN` 启用。
- `OPTIONS` 预检请求返回 `204 No Content`。

下方所有示例都使用这些占位值：

- `http://127.0.0.1:3010` 是 API 基础 URL；
- `YOUR_API_TOKEN` 是配置为 `API_TOKEN` 的值。

cURL 示例特意写成自包含形式，风格类似公开 API
参考文档，因此无需预先定义 shell 变量即可复制
任意单个请求。

## Axios 设置

在仪表盘或其他客户端项目中安装 Axios：

```bash
npm install axios
```

创建一个可复用的客户端：

```js
import axios from 'axios'

export const api = axios.create({
    baseURL: 'http://127.0.0.1:3010',
    headers: {
        Authorization: 'Bearer YOUR_API_TOKEN'
    },
    timeout: 30_000
})
```

下方 Axios 示例假定已导入此客户端：

```js
import { api } from './apiClient.js'
```

只有使用 API 的仪表盘或客户端需要 Axios。控制 API
服务器本身仍然零依赖。

## 端点概览

### 读取端点

| 方法 | 路径                            | 用途                                                               |
| ------ | ------------------------------- | ----------------------------------------------------------------- |
| `GET`  | `/`                             | API 名称、版本、认证状态和端点索引。                               |
| `GET`  | `/health`                       | 轻量存活状态和进程状态检查。                                       |
| `GET`  | `/status`                       | 完整的进程状态和已解析运行状态。                                   |
| `GET`  | `/points`                       | 供仪表盘轮询的简化实时积分总数。                                   |
| `GET`  | `/logs`                         | 已缓冲的结构化日志。                                               |
| `GET`  | `/errors`                       | 最近的警告/错误日志和各账号失败信息。                              |
| `GET`  | `/history`                      | 当前 API 进程保留的已完成运行记录。                                |
| `GET`  | `/accounts`                     | 已配置账号的安全摘要和最近运行统计信息。                           |
| `GET`  | `/sessions`                     | 不含机密内容的已保存账号/平台会话元数据。                          |
| `GET`  | `/diagnostics`                  | 列出可用的错误捕获目录。                                           |
| `GET`  | `/diagnostics/<capture>/<file>` | 下载或查看一项诊断产物。                                           |
| `GET`  | `/config`                       | 读取 `config.json`，默认隐藏敏感值。                               |
| `GET`  | `/schedule`                     | 读取实际生效的 cron 计划及其来源。                                 |
| `GET`  | `/events`                       | 包含实时日志和状态更新的 SSE 事件流。                              |

### 控制和写入端点

| 方法     | 路径               | 用途                                                   |
| -------- | ------------------ | ------------------------------------------------------- |
| `POST`   | `/start`           | 启动一次机器人运行。                                   |
| `POST`   | `/stop`            | 请求正常或强制终止进程。                               |
| `POST`   | `/restart`         | 停止当前运行，然后启动新的运行。                       |
| `POST`   | `/shutdown`        | 必要时停止机器人，并终止 API 进程。                    |
| `DELETE` | `/sessions/:email` | 只删除一个账号的移动端和桌面端会话。                   |
| `PUT`    | `/config`          | 验证后替换完整配置。                                   |
| `PATCH`  | `/config`          | 验证后深度合并部分配置。                               |
| `PUT`    | `/schedule`        | 持久化并立即应用提供的计划字段。                       |
| `PATCH`  | `/schedule`        | 持久化并立即应用提供的计划字段。                       |

## 读取 API 状态

### `GET /`

返回机器可读的端点索引：

**cURL**

```bash
curl --request GET \
  --url http://127.0.0.1:3010/ \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/')
console.log(data)
```

```json
{
    "name": "microsoft-rewards-script",
    "version": "4.1.0",
    "message": "Control API",
    "authRequired": true,
    "stateless": true,
    "endpoints": [
        "GET /health",
        "GET /status",
        "GET /points",
        "GET /logs",
        "GET /errors",
        "GET /history",
        "GET /accounts",
        "GET /sessions",
        "GET /diagnostics",
        "GET /events",
        "GET /config",
        "GET /schedule",
        "POST /start",
        "POST /stop",
        "POST /restart",
        "POST /shutdown",
        "DELETE /sessions/:email",
        "PUT|PATCH /config",
        "PUT|PATCH /schedule"
    ]
}
```

### `GET /health`

用于简单的存活状态检查。响应不包含账号或积分
详情。

**cURL**

```bash
curl --request GET \
  --url http://127.0.0.1:3010/health \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/health')
console.log(data)
```

重要字段：

- `ok`：API 能够响应时始终为 `true`；
- `state`：`idle`、`starting`、`running` 或 `stopping`；
- `uptimeSec`：API 进程运行时间，而非机器人任务运行时长；
- `authRequired`：是否已配置 `API_TOKEN`。

### `GET /status`

返回完整的控制器状态和已解析运行状态：

**cURL**

```bash
curl --request GET \
  --url http://127.0.0.1:3010/status \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/status')
console.log(data)
```

典型响应：

```jsonc
{
    "name": "microsoft-rewards-script",
    "version": "4.1.0",
    "state": "running",
    "pid": 18420,
    "startedAt": "2026-07-14T09:30:00.000Z",
    "command": "node /app/dist/index.js",
    "lastExit": null,
    "logCount": 418,
    "logBufferSize": 2000,
    "latestLogId": 418,
    "run": {
        "version": "4.1.0",
        "clusters": 1,
        "accountsTotal": 2,
        "accountsSeen": 1,
        "collected": 155,
        "totals": null,
        "finished": false,
        "live": {
            "currentAccount": "user@example.com",
            "currentBalance": 12480,
            "gained": 155,
            "updatedAt": "7/14/2026, 11:31:04 AM"
        },
        "accounts": [
            {
                "email": "user@example.com",
                "geoLocale": "NL",
                "initialPoints": 12325,
                "collectedPoints": null,
                "finalPoints": null,
                "earnable": { "mobile": 60, "browser": 90, "app": 30 },
                "searchSummary": { "mobile": 60, "desktop": 90, "bonus": 0, "total": 150 },
                "streakProtection": {
                    "enabled": true,
                    "remainingDays": 1,
                    "streakCounter": 9,
                    "updatedAt": "7/14/2026, 11:30:44 AM"
                },
                "durationSeconds": null,
                "success": null,
                "error": null,
                "live": {
                    "balance": 12480,
                    "gained": 155,
                    "bySource": { "search": 150, "checkIn": 5 },
                    "lastUpdateTs": "7/14/2026, 11:31:04 AM"
                }
            }
        ]
    }
}
```

空闲时，`pid` 和 `startedAt` 为 `null`。`lastExit` 包含最近一次
结束的子进程信息。

### `GET /points`

这是实时积分组件的推荐轮询端点。与 `/status` 相比，它提供更小、
更聚焦积分的视图。

**cURL**

```bash
curl --request GET \
  --url http://127.0.0.1:3010/points \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/points')
console.log(data)
```

```jsonc
{
    "state": "running",
    "running": true,
    "live": true,
    "startedAt": "2026-07-14T09:30:00.000Z",
    "currentAccount": "user@example.com",
    "balance": 12480,
    "collected": 155,
    "updatedAt": "7/14/2026, 11:31:04 AM",
    "finished": false,
    "totals": null,
    "accountsTotal": 2,
    "accountsSeen": 1,
    "accounts": [
        {
            "email": "user@example.com",
            "collected": 155,
            "balance": 12480,
            "initialPoints": 12325,
            "bySource": { "search": 150, "checkIn": 5 },
            "earnable": { "mobile": 60, "browser": 90, "app": 30 },
            "streakProtection": {
                "enabled": true,
                "remainingDays": 1,
                "streakCounter": 9,
                "updatedAt": "7/14/2026, 11:30:44 AM"
            },
            "done": false,
            "success": null,
            "error": null
        }
    ],
    "lastExit": null
}
```

API 会根据 `pointsGained`、`currentBalance` 和 `previousBalance` 等稳定的、
面向机器的日志字段更新积分总数。当账号发出最终的
`ACCOUNT-END` 行时，实时估算值会替换为机器人最终的
权威数值。

### `GET /logs`

返回内存环形缓冲区中的结构化日志。

查询参数：

| 参数      | 默认值 | 行为                                                                       |
| --------- | ------: | ---------------------------------------------------------------------------------- |
| `limit`   |   `200` | 返回的最近条目数量。在 `1` 和 `API_LOG_BUFFER` 之间限制。                |
| `afterId` |   未设置 | 返回数值 `id` 大于此值的条目。适用于轮询。                                |
| `level`   |   未设置 | 最低严重级别：`debug`、`info`、`warn` 或 `error`。                        |

示例：

**cURL - 最近 50 条记录**

```bash
curl --request GET \
  --url 'http://127.0.0.1:3010/logs?limit=50' \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios - 最近 50 条记录**

```js
const { data } = await api.get('/logs', {
    params: { limit: 50 }
})
console.log(data.logs)
```

其他实用的 Axios 查询：

```js
    // 仅包含警告和错误条目
const warnings = await api.get('/logs', {
    params: { level: 'warn', limit: 100 }
})

    // 仅包含日志 ID 418 之后创建的条目
const newerLogs = await api.get('/logs', {
    params: { afterId: 418 }
})
```

响应：

```jsonc
{
    "logs": [
        {
            "id": 419,
            "receivedAt": "2026-07-14T09:31:05.000Z",
            "ts": "7/14/2026, 11:31:05 AM",
            "level": "info",
            "user": "user",
            "platform": "DESKTOP",
            "title": "SEARCH-BING",
            "message": "pointsGained=3 | currentBalance=12483",
            "source": "stdout",
            "parsed": true,
            "raw": "[7/14/2026, 11:31:05 AM] [...]"
        }
    ],
    "latestLogId": 419,
    "count": 1
}
```

提供 `afterId` 时，API 会返回环形缓冲区中仍可用的所有较新条目，
而不是应用通常的尾部返回行为。

### `GET /errors`

返回警告/错误日志条目，以及当前运行中各账号的失败信息。

查询参数：

| 参数       | 默认值 | 行为                                       |
| ---------- | ------: | -------------------------------------------- |
| `limit`    |   `100` | 要返回的警告/错误日志条目的最大数量。      |
| `warnings` |  `true` | 使用 `warnings=false` 时仅返回错误。       |

**cURL**

```bash
curl --request GET \
  --url 'http://127.0.0.1:3010/errors?limit=50' \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/errors', {
    params: {
        limit: 50,
        warnings: false
    }
})
console.log(data)
```

```jsonc
{
    "errors": [
        {
            "id": 510,
            "level": "error",
            "title": "ACCOUNT-ERROR",
            "message": "user@example.com: Page closed unexpectedly"
        }
    ],
    "accountErrors": [
        {
            "email": "user@example.com",
            "error": "Page closed unexpectedly"
        }
    ],
    "count": 1
}
```

### `GET /history`

返回当前 API 进程启动的已完成运行记录，按最新优先排序。

查询参数：

| 参数      | 默认值             | 行为                                                   |
| --------- | ----------------: | ------------------------------------------------------------------- |
| `limit`   | `API_RUN_HISTORY` | 要返回的记录数量，不超过配置的历史记录大小。          |

**cURL**

```bash
curl --request GET \
  --url 'http://127.0.0.1:3010/history?limit=10' \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/history', {
    params: { limit: 10 }
})
console.log(data.runs)
```

```jsonc
{
    "runs": [
        {
            "startedAt": "2026-07-14T09:30:00.000Z",
            "endedAt": "2026-07-14T09:36:12.000Z",
            "exit": {
                "code": 0,
                "signal": null,
                "at": "2026-07-14T09:36:12.000Z"
            },
            "version": "4.1.0",
            "collected": 312,
            "accounts": [
                {
                    "email": "user@example.com",
                    "collected": 155,
                    "success": true,
                    "error": null,
                    "streakProtection": {
                        "enabled": true,
                        "remainingDays": 1,
                        "streakCounter": 9,
                        "updatedAt": "7/14/2026, 11:30:44 AM"
                    }
                }
            ]
        }
    ],
    "count": 1,
    "inMemoryOnly": true
}
```

此历史记录不具备持久性。需要图表或长期历史记录的仪表盘
应将返回的完成数据保存到自己的数据库中。

### `GET /accounts`

返回从 `.env` 中的 `ACCOUNT_<N>_EMAIL` 变量发现的所有已配置账号槽位，
与机器人自身的加载器保持一致。允许缺少槽位编号，结果按槽位编号
升序返回。
对于本地仪表盘，邮箱地址会完整返回。不会返回密码、
恢复地址、TOTP 密钥以及单独的代理用户名/密码值；摘要中会包含已配置的代理 URL 和端口。


**cURL**

```bash
curl --request GET \
  --url http://127.0.0.1:3010/accounts \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/accounts')
console.log(data.accounts)
```

此响应会规范化有效的账号区域设置值：语言使用规范的 BCP 47 大小写形式，明确指定的两字母国家代码使用大写。机器人会将相同值应用到浏览器和 HTTP 配置中。

```jsonc
{
    "accounts": [
        {
            "index": 1,
            "email": "user@example.com",
            "geoLocale": "NL",
            "langCode": "nl",
            "hasRecoveryEmail": true,
            "hasTotp": true,
            "proxy": {
                "url": "http://proxy.example.com",
                "port": "8080",
                "hasCredentials": true
            },
            "runs": 3,
            "totalCollected": 921,
            "successStreak": 3,
            "lastRunAt": "2026-07-14T09:36:12.000Z",
            "lastCollected": 312,
            "lastSuccess": true,
            "lastError": null,
            "streakProtection": {
                "enabled": true,
                "remainingDays": 1,
                "streakCounter": 9,
                "updatedAt": "7/14/2026, 11:30:44 AM"
            }
        }
    ],
    "count": 1
}
```

`runs`、`totalCollected`、`successStreak` 和 `last*` 字段根据此 API 进程的
内存历史记录计算，因此会在 API
重启后重置。

## 会话管理

会话端点使用配置的 `sessionPath` 下的 `sessions.db`。当设置了 `API_TOKEN` 时，
这些端点也需要正常的 API 令牌。

会话内容属于认证材料。API 会有意只返回账号、平台、更新时间、Cookie 数量以及
是否存在存储/指纹数据等安全元数据。Cookie 值、存储状态和指纹
内容永远不会返回。


### `GET /sessions`

列出所有已保存的移动端和桌面端会话。

**cURL**

```bash
curl --request GET \
  --url http://127.0.0.1:3010/sessions \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/sessions')
console.log(data.sessions)
```

```json
{
    "databaseExists": true,
    "sessions": [
        {
            "email": "user@example.com",
            "platform": "desktop",
            "updatedAt": "2026-07-17T08:30:00.000Z",
            "hasStorageState": true,
            "hasFingerprint": true,
            "cookieCount": 18
        },
        {
            "email": "user@example.com",
            "platform": "mobile",
            "updatedAt": "2026-07-17T08:31:00.000Z",
            "hasStorageState": true,
            "hasFingerprint": true,
            "cookieCount": 21
        }
    ],
    "count": 2,
    "accounts": 1
}
```

不存在会话数据库时，该端点仍返回 `200 OK`，其中
`databaseExists: false`、空的 `sessions` 以及计数值 0。`cookieCount` 为
`null` 表示无法解析已保存的 JSON；不会公开任何 Cookie 数据。

### `DELETE /sessions/:email`

删除与一个不区分大小写且完全匹配的账号邮箱对应的所有已保存平台。
邮箱必须作为一个路径值进行 URL 编码。API 特意不提供删除所有会话的
端点。

机器人必须处于空闲状态。在运行启动、运行中或停止过程中删除会话时，
会返回 `409 Conflict`，因为活动进程可能在删除后再次写回
会话。

**cURL**

```bash
curl --request DELETE \
  --url http://127.0.0.1:3010/sessions/user%40example.com \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const email = 'user@example.com'
const { data } = await api.delete(`/sessions/${encodeURIComponent(email)}`)
console.log(data)
```

```json
{
    "deleted": true,
    "found": true,
    "removed": 2,
    "email": "user@example.com",
    "platforms": ["desktop", "mobile"]
}
```

如果账号没有已保存的会话，端点会返回 `404 Not Found`，
并附带代码 `SESSION_NOT_FOUND`。不带邮箱的 `DELETE /sessions` 和无效的
邮箱路径会返回 `400 Bad Request`。端点不接受 JSON 请求体。

## 读取诊断信息

### `GET /diagnostics`

列出 `API_DIAGNOSTICS_DIR` 下发现的诊断捕获目录。

**cURL**

```bash
curl --request GET \
  --url http://127.0.0.1:3010/diagnostics \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/diagnostics')
console.log(data.entries)
```

```jsonc
{
    "dir": "/app/diagnostics",
    "count": 1,
    "entries": [
        {
            "name": "error-2026-07-14T09:35:10.000Z",
            "createdAt": "2026-07-14T09:35:11.400Z",
            "hasScreenshot": true,
            "hasHtml": true,
            "hasError": true,
            "error": "Page closed unexpectedly\n..."
        }
    ]
}
```

每个捕获目录只能公开以下文件名：

- `screenshot.png`；
- `error.txt`；
- `dump.html`。

示例：

**cURL - 下载屏幕截图**

```bash
curl --request GET \
  --url 'http://127.0.0.1:3010/diagnostics/error-2026-07-14T09:35:10.000Z/screenshot.png' \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --output screenshot.png
```

**Axios - 在 Node.js 中下载屏幕截图**

```js
import { writeFile } from 'node:fs/promises'

const response = await api.get('/diagnostics/error-2026-07-14T09:35:10.000Z/screenshot.png', {
    responseType: 'arraybuffer'
})

await writeFile('screenshot.png', response.data)
```

使用相同的 URL 格式请求 `error.txt` 或 `dump.html`。在浏览器中请求
二进制文件时，应使用 `responseType: 'blob'`，而不是 `arraybuffer`。

`dump.html` 会作为下载文件返回，而不是在页面内直接渲染。

## 启动和控制运行

所有控制端点都接受 JSON。为确保客户端和代理行为一致，始终发送
`Content-Type: application/json`。

### `POST /start`

启动机器人，并在子进程创建后返回 `202 Accepted`。运行可能仍会短暂处于
`starting` 状态。

支持的请求体字段：

| 字段                     | 类型                   | 说明                                                                                 |
| ------------------------ | ---------------------- | -------------------------------------------------------------------------------------- |
| `accountIndex`           | 正整数                 | 只运行一个已配置的 `ACCOUNT_<N>` 槽位。                                             |
| `excludedAccountIndexes` | 正整数数组             | 运行除这些槽位之外的所有已配置账号。                                                |
| `args`                   | 字符串数组             | 替换本 API 为本次运行配置的默认子进程参数。                                         |
| `env`                    | 对象                   | 添加仅对子进程生效的环境变量覆盖。需要 `API_ALLOW_ENV_OVERRIDES=true`。              |

`accountIndex` 和 `excludedAccountIndexes` 不能同时使用。

#### 启动所有已配置账号

**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/start \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{}'
```

**Axios**

```js
const { data } = await api.post('/start', {})
console.log(data)
```

```jsonc
{
    "started": true,
    "selectedAccount": null,
    "excludedAccounts": [],
    "pid": 18420,
    "startedAt": "2026-07-14T09:30:00.000Z",
    "command": "node",
    "args": ["/app/dist/index.js"]
}
```

#### 只启动一个账号

索引指向账号在 `.env` 中的原始槽位，而不是该账号在
`/accounts` 响应中的位置。

**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/start \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"accountIndex":2}'
```

**Axios**

```js
const { data } = await api.post('/start', {
    accountIndex: 2
})
console.log(data)
```

```jsonc
{
    "started": true,
    "selectedAccount": {
        "index": 2,
        "email": "user@example.com"
    },
    "excludedAccounts": [],
    "pid": 18420,
    "startedAt": "2026-07-14T09:30:00.000Z",
    "command": "node",
    "args": ["/app/dist/index.js"]
}
```

在内部，选中账号完整的 `ACCOUNT_2_*` 环境只会在新子进程中复制为
`ACCOUNT_1_*`。凭据会保留在 API 进程中，不会包含在 HTTP 响应里。


#### 启动除所选账号之外的所有账号

**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/start \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"excludedAccountIndexes":[2,4]}'
```

**Axios**

```js
const { data } = await api.post('/start', {
    excludedAccountIndexes: [2, 4]
})
console.log(data)
```

剩余账号会在子进程环境中重新连续编号。例如，如果存在槽位 1、2、3，且排除槽位 2，
原始槽位 1 和 3 会变为子进程槽位 1 和 2。API 请求和响应仍使用
原始索引。


未知槽位，以及尝试排除所有已配置账号的请求，会返回
`400 Bad Request`。

#### 覆盖启动参数

**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/start \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"args":["/app/dist/index.js","--example-flag"]}'
```

**Axios**

```js
const { data } = await api.post('/start', {
    args: ['/app/dist/index.js', '--example-flag']
})
console.log(data)
```

`args` 数组会替换已配置/默认的参数数组，而不是附加到其后。每个元素都必须是字符串。


#### 添加单次运行的环境变量

先启用此功能：

```dotenv
API_ALLOW_ENV_OVERRIDES=true
```

然后发送 `env` 对象：

**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/start \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"env":{"EXAMPLE_FLAG":"true","EXAMPLE_LIMIT":10}}'
```

**Axios**

```js
const { data } = await api.post('/start', {
    env: {
        EXAMPLE_FLAG: 'true',
        EXAMPLE_LIMIT: 10
    }
})
console.log(data)
```

字符串、数字和布尔值会被转换为字符串，并且只存在于子进程中；`null` 值会被忽略。
数组和对象会被拒绝。以下可能劫持启动过程的键始终会被丢弃（不区分大小写）：


- `NODE_OPTIONS`；
- `NODE_PATH`；
- `LD_PRELOAD`；
- `DYLD_INSERT_LIBRARIES`；
- `ELECTRON_RUN_AS_NODE`。

账号选择也使用仅对子进程生效的环境变量覆盖，即使禁用了任意 `env` 覆盖，仍然有效。


#### 启动错误

当运行处于 `starting`、`running` 或 `stopping` 状态时再次发起启动请求，
会返回：

```http
HTTP/1.1 409 Conflict
```

```json
{
    "error": "Cannot start: a run is already running.",
    "code": "ALREADY_RUNNING"
}
```

### `POST /stop`

请求终止当前活动的机器人进程。

正常停止：

**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/stop \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{}'
```

**Axios**

```js
const { data } = await api.post('/stop', {})
console.log(data)
```

强制停止：

**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/stop \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"force":true}'
```

**Axios**

```js
const { data } = await api.post('/stop', {
    force: true
})
console.log(data)
```

响应：

```json
{
    "stopping": true,
    "force": false
}
```

请求终止后，该端点会立即返回 `202 Accepted`。
正常停止会发送 `SIGTERM`；如果进程在 `API_STOP_TIMEOUT_MS` 后仍然存活，
API 会升级为 `SIGKILL`。在 Windows 上，`taskkill /T /F` 会终止整个进程树。


空闲时执行停止会返回带有代码 `NOT_RUNNING` 的 `409 Conflict`。

### `POST /restart`

如有必要，先停止当前运行，再启动新的运行。它接受与
`/start` 相同的 `accountIndex`、`excludedAccountIndexes`、`args` 和 `env` 字段，
并额外接受用于停止阶段的 `force`。

**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/restart \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"force":false,"accountIndex":2}'
```

**Axios**

```js
const { data } = await api.post('/restart', {
    force: false,
    accountIndex: 2
})
console.log(data)
```

```jsonc
{
    "restarted": true,
    "selectedAccount": {
        "index": 2,
        "email": "user@example.com"
    },
    "excludedAccounts": [],
    "pid": 19002,
    "startedAt": "2026-07-14T09:40:00.000Z",
    "command": "node",
    "args": ["/app/dist/index.js"]
}
```

如果 API 已经处于空闲状态，`/restart` 会直接启动新的运行。

### `POST /shutdown`

发送 `202 Accepted` 响应后终止 API 本身。如果机器人正在运行，API 会先停止它。


**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/shutdown \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"force":false}'
```

**Axios**

```js
const { data } = await api.post('/shutdown', {
    force: false
})
console.log(data)
```

```json
{
    "shuttingDown": true,
    "stoppingBot": true
}
```

请谨慎使用：响应发出后，API 端口将不可用，直到终端、PM2、systemd、Docker 或其他
监管程序再次启动该服务。


## 使用 SSE 获取实时事件流

### `GET /events`

该端点返回 `text/event-stream`，并发出三种命名事件类型：

- `hello`：连接后立即发送一份完整的 `/status` 快照；
- `log`：一条结构化日志条目，其中包含数字形式的 SSE `id`；
- `status`：进程状态发生变化以及解析到运行里程碑后，发送完整的状态快照。


每 15 秒发送一帧仅包含注释的保活消息。

查询参数：

| 参数      | 默认值 | 行为                                                                                         |
| --------- | ------: | -------------------------------------------------------------------------------------------------- |
| `replay`  |   `100` | 新连接时重放的最近日志条目数量。限制在 `0` 到 `API_LOG_BUFFER` 之间。                  |
| `token`   |   未设置 | 供无法发送请求头的浏览器 `EventSource` 等客户端使用的令牌。                            |

### 终端流

```bash
curl --request GET \
  --url 'http://127.0.0.1:3010/events?replay=50' \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --no-buffer
```

示例帧：

```text
event: hello
data: {"state":"running",...}

id: 419
event: log
data: {"id":419,"level":"info","message":"pointsGained=3 ..."}

event: status
data: {"reason":"points","state":"running",...}
```

### 使用 Axios 获取 Node.js 流

Axios 可以将原始 SSE 连接公开为 Node.js 可读流：

```js
const response = await api.get('/events', {
    params: { replay: 50 },
    responseType: 'stream',
    timeout: 0
})

response.data.setEncoding('utf8')
response.data.on('data', chunk => {
    process.stdout.write(chunk)
})

response.data.on('error', error => {
    console.error('SSE stream failed:', error)
})
```

这会公开原始 SSE 帧。客户端需要命名事件、事件 ID 或自动重连行为时，
请使用 SSE 解析器。

### 浏览器 `EventSource`

```js
const baseUrl = 'http://127.0.0.1:3010'
const token = encodeURIComponent('replace-with-your-token')
const events = new EventSource(`${baseUrl}/events?replay=100&token=${token}`)

events.addEventListener('hello', event => {
    const status = JSON.parse(event.data)
    console.log('Connected:', status.state)
})

events.addEventListener('log', event => {
    const entry = JSON.parse(event.data)
    console.log(`[${entry.level}] ${entry.message}`)
})

events.addEventListener('status', event => {
    const status = JSON.parse(event.data)
    console.log('Status update:', status)
})

events.onerror = error => {
    console.error('SSE connection error:', error)
}
```

浏览器在收到带有 `id` 的事件后重新连接时，会自动发送 `Last-Event-ID`。API 随后只会重放
较新的缓冲日志条目。如果请求的条目已经从环形缓冲区中移出，
这个无状态 API 无法恢复这些条目。


## 读取和编辑配置

### `GET /config`

从支持的仓库路径中读取第一个可用的 `config.json`。
默认情况下，脱敏器处理的 webhook URL、令牌和聊天标识符会替换为 `***REDACTED***`。


**cURL**

```bash
curl --request GET \
  --url http://127.0.0.1:3010/config \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/config')
console.log(data.config)
```

```jsonc
{
    "path": "/app/config.json",
    "redacted": true,
    "config": {
        "headless": true,
        "workers": {
            "doMobileSearch": true,
            "doDesktopSearch": true
        },
        "webhook": {
            "discord": {
                "url": "***REDACTED***"
            }
        }
    }
}
```

要允许返回未脱敏的响应，以下所有条件必须同时满足：

1. `API_ALLOW_CONFIG_REVEAL=true`；
2. 已配置 `API_TOKEN`；
3. 请求已通过认证；
4. 请求包含 `?reveal=1`。

**cURL**

```bash
curl --request GET \
  --url 'http://127.0.0.1:3010/config?reveal=1' \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/config', {
    params: { reveal: 1 }
})
console.log(data.config)
```

不要仅因为启用了令牌认证，就通过不受信任的网络暴露此端点。
请将未脱敏的配置响应视为机密材料。

### `PATCH /config`

先启用写入功能：

```dotenv
API_ALLOW_CONFIG_WRITE=true
```

补丁会递归合并到现有配置中。嵌套对象会合并；数组会整体替换现有数组。


**cURL**

```bash
curl --request PATCH \
  --url http://127.0.0.1:3010/config \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"workers":{"doMobileSearch":false}}'
```

**Axios**

```js
const { data } = await api.patch('/config', {
    workers: {
        doMobileSearch: false
    }
})
console.log(data)
```

成功响应：

```json
{
    "ok": true,
    "path": "/app/config.json",
    "via": "bot-ConfigSchema",
    "appliesOnNextRun": true
}
```

变更后的配置会在下一次机器人运行时使用，不会修改已经运行的子进程。


### `PUT /config`

`PUT` 会替换完整配置，因此请求体必须包含所有必填字段：


**cURL**

```bash
curl --request PUT \
  --url http://127.0.0.1:3010/config \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data-binary @config.json
```

**Axios - Node.js**

```js
import { readFile } from 'node:fs/promises'

const config = JSON.parse(await readFile('./config.json', 'utf8'))

const { data } = await api.put('/config', config)
console.log(data)
```

API 优先使用机器人严格编译后的 `ConfigSchema`（位于
`dist/util/Validator.js`），如果自定义验证器模块只公开该函数，则回退到
`validateConfig`。`API_VALIDATOR_MODULE` 可以指向其他编译后的模块。
如果没有可用的机器人验证器，则使用结构化回退逻辑检查当前核心字段类型。


验证失败会返回 `422 Unprocessable Entity`：

```jsonc
{
    "error": "Config validation failed",
    "via": "bot-ConfigSchema",
    "errors": ["workers.doMobileSearch: Expected boolean, received string"]
}
```

禁用写入功能时，`PUT` 和 `PATCH` 会返回 `403 Forbidden`。

## 读取和编辑计划

计划端点公开 Docker 集成 API 模式所使用的 cron 计划。
读取功能始终可用。写入功能必须明确启用，并且主要用于包含 cron 模板和
`crontab` 命令的 Docker 镜像。


实际生效的计划来自以下两个来源之一：

1. 通过 API 写入计划后生成的 `config/schedule.json`；
2. 不存在持久化覆盖时使用 `CRON_SCHEDULE`。

由于该文件保存在现有 `./config` 卷中，持久化覆盖在容器重启后仍然
优先于 `CRON_SCHEDULE`。

### `GET /schedule`

返回实际生效的计划，以及当前 API 实例是否允许更改计划。

**cURL**

```bash
curl --request GET \
  --url http://127.0.0.1:3010/schedule \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/schedule')
console.log(data)
```

计划仍来自容器环境时的响应：

```json
{
    "enabled": true,
    "cron": "0 7 * * *",
    "skipIfRunning": true,
    "excludedAccountIndexes": [],
    "updatedAt": null,
    "timezone": "Europe/Amsterdam",
    "source": "env",
    "writable": false
}
```

字段：

- `enabled`：是否应安装 cron 任务；
- `cron`：实际生效的五字段 cron 表达式；不存在时为 `null`；
- `skipIfRunning`：持久保存的调度器偏好。集成的 Docker 触发器
  在另一项运行处于活动状态时已经会正常退出；
- `excludedAccountIndexes`：计划运行时忽略的原始 `ACCOUNT_<N>`
  槽位；
- `updatedAt`：最后写入持久化覆盖的时间，否则为 `null`；
- `timezone`：当前使用的 `TZ` 值。请在容器环境中更改 `TZ`，
  而不是通过此端点更改；
- `source`：使用 `CRON_SCHEDULE` 时为 `env`，使用
  `config/schedule.json` 时为 `override`；
- `writable`：`API_ALLOW_SCHEDULE_WRITE=true` 是否已生效。

### `PUT /schedule` 和 `PATCH /schedule`

先在 API 进程中启用计划写入功能：

```dotenv
API_ALLOW_SCHEDULE_WRITE=true
```

对于此端点，`PUT` 和 `PATCH` 具有相同的部分更新行为：只更改 JSON 请求体中
存在的字段。结果会以原子方式写入 `config/schedule.json`，随后立即替换当前
crontab，无需重启容器。


支持的请求体字段：

| 字段                     | 类型                   | 说明                                                                         |
| ------------------------ | ---------------------- | -------------------------------------------------------------------------- |
| `enabled`                | 布尔值                 | 安装或移除 cron 任务。启用时需要有效的 `cron` 值。                           |
| `cron`                   | 字符串                 | 数字形式的五字段 cron 表达式，例如 `0 7 * * *`。                            |
| `skipIfRunning`          | 布尔值                 | 保留在持久化计划中的调度器偏好。                                             |
| `excludedAccountIndexes` | 正整数数组             | cron 或 `RUN_ON_START` 通过 API 触发运行时要排除的账号槽位。                 |

cron 解析器接受 `*`、数字值、逗号分隔值、范围和步长，
但必须位于常规五字段范围内。不接受命名月份/星期和
`@daily` 等宏。

**cURL - 启用每天 07:00 执行的计划并排除 `ACCOUNT_2`**

```bash
curl --request PATCH \
  --url http://127.0.0.1:3010/schedule \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"enabled":true,"cron":"0 7 * * *","skipIfRunning":true,"excludedAccountIndexes":[2]}'
```

**Axios**

```js
const { data } = await api.patch('/schedule', {
    enabled: true,
    cron: '0 7 * * *',
    skipIfRunning: true,
    excludedAccountIndexes: [2]
})

console.log(data)
```

```json
{
    "enabled": true,
    "cron": "0 7 * * *",
    "skipIfRunning": true,
    "excludedAccountIndexes": [2],
    "updatedAt": "2026-07-16T19:30:00.000Z",
    "timezone": "Europe/Amsterdam",
    "source": "override",
    "writable": true
}
```

禁用已保存的计划，但不删除其他设置：

```js
await api.patch('/schedule', { enabled: false })
```

禁用操作会移除当前 crontab，但覆盖文件仍是权威来源。
要恢复原始 `CRON_SCHEDULE` 环境默认值，请删除
`config/schedule.json` 并重启容器。不存在 `DELETE /schedule`
端点。

无效 cron 表达式、非数组形式的排除项、非正数索引，或在没有 cron 表达式时启用计划，
都会返回 `400 Bad Request`。禁用写入功能时，两种方法都返回
`403 Forbidden`。在所提供的 Docker 镜像之外写入时，如果 cron 模板或
`crontab` 可执行文件不可用，可能返回 `500`。


## Axios 响应和错误处理

Axios 会将成功的 JSON 响应放在 `response.data` 中：

```js
const response = await api.get('/points')

console.log(response.status) // 200
console.log(response.data) // parsed JSON response
```

对于 API 错误，请检查 `error.response.status` 和 `error.response.data`：

```js
import axios from 'axios'

try {
    const { data } = await api.post('/start', {
        accountIndex: 2
    })

    console.log(data)
} catch (error) {
    if (axios.isAxiosError(error) && error.response) {
        console.error('HTTP status:', error.response.status)
        console.error('API error:', error.response.data)
    } else {
        console.error('Request failed:', error)
    }
}
```

不要对浏览器 SSE 使用常规 Axios JSON 请求。访问 `/events` 时请使用
`EventSource`。对于诊断文件，在浏览器中将 `responseType` 设为 `blob`，
在 Node.js 中设为 `arraybuffer`。

## PowerShell 示例

在 Windows 上使用 PowerShell 的 `Invoke-RestMethod` 很方便：

```powershell
$BaseUrl = 'http://127.0.0.1:3010'
$Headers = @{ Authorization = "Bearer $env:API_TOKEN" }

# 健康检查
Invoke-RestMethod -Uri "$BaseUrl/health" -Headers $Headers

# 仅启动 ACCOUNT_2
$Body = @{ accountIndex = 2 } | ConvertTo-Json
Invoke-RestMethod `
    -Method Post `
    -Uri "$BaseUrl/start" `
    -Headers $Headers `
    -ContentType 'application/json' `
    -Body $Body

# 排除 ACCOUNT_2 和 ACCOUNT_4
$Body = @{ excludedAccountIndexes = @(2, 4) } | ConvertTo-Json
Invoke-RestMethod `
    -Method Post `
    -Uri "$BaseUrl/start" `
    -Headers $Headers `
    -ContentType 'application/json' `
    -Body $Body

# 优雅停止
Invoke-RestMethod `
    -Method Post `
    -Uri "$BaseUrl/stop" `
    -Headers $Headers `
    -ContentType 'application/json' `
    -Body '{}'
```

要在 Windows 终端中查看原始 SSE 输出，请使用 `curl.exe`，不要使用 PowerShell 的
`curl` 别名：

```powershell
curl.exe -sN `
  -H "Authorization: Bearer $env:API_TOKEN" `
  "http://127.0.0.1:3010/events?replay=50"
```

## HTTP 状态码

|                      状态 | 在此 API 中的含义                                                                  |
| --------------------------: | ------------------------------------------------------------------------------------ |
|                    `200 OK` | 成功读取、更新配置/计划或删除账号会话。                                            |
|              `202 Accepted` | 已接受启动、停止、重启或关闭请求。                                                 |
|            `204 No Content` | CORS 预检成功。                                                                    |
|           `400 Bad Request` | JSON、账号/邮箱选择、参数、计划、请求体大小或路径无效。                            |
|          `401 Unauthorized` | 需要令牌，但令牌缺失或不正确。                                                     |
|             `403 Forbidden` | 配置写入、计划写入或任意环境变量覆盖已禁用。                                       |
|             `404 Not Found` | 端点未知，或配置/会话、捕获目录、产物不存在。                                      |
|              `409 Conflict` | 运行状态冲突，包括运行期间删除会话。                                               |
|  `422 Unprocessable Entity` | 提交的配置未通过验证。                                                             |
| `500 Internal Server Error` | 进程、文件、cron、验证器或请求处理发生意外错误。                                   |

大多数错误采用以下结构：

```json
{
    "error": "Human-readable explanation",
    "code": "OPTIONAL_MACHINE_CODE"
}
```

## 环境变量

所有变量均为可选。

| 变量                       | 默认值                        | 用途                                                                                         |
| -------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------- |
| `API_HOST`                 | `127.0.0.1`                   | 要绑定的接口。仅在需要远程/容器访问时使用 `0.0.0.0`。                                       |
| `API_PORT`                 | `3010`                        | HTTP 监听端口。                                                                               |
| `API_TOKEN`                | 未设置                        | 配置后每个端点都需要的共享令牌。                                                             |
| `API_CORS_ORIGIN`          | `*`                           | 在 `Access-Control-Allow-Origin` 中返回的值。                                                |
| `API_LOG_BUFFER`           | `2000`                        | 内存中保留的结构化日志条目上限。                                                             |
| `API_RUN_HISTORY`          | `20`                          | 内存中保留的已完成运行记录上限。                                                             |
| `API_STOP_TIMEOUT_MS`      | `15000`                       | 强制终止前等待正常停止的时间窗口。                                                           |
| `API_RUN_COMMAND`          | 自动                          | 覆盖用于启动机器人的可执行文件。                                                             |
| `API_RUN_ARGS`             | 无                            | `API_RUN_COMMAND` 的默认参数；接受空格分隔文本或 JSON 数组。                                |
| `API_DIAGNOSTICS_DIR`      | `<repo>/diagnostics`          | 只读诊断目录。                                                                               |
| `API_ALLOW_CONFIG_WRITE`   | `false`                       | 允许 `PUT` 和 `PATCH /config`。                                                             |
| `API_ALLOW_SCHEDULE_WRITE` | `false`                       | 允许 `PUT` 和 `PATCH /schedule`。                                                           |
| `API_ALLOW_ENV_OVERRIDES`  | `false`                       | 允许在 `/start` 和 `/restart` 中使用任意 `env` 字段。                                      |
| `API_ALLOW_CONFIG_REVEAL`  | `false`                       | 允许经过认证的 `GET /config?reveal=1`。                                                    |
| `API_VALIDATOR_MODULE`     | 自动                          | 指向导出 `validateConfig` 或 `ConfigSchema` 的编译模块。                                    |
| `SCHEDULE_FILE`            | `<repo>/config/schedule.json` | 覆盖持久化计划文件路径。                                                                     |
| `CRON_SCHEDULE`            | 未设置                        | 不存在持久化计划覆盖时报告和使用的基础计划。                                                 |
| `TZ`                       | `UTC`                         | cron 使用并由 `/schedule` 返回的时区。                                                      |

Docker 入口点还会使用 `API_MODE=true` 将此 API 作为容器主进程运行。
在该模式下，计划运行和 `RUN_ON_START` 运行都通过 `POST /start` 路由，
因此 API 可以观察和控制这些运行。

等效的 CLI 标志为 `--host`、`--port` 和 `--token`：

```bash
node scripts/api/server.js \
  --host 0.0.0.0 \
  --port 3010 \
  --token "YOUR_API_TOKEN"
```

通过 npm 使用时，请包含 npm 的参数分隔符：

```bash
npm run api -- --host 0.0.0.0 --port 3010 --token "YOUR_API_TOKEN"
```

如果进程环境或已加载的 `.env` 中已经定义了 `API_HOST` 和 `API_TOKEN`，
它们的优先级高于对应的 CLI 参数。`--port` 标志的优先级高于 `API_PORT`；
无效端口值会在启动时被拒绝。


API 通常使用当前 Node 可执行文件启动 `dist/index.js`。如果该文件不存在，
则回退到本地 `ts-node` CLI 和 `src/index.ts`。


显式设置 `API_RUN_COMMAND=npm.cmd` 时，会通过 npm 的 JavaScript CLI 重定向，
以避免 Windows `spawn EINVAL` 问题。其他 `.cmd` 和 `.bat` 覆盖会被拒绝，
因为 API 有意不使用容易引发注入的 shell。

## 安全建议

此服务可以启动和停止进程、读取日志和会话元数据、删除账号会话，并且可能公开或更新配置。

请将其视为管理 API。

- 仅本地应用需要访问时，保持 `API_HOST=127.0.0.1`。
- 绑定到 `0.0.0.0` 或其他非环回地址之前，始终设置 `API_TOKEN`。

- 当流量可能离开本机时，使用 Caddy、nginx 或 Traefik 等反向代理提供 TLS。

- 浏览器直接访问 API 时，将 `API_CORS_ORIGIN` 限制为实际仪表盘来源，
  不要使用 `*`。
- 除非确有需要，否则保持配置写入、计划写入、配置公开和任意环境变量覆盖功能为禁用状态。

- 除浏览器 SSE 确实需要外，避免将 API 令牌放入 URL。
- 不要将端口直接暴露到公网。

令牌会先验证长度相等，再使用恒定时间比较。


## 保持 API 运行

长期使用时，请在进程监管程序下运行。

### 开发终端

```bash
npm run api
```

### PM2

```bash
pm2 start scripts/api/server.js --name mrs-api
pm2 save
```

### systemd

服务命令示例：

```ini
WorkingDirectory=/opt/microsoft-rewards-script
EnvironmentFile=/opt/microsoft-rewards-script/.env
ExecStart=/usr/bin/node /opt/microsoft-rewards-script/scripts/api/server.js
Restart=on-failure
```

### Docker

在 `compose.yaml` 中启用 API 模式、配置认证并发布端口：

```yaml
services:
    microsoft-rewards-script:
        environment:
            API_MODE: 'true'
            API_TOKEN: '${API_TOKEN}'
            API_ALLOW_SCHEDULE_WRITE: 'true' # optional
            API_ALLOW_CONFIG_WRITE: 'true' # optional
        ports:
            - '3010:3010'
```

在 `.env` 中设置匹配的令牌：

```dotenv
API_TOKEN=replace-with-a-long-random-token
```

所提供的 Docker 入口点在 API 模式下默认将 `API_HOST` 设为 `0.0.0.0`，
以便访问已发布端口。在 `PUT` 或 `PATCH /schedule` 创建
`./config/schedule.json` 之前，`CRON_SCHEDULE` 始终是基础计划。由 cron 和
`RUN_ON_START` 触发的运行会调用本地 API，因此与手动运行一样，会显示在
`/status`、`/logs`、`/points`、`/events` 和 `/history` 中。

## 启动就绪状态

HTTP 服务器开始监听后，会向标准输出写入一行机器可读内容：


```text
__API_READY__ {"host":"127.0.0.1","port":3010,"pid":1234,"name":"microsoft-rewards-script","version":"4.1.0","auth":true}
```

启动器可以等待此行，而不必依赖固定的启动延迟。
如果端口已被占用，API 会报错退出，而不是悄悄启动第二个不可用实例。


## 文件布局

| 文件                | 职责                                                                                |
| ------------------- | ------------------------------------------------------------------------------------- |
| `server.js`         | HTTP 路由、认证、CORS、SSE、诊断、配置和计划端点。                                  |
| `processManager.js` | 子进程生命周期、进程树终止、日志缓冲和状态事件。                                    |
| `logParser.js`      | 结构化日志解析和实时运行/积分累计。                                                  |
| `accounts.js`       | 安全账号摘要和仅对子进程生效的账号选择/重映射。                                     |
| `configEditor.js`   | 配置加载、验证、深度合并、备份和原子替换。                                          |
| `scheduleStore.js`  | 计划验证、持久化、读取和实时 crontab 应用。                                          |
| `sessionStore.js`   | 安全读取会话元数据，并按账号删除 SQLite 会话。                                      |
| `apply-schedule.js` | 在 Docker 启动期间恢复持久化的计划覆盖。                                             |
| `trigger.js`        | 将 Docker cron 和 `RUN_ON_START` 运行通过本地 API 路由。                             |
| `runCommand.js`     | 跨平台解析用于启动机器人的命令。                                                     |
| `lib.js`            | 环境变量、项目根目录、日志记录、配置脱敏和参数辅助函数。                             |
