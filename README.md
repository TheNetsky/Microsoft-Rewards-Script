[![Discord](https://img.shields.io/badge/Join%20Our%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/8BxYbV4pkj)
[![Latest Build](https://img.shields.io/github/actions/workflow/status/TheNetsky/Microsoft-Rewards-Script/auto-release.yml?branch=v4&style=for-the-badge&label=Latest%20Build)](https://github.com/TheNetsky/Microsoft-Rewards-Script/actions/workflows/auto-release.yml)
[![Docker](https://img.shields.io/badge/Docker-GHCR-blue?style=for-the-badge&logo=docker)](https://github.com/TheNetsky/Microsoft-Rewards-Script/pkgs/container/microsoft-rewards-script)

> [!TIP]
> 本版本仅支持全新的现代化 Bing Rewards 仪表盘，不支持旧版仪表盘。
> 如果你的账号仍在使用旧版仪表盘，请改用 [v3 分支](https://github.com/TheNetsky/Microsoft-Rewards-Script/tree/v3) 及 v3.x 版本！
>
> 使用风险自负 —— 部分功能可能无法如期工作。

---

## 目录

- [目录](#目录)
- [快速搭建](#快速搭建)
    - [裸机部署](#裸机部署)
        - [获取脚本](#获取脚本)
- [账号配置](#账号配置)
- [配置文件设置](#配置文件设置)
    - [构建并运行脚本（裸机版）](#构建并运行脚本裸机版)
- [Docker](#docker)
- [控制 API 与仪表盘](#控制-api-与仪表盘)
- [Nix 搭建](#nix-搭建)
- [配置选项](#配置选项)
    - [核心](#核心)
    - [任务器](#任务器)
    - [活动](#活动)
    - [搜索设置](#搜索设置)
        - [查询来源](#查询来源)
    - [实验性功能](#实验性功能)
    - [日志](#日志)
    - [代理](#代理)
    - [Webhooks](#webhooks)
- [故障排查](#故障排查)
    - [会话管理](#会话管理)
- [免责声明](#免责声明)

---

## 快速搭建

### 裸机部署

**环境要求：** Node.js >= 24 和 Git<br>
支持 Windows、Linux、macOS 和 WSL。

#### 获取脚本

```bash
git clone https://github.com/TheNetsky/Microsoft-Rewards-Script.git
cd Microsoft-Rewards-Script
```

或者，下载最新发布的 ZIP 压缩包并解压。

## 账号配置

- 复制并重命名 [`env.example`](env.example) 为 `.env`，填入你的账号凭据：

```env
ACCOUNT_1_EMAIL=email@example.com
ACCOUNT_1_PASSWORD=your_password
```

> [!NOTE]
> 为每个账号添加一个 `ACCOUNT_N_*` 配置块。账号槽位无需连续：即便前面的槽位缺失，也可以配置 `ACCOUNT_2` 或 `ACCOUNT_4`。账号按槽位升序运行。每个账号可选的字段涵盖恢复邮箱、地区、语言、代理和指纹持久化 —— 完整列表见 [`env.example`](env.example)。

`ACCOUNT_N_LANG_CODE` 接受 BCP 47 语言标签，例如 `nl`、`it` 或 `pt-BR`。`ACCOUNT_N_GEO_LOCALE` 接受两位国家代码，或默认为 `auto`。所选的语言和国家会一致地应用到浏览器指纹、`Accept-Language`、Microsoft Rewards 应用头信息以及市场特定的请求。在 `auto` 模式下，首次成功的仪表盘请求后会缓存 Microsoft 账号资料中报告的国家；修改任一地区设置都会自动替换不兼容的已保存指纹。

> [!TIP]
> 对于启用了 2FA 的账号，设置 `ACCOUNT_N_TOTP_SECRET`，脚本会自动生成并填入 6 位验证码。获取该密钥的方法：在 Microsoft 安全设置中打开“管理登录方式”，添加一个验证器应用，当出现二维码时选择“手动输入代码”—— 将该代码作为 `.env` 中的值。

> [!WARNING]
> 对 `.env` 做任何更改后，你必须重新构建脚本。

## 配置文件设置

> [!WARNING]
> 如果你以裸机方式运行脚本，请**不要**跳过此步骤。

- **裸机部署：** 复制或重命名 `config.example.json` 为 `config.json`（位于项目根目录），并按需自定义。
- **Docker：** 首次运行时会自动创建一份有效的 `config.json` 并保存在本地 `./config/` 目录。你也可以手动创建 `config.json`（例如需要指定正则值），使用随附的 `config.example.json` 即可。

> [!CAUTION]
> 旧版本的 accounts.json 和 config.json 与当前版本不兼容。

### 构建并运行脚本（裸机版）

```bash
npm run pre-build
npm run build
npm run start
```

## Docker

- 复制示例文件 [`compose.yaml`](compose.yaml)
- 复制并重命名 [`env.example`](env.example) 为 `.env`，填入你的账号凭据：

```env
ACCOUNT_1_EMAIL=email@example.com
ACCOUNT_1_PASSWORD=your_password
```

- 查看 `compose.yaml` 以调整计划任务、时区和配置选项。

> [!NOTE]
> 首次运行时会使用默认值自动生成一份有效的 `config.json`，并保存在本地 `./config/` 目录。
> 你也可以在 `compose.yaml` 的 `environment:` 段中使用 `CONFIG_*` 变量自定义选项（例如集群、webhook 等）。
> 可用选项的完整列表见[下方表格](#配置选项)。
> `CONFIG_*` 变量在每次启动时都会应用，且始终优先于 `./config/config.json`。

> [!TIP]
> 若新镜像新增了你缺失的配置选项，容器日志中会出现一条警告。
> 如需更新，删除 `./config/config.json` 并重启 —— 会基于最新示例重新生成一份，并重新应用你 `compose.yaml` 中的覆盖设置。

- 启动容器：`docker compose up -d`

> [!TIP]
> 用 `docker logs microsoft-rewards-script` 查看日志，便于查看无密码登录验证码或排查问题。
> 你也可以在 `compose.yaml` 中启用 webhook 以接收通知。

---

## 控制 API 与仪表盘

可选的控制 API 让本地仪表盘或其他受信任的工具通过 HTTP 监控和控制脚本。完整的文档请见[控制 API 文档](scripts/api/README.md)，涵盖搭建、鉴权、每个端点、请求字段、响应示例和安全指引。

常见用途包括：

- 用 `GET /health` 和 `GET /status` 检查 API 健康状态和当前运行状态；
- 读取实时积分、日志、错误、账号摘要、运行历史和错误诊断；
- 列出已安全存储的会话元数据，并删除某账号的移动端/桌面端会话；
- 用 `POST /start` 和空 JSON 主体启动所有账号；
- 用 `POST /start` 和 `{"accountIndex":2}` 只运行某一个账号；
- 用 `POST /start` 和 `{"excludedAccountIndexes":[2,4]}` 运行除指定槽位外的所有账号；
- 用 `POST /stop` 或 `POST /restart` 停止或重启一次运行；
- 通过 `GET /events` 使用 Server-Sent Events（SSE）流式获取实时日志和状态更新；
- 读取当前配置和计划，仅当显式启用对应的 `API_ALLOW_*` 选项时才支持修改配置和计划。

例如，用 cURL 只启动 `ACCOUNT_2`：

```bash
curl --request POST \
  --url http://127.0.0.1:3010/start \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"accountIndex":2}'
```

开箱即用的网页界面，欢迎使用受支持和推荐的 [Rewards Dashboard](https://github.com/mgrimace/rewards-dashboard)。它连接到本控制 API 来管理运行、账号、计划、日志、积分及相关脚本设置。

---

## Nix 搭建

若使用 Nix：`bash scripts/nix/run.sh`

---

## 配置选项

编辑 `config.json` 自定义行为，或在 `compose.yaml`（Docker）中设置 `CONFIG_*` 环境变量。下方列出当前所有可用选项。

> [!WARNING]
> 所有配置更改后，请重新构建脚本（裸机）或重建容器（Docker）。

### 核心

| 设置                     | 类型    | 默认值      | 说明                                                                 | Docker 环境变量                       |
| ------------------------ | ------- | ----------- | -------------------------------------------------------------------- | ------------------------------------- |
| `sessionPath`             | string  | `"sessions"` | 存储浏览器会话的目录                                                 |                                       |
| `headless`                | boolean | `false`     | 浏览器以不可见方式运行                                               | Docker 中始终为 `true`                 |
| `clusters`                | number  | `1`         | 并发账号集群数量                                                     | `CONFIG_CLUSTERS`                     |
| `errorDiagnostics`        | boolean | `false`     | 将错误和未知登录页诊断保存到 `diagnostics/` 下                       | `CONFIG_ERROR_DIAGNOSTICS`            |
| `ensureStreakProtection`  | boolean | `true`      | 确保启用连胜保护                                                     | `CONFIG_ENSURE_STREAK_PROTECTION`     |
| `autoClaimPunchcardRewards` | boolean | `false`   | 自动领取已完成的打卡奖励                                             | `CONFIG_AUTO_CLAIM_PUNCHCARD_REWARDS` |
| `skipNonPointTasks`       | boolean | `true`      | 跳过不奖励积分的任务                                                 | `CONFIG_SKIP_NON_POINT_TASKS`         |
| `accountDelay.min`        | string  | `"1min"`    | 启动下一个已配置账号前的最小延迟                                     | `CONFIG_ACCOUNT_DELAY_MIN`            |
| `accountDelay.max`        | string  | `"3min"`    | 启动下一个已配置账号前的最大延迟                                     | `CONFIG_ACCOUNT_DELAY_MAX`            |
| `searchOnBingLocalQueries` | boolean | `false`    | 对 ExploreOnBing 使用本地查询列表                                     | `CONFIG_SEARCH_ON_BING_LOCAL`         |
| `globalTimeout`           | string  | `"30sec"`   | 所有操作的超时时间                                                   | `CONFIG_GLOBAL_TIMEOUT`               |

### 任务器

| 设置                            | 类型    | 默认值 | 说明                                                                   | Docker 环境变量                      |
| -------------------------------- | ------- | ------ | ---------------------------------------------------------------------- | ------------------------------------- |
| `workers.doDailySet`            | boolean | `true`  | 完成每日任务集                                                         | `CONFIG_WORKER_DAILY_SET`            |
| `workers.doClaimBonusPoints`    | boolean | `true`  | 领取奖励积分                                                           | `CONFIG_WORKER_CLAIM_BONUS_POINTS`   |
| `workers.doMorePromotions`      | boolean | `true`  | 完成“更多活动”                                                         | `CONFIG_WORKER_MORE_PROMOTIONS`      |
| `workers.doPunchCards`          | boolean | `true`  | 完成打卡活动                                                           | `CONFIG_WORKER_PUNCH_CARDS`          |
| `workers.doAppPromotions`       | boolean | `true`  | 完成应用推广活动                                                       | `CONFIG_WORKER_APP_PROMOTIONS`       |
| `workers.doDesktopSearch`       | boolean | `true`  | 执行桌面端搜索                                                         | `CONFIG_WORKER_DESKTOP_SEARCH`       |
| `workers.doMobileSearch`        | boolean | `true`  | 执行移动端搜索                                                         | `CONFIG_WORKER_MOBILE_SEARCH`        |
| `workers.doBonusSearches`       | boolean | `false` | 额外刷取超出上限的奖励搜索                                             | `CONFIG_WORKER_BONUS_SEARCHES`       |
| `workers.doDailyCheckIn`        | boolean | `true`  | 完成每日签到                                                           | `CONFIG_WORKER_DAILY_CHECKIN`        |
| `workers.doReadToEarn`          | boolean | `true`  | 完成“阅读赚积分”                                                       | `CONFIG_WORKER_READ_TO_EARN`         |
| `workers.doActivateSearchPerk`  | boolean | `true`  | 当存在时激活“再搜索 Nx 次”特权（在每日任务集之后运行）                 | `CONFIG_WORKER_ACTIVATE_SEARCH_PERK` |
| `workers.doVisualSearch`        | boolean | `false` | 激活以图搜图连胜并执行以图搜图                                         | `CONFIG_WORKER_VISUAL_SEARCH`        |

### 活动

| 设置                     | 类型    | 默认值  | 说明                       | Docker 环境变量                  |
| ------------------------ | ------- | ------- | -------------------------- | -------------------------------- |
| `activities.urlReward`    | boolean | `true`  | 完成 URL 奖励活动          | `CONFIG_ACTIVITY_URL_REWARD`     |
| `activities.searchOnBing` | boolean | `true`  | 完成 ExploreOnBing 优惠    | `CONFIG_ACTIVITY_SEARCH_ON_BING` |

### 搜索设置

| 设置                                    | 类型     | 默认值                              | 说明                                               | Docker 环境变量                    |
| --------------------------------------- | -------- | ----------------------------------- | -------------------------------------------------- | ---------------------------------- |
| `searchSettings.scrollRandomResults`   | boolean  | `false`                             | 在结果页随机滚动                                    | `CONFIG_SEARCH_SCROLL_RANDOM`      |
| `searchSettings.clickRandomResults`    | boolean  | `false`                             | 随机点击链接                                        | `CONFIG_SEARCH_CLICK_RANDOM`       |
| `searchSettings.runOnZeroPoints`       | boolean  | `false`                            | 即使没有剩余搜索积分也执行搜索                       | `CONFIG_SEARCH_RUN_ON_ZERO_POINTS` |
| `searchSettings.maxBonusSearches`       | number   | `110`                               | 每次运行的最大奖励搜索数（开启 `doBonusSearches` 时） | `CONFIG_SEARCH_MAX_BONUS_SEARCHES` |
| `searchSettings.parallelSearching`     | boolean  | `true`                             | 并行执行搜索                                        | `CONFIG_SEARCH_PARALLEL`           |
| `searchSettings.clusterSearch`         | boolean  | `true`                              | 用 Bing 建议为每个主题聚簇                          | `CONFIG_SEARCH_CLUSTER`            |
| `searchSettings.queryEngines`          | string[] | 见[查询来源](#查询来源)             | 用于构建搜索查询池的来源                            | `CONFIG_SEARCH_QUERY_ENGINES` \*   |
| `searchSettings.searchResultVisitTime` | string   | `"10sec"`                           | 在每个搜索结果上停留的时间                          | `CONFIG_SEARCH_VISIT_TIME`         |
| `searchSettings.searchDelay.min`       | string   | `"30sec"`                           | 搜索之间的最小延迟                                  | `CONFIG_SEARCH_DELAY_MIN`          |
| `searchSettings.searchDelay.max`       | string   | `"1min"`                            | 搜索之间的最大延迟                                  | `CONFIG_SEARCH_DELAY_MAX`          |
| `searchSettings.readDelay.min`         | string   | `"30sec"`                           | 阅读的最小延迟                                      | `CONFIG_SEARCH_READ_DELAY_MIN`     |
| `searchSettings.readDelay.max`         | string   | `"1min"`                            | 阅读的最大延迟                                      | `CONFIG_SEARCH_READ_DELAY_MAX`     |

> [!NOTE]
> \* Docker 的 `CONFIG_*` 数组值为逗号分隔字符串，例如 `"error,warn"`。正则模式必须直接在 `config.json` 中设置。

#### 查询来源

`searchSettings.queryEngines` 控制主要搜索主题的来源。可任意组合；所有所选来源的主题会被合并并去重。当启用 `searchSettings.clusterSearch` 时，每个主题会按需用 Bing 建议扩展，将该主题聚簇打乱并完成后，才会进入下一个主题。

核心来源：

| 选择器       | 来源                                             |
| ------------ | ------------------------------------------------ |
| `google`     | Google Trends（热门搜索）                         |
| `wikipedia`  | 维基百科阅读量最高的条目（前一天）                 |
| `wikirandom` | 随机维基百科条目                                  |
| `hackernews` | Hacker News 首页文章                              |
| `reddit`     | Reddit r/popular 帖子标题                          |
| `local`      | 内置的 `src/functions/search-queries.json` 列表      |

RSS 源使用点分路径 —— `rss` 表示所有源，`rss.<站点>` 表示某站点全部源，`rss.<站点>.<端点>` 表示单个源：

| 选择器            | 源                                                              |
| ------------------ | --------------------------------------------------------------- |
| `rss.googleTrends` | Google Trends RSS（`gb`、`us`）                                 |
| `rss.googleNews`   | Google News（`gb`、`us`、`world`、`technology`、`business`）     |
| `rss.bbc`          | BBC News（`top`、`world`、`technology`、`business`、`science`）  |
| `rss.guardian`     | The Guardian（`international`、`world`、`technology`）           |
| `rss.theVerge`     | The Verge（`all`）                                              |
| `rss.arsTechnica`  | Ars Technica（`all`）                                           |
| `rss.reddit`       | Reddit 列表源（`popular`、`worldnews`、`technology`）             |

可在 `src/constants/rssFeeds.ts` 中添加你自己的源。

默认值：

```json
[
    "google",
    "wikipedia",
    "wikirandom",
    "hackernews",
    "reddit",
    "local",
    "rss.googleTrends",
    "rss.googleNews",
    "rss.bbc",
    "rss.guardian.world",
    "rss.theVerge.all"
]
```

### 实验性功能

可能变更的可选功能。默认关闭。

| 设置                            | 类型    | 默认值  | 说明                                                   | Docker 环境变量                          |
| ------------------------------- | ------- | ------- | ------------------------------------------------------ | ---------------------------------------- |
| `experimental.apiSearch`        | boolean | `false` | 通过 HTTP 执行 Bing 搜索，而非驱动浏览器页面            | `CONFIG_EXPERIMENTAL_API_SEARCH`         |
| `experimental.apiSearchOnBing`  | boolean | `false` | 通过 HTTP 完成 ExploreOnBing 优惠，而非使用浏览器        | `CONFIG_EXPERIMENTAL_API_SEARCH_ON_BING` |

> [!NOTE]
> API 路径更快，但依赖现代化仪表盘的端点。如果某次 ExploreOnBing 优惠未能成功积分，请关闭 `apiSearchOnBing` 以回退到浏览器路径。

无论实验性搜索设置如何，常规 Rewards 操作都使用引导阶段捕获的 cookie 和操作数据，且不刷新可见页面。在浏览器支撑的搜索开始前，浏览器保持空闲。失败或未确认的 URL 奖励请求会触发一次上下文刷新和一次重试；成功的请求使用服务端操作返回的余额。

### 日志

| 设置                              | 类型     | 默认值               | 说明                       | Docker 环境变量                  |
| ---------------------------------- | -------- | -------------------- | -------------------------- | -------------------------------- |
| `debugLogs`                       | boolean  | `false`             | 启用调试日志               | `CONFIG_DEBUG_LOGS`             |
| `consoleLogFilter.enabled`        | boolean  | `false`             | 启用控制台日志过滤         | `CONFIG_LOG_FILTER_ENABLED`     |
| `consoleLogFilter.mode`           | string   | `"whitelist"`        | 过滤模式（白名单/黑名单）  | `CONFIG_LOG_FILTER_MODE`        |
| `consoleLogFilter.levels`         | string[] | `["error", "warn"]` | 要过滤的日志级别           | `CONFIG_LOG_FILTER_LEVELS` \*   |
| `consoleLogFilter.keywords`       | string[] | `["starting account"]` | 要过滤的关键词           | `CONFIG_LOG_FILTER_KEYWORDS` \* |
| `consoleLogFilter.regexPatterns`  | string[] | `[]`                | 用于过滤的正则模式         |                                  |

> [!NOTE]
> \* Docker 的 `CONFIG_*` 数组值为逗号分隔字符串，例如 `"error,warn"`。正则模式必须直接在 `config.json` 中设置。

### 代理

| 设置              | 类型    | 默认值 | 说明                 | Docker 环境变量 |
| ------------------ | ------- | ------ | -------------------- | --------------- |
| `proxy.queryEngine` | boolean | `true`  | 代理查询引擎请求 | `CONFIG_PROXY_QUERY_ENGINE` |

### Webhooks

| 设置                                  | 类型     | 默认值                                              | 说明                       | Docker 环境变量             |
| ---------------------------------------- | -------- | ---------------------------------------------------- | --------------------------------- | --------------------------------------- |
| `webhook.discord.enabled`                | boolean  | `false`                                              | 启用 Discord webhook            | `CONFIG_DISCORD_ENABLED`                |
| `webhook.discord.url`                    | string   | `""`                                                 | Discord webhook URL               | `CONFIG_DISCORD_URL`                    |
| `webhook.telegram.enabled`               | boolean  | `false`                                              | 启用 Telegram webhook           | `CONFIG_TELEGRAM_ENABLED`               |
| `webhook.telegram.botToken`              | string   | `""`                                                 | Telegram 机器人令牌                | `CONFIG_TELEGRAM_BOTTOKEN`              |
| `webhook.telegram.chatId`                | string   | `""`                                                 | Telegram 聊天 ID                  | `CONFIG_TELEGRAM_CHATID`                |
| `webhook.ntfy.enabled`                   | boolean  | `false`                                              | 启用 ntfy 通知         | `CONFIG_NTFY_ENABLED`                   |
| `webhook.ntfy.url`                       | string   | `""`                                                 | ntfy 服务器 URL                   | `CONFIG_NTFY_URL`                       |
| `webhook.ntfy.topic`                     | string   | `""`                                                 | ntfy 主题                        | `CONFIG_NTFY_TOPIC`                     |
| `webhook.ntfy.token`                     | string   | `""`                                                 | ntfy 认证令牌         | `CONFIG_NTFY_TOKEN`                     |
| `webhook.ntfy.title`                     | string   | `"Microsoft-Rewards-Script"`                         | 通知标题                | `CONFIG_NTFY_TITLE`                     |
| `webhook.ntfy.tags`                      | string[] | `["bot", "notify"]`                                  | 通知标签                 | `CONFIG_NTFY_TAGS` \*                   |
| `webhook.ntfy.priority`                  | number   | `3`                                                  | 通知优先级 (1-5)       | `CONFIG_NTFY_PRIORITY`                  |
| `webhook.webhookLogFilter.enabled`       | boolean  | `false`                                              | 启用 webhook 日志过滤      | `CONFIG_WEBHOOK_LOG_FILTER_ENABLED`     |
| `webhook.webhookLogFilter.mode`          | string   | `"whitelist"`                                        | 过滤模式 (白名单/黑名单) | `CONFIG_WEBHOOK_LOG_FILTER_MODE`        |
| `webhook.webhookLogFilter.levels`        | string[] | `["error"]`                                          | 要发送的日志级别                | `CONFIG_WEBHOOK_LOG_FILTER_LEVELS` \*   |
| `webhook.webhookLogFilter.keywords`      | string[] | `["starting account", "select number", "collected"]` | 要过滤的关键词                | `CONFIG_WEBHOOK_LOG_FILTER_KEYWORDS` \* |
| `webhook.webhookLogFilter.regexPatterns` | string[] | `[]`                                                 | 用于过滤的正则模式      |                                         |

> [!NOTE]
> \* Docker 的 `CONFIG_*` 数组值为逗号分隔字符串，例如 `"error,warn"`。正则模式必须直接在 `config.json` 中设置。

> [!WARNING]
> **NTFY** 用户请将 `webhookLogFilter` 设为 `enabled`，否则你将收到_所有_日志的推送通知。
> 启用后，只有账号启动、2FA 验证码和账号完成摘要会作为推送通知发送。
> 用 `keywords` 选项自定义你接收的通知。

---

## 故障排查

> [!TIP]
> 大多数登录问题都可以通过删除 /sessions 文件夹并重新部署脚本来解决。

### 会话管理

会话工具需要显式命令，因此不带参数运行时只会显示帮助信息，不会删除任何内容。

```bash
# 列出已存储的移动端和桌面端会话
npm run clear-sessions -- list

# 删除属于某个账号的会话
npm run clear-sessions -- email user@example.com

# 删除所有已存储的会话
npm run clear-sessions -- all
```

```bash
# 列出安全的会话元数据
curl --request GET \
  --url http://127.0.0.1:3010/sessions \
  --header 'Authorization: Bearer YOUR_API_TOKEN'

# 仅删除 user@example.com 的移动端和桌面端会话
curl --request DELETE \
  --url http://127.0.0.1:3010/sessions/user%40example.com \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

关于响应数据、Axios 示例和错误行为，请见[控制 API 会话文档](scripts/api/README.md#会话管理)。

---

## 免责声明

使用风险自负。<br>
自动化 Microsoft Rewards 可能导致账号被封或停用。<br>
本软件仅供学习用途。<br>
作者不对 Microsoft 采取的任何行动负责。
