[![Discord](https://img.shields.io/badge/Join%20Our%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/8BxYbV4pkj)
[![Latest Build](https://img.shields.io/github/actions/workflow/status/TheNetsky/Microsoft-Rewards-Script/auto-release.yml?branch=v4&style=for-the-badge&label=Latest%20Build)](https://github.com/TheNetsky/Microsoft-Rewards-Script/actions/workflows/auto-release.yml)
[![Docker](https://img.shields.io/badge/Docker-GHCR-blue?style=for-the-badge&logo=docker)](https://github.com/TheNetsky/Microsoft-Rewards-Script/pkgs/container/microsoft-rewards-script)

> [!TIP]
> This version supports the **new, modern Bing Rewards dashboard only** - it does **not** support the legacy dashboard.
> If your account still uses the old dashboard, use the [v3 branch](https://github.com/TheNetsky/Microsoft-Rewards-Script/tree/v3) and v3.x releases instead!
>
> Use at your own risk - some features may not work as expected.

---

## Table of Contents

- [Table of Contents](#table-of-contents)
- [Quick Setup](#quick-setup)
    - [Bare metal](#bare-metal)
        - [Get the script](#get-the-script)
- [Account Setup](#account-setup)
- [Config Setup](#config-setup)
    - [Build and run the script (bare metal version)](#build-and-run-the-script-bare-metal-version)
- [Docker](#docker)
- [Control API and Dashboard](#control-api-and-dashboard)
- [Nix Setup](#nix-setup)
- [Configuration Options](#configuration-options)
    - [Core](#core)
    - [Workers](#workers)
    - [Activities](#activities)
    - [Search Settings](#search-settings)
        - [Query sources](#query-sources)
    - [Experimental](#experimental)
    - [Logging](#logging)
    - [Proxy](#proxy)
    - [Webhooks](#webhooks)
- [Troubleshooting](#troubleshooting)
    - [Session management](#session-management)
- [Disclaimer](#disclaimer)

---

## Quick Setup

### Bare metal

**Requirements:** Node.js >= 24 and Git  
Works on Windows, Linux, macOS, and WSL.

#### Get the script

```bash
git clone https://github.com/TheNetsky/Microsoft-Rewards-Script.git
cd Microsoft-Rewards-Script
```

Or, download the latest release ZIP and extract it.

## Account Setup

- Copy and rename [`env.example`](env.example) to `.env` and add your account credentials:

```env
ACCOUNT_1_EMAIL=email@example.com
ACCOUNT_1_PASSWORD=your_password
```

> [!NOTE]
> Add one `ACCOUNT_N_*` block per account, numbered from 1 with no gaps - the script stops at the first missing `ACCOUNT_N_EMAIL`. Optional per-account fields cover recovery email, locale (`ACCOUNT_N_GEO_LOCALE` defaults to `auto`, the locale of your Microsoft profile), language, proxy, and fingerprint persistence - see [`env.example`](env.example) for all of them.

> [!TIP]
> For 2FA accounts, set `ACCOUNT_N_TOTP_SECRET` and the script will generate and enter the 6-digit code automatically. To get the secret: in your Microsoft Security settings open 'Manage how you sign in', add an Authenticator app, and when the QR code appears choose 'enter code manually' - use that code as the value in your `.env`.

> [!WARNING]
> You must rebuild your script after making any changes to the `.env`.

## Config Setup

> [!WARNING]
> Do **not** skip this step if you are running the script bare metal.

- **Bare metal:** Copy or rename `config.example.json` to `config.json` (in the project root) and customize your preferences.
- **Docker:** A valid `config.json` is automatically created on first run and saved locally to `./config/`. You can optionally manually create a `config.json` (e.g., if you need to specify regex values) using the provided `config.example.json`

> [!CAUTION]
> Prior versions of accounts.json and config.json are not compatible with current release.

### Build and run the script (bare metal version)

```bash
npm run pre-build
npm run build
npm run start
```

## Docker

- Copy the sample [`compose.yaml`](compose.yaml)
- Copy and rename [`env.example`](env.example) to `.env` and add your account credentials:

```env
ACCOUNT_1_EMAIL=email@example.com
ACCOUNT_1_PASSWORD=your_password
```

- Review `compose.yaml` to adjust scheduling, timezone, and config options.

> [!NOTE]
> A valid `config.json` is auto-generated on first run using default values, and saved locally to `./config/`.
> Optionally, use `CONFIG_*` variables in the `environment:` section of the `compose.yaml` to customise your options (e.g., clusters, webhook, etc.).
> A full list of available options are in the [table below](#configuration-options).
> `CONFIG_*` variables are applied on every startup and always take precedence over `./config/config.json`.

> [!TIP]
> If a new image adds config options you're missing, a warning will appear in the container logs.
> To update, delete `./config/config.json` and restart - a fresh one will be generated from the latest example, with your `compose.yaml` overrides re-applied.

- Start the container: `docker compose up -d`

> [!TIP]
> Monitor logs with `docker logs microsoft-rewards-script`, useful for viewing passwordless login codes or diagnosing issues.
> You can also enable a webhook in `compose.yaml` for notifications.

---

## Control API and Dashboard

The optional Control API lets a local dashboard or another trusted tool monitor
and control the script over HTTP. See the [complete Control API
documentation](scripts/api/README.md) for setup, authentication, every endpoint,
request fields, response examples, and security guidance.

Common uses include:

- checking API health and the current run state with `GET /health` and
  `GET /status`;
- reading live points, logs, errors, account summaries, run history, and error
  diagnostics;
- listing safe stored-session metadata and deleting the mobile/desktop sessions
  for one account;
- starting all accounts with `POST /start` and an empty JSON body;
- running only one account with `POST /start` and `{"accountIndex":2}`;
- running all accounts except selected slots with `POST /start` and
  `{"excludedAccountIndexes":[2,4]}`;
- stopping or restarting a run with `POST /stop` or `POST /restart`;
- streaming live logs and status updates from `GET /events` using
  Server-Sent Events (SSE);
- reading the active configuration and schedule, with config and schedule
  changes available only when their explicit `API_ALLOW_*` options are enabled.

For example, start only `ACCOUNT_2` with cURL:

```bash
curl --request POST \
  --url http://127.0.0.1:3010/start \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"accountIndex":2}'
```

For a ready-made web interface, use the supported and endorsed
[Rewards Dashboard](https://github.com/mgrimace/rewards-dashboard). It connects
to this Control API to manage runs, accounts, schedules, logs, points, and
related script settings.

---

## Nix Setup

If using Nix: `bash scripts/nix/run.sh`

---

## Configuration Options

Edit `config.json` to customize behavior, or set `CONFIG_*` environment variables in `compose.yaml` (Docker). Below are all currently available options.

> [!WARNING]
> Rebuild the script (bare metal), or recreate the container (Docker) after all config changes.

### Core

| Setting                     | Type    | Default      | Description                                                        | Docker environment variable           |
| --------------------------- | ------- | ------------ | ------------------------------------------------------------------ | ------------------------------------- |
| `sessionPath`               | string  | `"sessions"` | Directory to store browser sessions                                |                                       |
| `headless`                  | boolean | `false`      | Run browser invisibly                                              | Always `true` in Docker               |
| `clusters`                  | number  | `1`          | Number of concurrent account clusters                              | `CONFIG_CLUSTERS`                     |
| `errorDiagnostics`          | boolean | `false`      | Save error and unknown-login page diagnostics under `diagnostics/` | `CONFIG_ERROR_DIAGNOSTICS`            |
| `ensureStreakProtection`    | boolean | `true`       | Ensure streak protection is enabled                                | `CONFIG_ENSURE_STREAK_PROTECTION`     |
| `autoClaimPunchcardRewards` | boolean | `false`      | Auto-claim completed punchcard rewards                             | `CONFIG_AUTO_CLAIM_PUNCHCARD_REWARDS` |
| `skipNonPointTasks`         | boolean | `true`       | Skip tasks that award no points                                    | `CONFIG_SKIP_NON_POINT_TASKS`         |
| `searchOnBingLocalQueries`  | boolean | `false`      | Use the local query list for ExploreOnBing                         | `CONFIG_SEARCH_ON_BING_LOCAL`         |
| `globalTimeout`             | string  | `"30sec"`    | Timeout for all actions                                            | `CONFIG_GLOBAL_TIMEOUT`               |

### Workers

| Setting                        | Type    | Default | Description                                                                | Docker environment variable          |
| ------------------------------ | ------- | ------- | -------------------------------------------------------------------------- | ------------------------------------ |
| `workers.doDailySet`           | boolean | `true`  | Complete daily set                                                         | `CONFIG_WORKER_DAILY_SET`            |
| `workers.doClaimBonusPoints`   | boolean | `true`  | Claim bonus points                                                         | `CONFIG_WORKER_CLAIM_BONUS_POINTS`   |
| `workers.doMorePromotions`     | boolean | `true`  | Complete "more activities"                                                 | `CONFIG_WORKER_MORE_PROMOTIONS`      |
| `workers.doPunchCards`         | boolean | `true`  | Complete punchcards                                                        | `CONFIG_WORKER_PUNCH_CARDS`          |
| `workers.doAppPromotions`      | boolean | `true`  | Complete app promotions                                                    | `CONFIG_WORKER_APP_PROMOTIONS`       |
| `workers.doDesktopSearch`      | boolean | `true`  | Perform desktop searches                                                   | `CONFIG_WORKER_DESKTOP_SEARCH`       |
| `workers.doMobileSearch`       | boolean | `true`  | Perform mobile searches                                                    | `CONFIG_WORKER_MOBILE_SEARCH`        |
| `workers.doBonusSearches`      | boolean | `false` | Farm bonus searches beyond the cap                                         | `CONFIG_WORKER_BONUS_SEARCHES`       |
| `workers.doDailyCheckIn`       | boolean | `true`  | Complete daily check-in                                                    | `CONFIG_WORKER_DAILY_CHECKIN`        |
| `workers.doReadToEarn`         | boolean | `true`  | Complete Read-to-Earn                                                      | `CONFIG_WORKER_READ_TO_EARN`         |
| `workers.doActivateSearchPerk` | boolean | `true`  | Activate the "search Nx more" perk when present (runs after the daily set) | `CONFIG_WORKER_ACTIVATE_SEARCH_PERK` |
| `workers.doVisualSearch`       | boolean | `false` | Activate the visual-search streak and perform visual searches              | `CONFIG_WORKER_VISUAL_SEARCH`        |

### Activities

| Setting                   | Type    | Default | Description                    | Docker environment variable      |
| ------------------------- | ------- | ------- | ------------------------------ | -------------------------------- |
| `activities.urlReward`    | boolean | `true`  | Complete URL reward activities | `CONFIG_ACTIVITY_URL_REWARD`     |
| `activities.searchOnBing` | boolean | `true`  | Complete ExploreOnBing offers  | `CONFIG_ACTIVITY_SEARCH_ON_BING` |

### Search Settings

| Setting                                | Type     | Default                             | Description                                               | Docker environment variable        |
| -------------------------------------- | -------- | ----------------------------------- | --------------------------------------------------------- | ---------------------------------- |
| `searchSettings.scrollRandomResults`   | boolean  | `false`                             | Scroll randomly on results                                | `CONFIG_SEARCH_SCROLL_RANDOM`      |
| `searchSettings.clickRandomResults`    | boolean  | `false`                             | Click random links                                        | `CONFIG_SEARCH_CLICK_RANDOM`       |
| `searchSettings.runOnZeroPoints`       | boolean  | `false`                             | Run searches even when no search points remain            | `CONFIG_SEARCH_RUN_ON_ZERO_POINTS` |
| `searchSettings.maxBonusSearches`      | number   | `110`                               | Max bonus searches per run (when `doBonusSearches` is on) | `CONFIG_SEARCH_MAX_BONUS_SEARCHES` |
| `searchSettings.parallelSearching`     | boolean  | `true`                              | Run searches in parallel                                  | `CONFIG_SEARCH_PARALLEL`           |
| `searchSettings.clusterSearch`         | boolean  | `true`                              | Cluster each main topic with Bing suggestions             | `CONFIG_SEARCH_CLUSTER`            |
| `searchSettings.queryEngines`          | string[] | see [Query sources](#query-sources) | Sources used to build the search query pool               | `CONFIG_SEARCH_QUERY_ENGINES` \*   |
| `searchSettings.searchResultVisitTime` | string   | `"10sec"`                           | Time to spend on each search result                       | `CONFIG_SEARCH_VISIT_TIME`         |
| `searchSettings.searchDelay.min`       | string   | `"30sec"`                           | Minimum delay between searches                            | `CONFIG_SEARCH_DELAY_MIN`          |
| `searchSettings.searchDelay.max`       | string   | `"1min"`                            | Maximum delay between searches                            | `CONFIG_SEARCH_DELAY_MAX`          |
| `searchSettings.readDelay.min`         | string   | `"30sec"`                           | Minimum delay for reading                                 | `CONFIG_SEARCH_READ_DELAY_MIN`     |
| `searchSettings.readDelay.max`         | string   | `"1min"`                            | Maximum delay for reading                                 | `CONFIG_SEARCH_READ_DELAY_MAX`     |

> [!NOTE]
> \* Docker `CONFIG_*` array values are comma-separated strings e.g. `"error,warn"`. Regex patterns must be set directly in `config.json`.

#### Query sources

`searchSettings.queryEngines` controls where the main search topics come from. Pick any combination; topics from all selected sources are pooled and de-duplicated. When `searchSettings.clusterSearch` is enabled, each main topic is expanded on demand with Bing suggestions, that topic cluster is shuffled and completed, and only then does searching move to the next main topic.

Core sources:

| Selector     | Source                                           |
| ------------ | ------------------------------------------------ |
| `google`     | Google Trends (trending searches)                |
| `wikipedia`  | Wikipedia most-read articles (previous day)      |
| `wikirandom` | Random Wikipedia articles                        |
| `hackernews` | Hacker News front-page stories                   |
| `reddit`     | Reddit r/popular post titles                     |
| `local`      | Bundled `src/functions/search-queries.json` list |

RSS feeds use a dotted path - `rss` for every feed, `rss.<site>` for a whole site, or `rss.<site>.<endpoint>` for a single feed:

| Selector           | Feeds                                                          |
| ------------------ | -------------------------------------------------------------- |
| `rss.googleTrends` | Google Trends RSS (`gb`, `us`)                                 |
| `rss.googleNews`   | Google News (`gb`, `us`, `world`, `technology`, `business`)    |
| `rss.bbc`          | BBC News (`top`, `world`, `technology`, `business`, `science`) |
| `rss.guardian`     | The Guardian (`international`, `world`, `technology`)          |
| `rss.theVerge`     | The Verge (`all`)                                              |
| `rss.arsTechnica`  | Ars Technica (`all`)                                           |
| `rss.reddit`       | Reddit listing feeds (`popular`, `worldnews`, `technology`)    |

Add your own feeds in `src/constants/rssFeeds.ts`.

Default:

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

### Experimental

Opt-in features that may change. Disabled by default.

| Setting                        | Type    | Default | Description                                                       | Docker environment variable              |
| ------------------------------ | ------- | ------- | ----------------------------------------------------------------- | ---------------------------------------- |
| `experimental.apiSearch`       | boolean | `false` | Perform Bing searches over HTTP instead of driving a browser page | `CONFIG_EXPERIMENTAL_API_SEARCH`         |
| `experimental.apiSearchOnBing` | boolean | `false` | Complete ExploreOnBing offers over HTTP instead of the browser    | `CONFIG_EXPERIMENTAL_API_SEARCH_ON_BING` |

> [!NOTE]
> The API paths are faster but depend on the modern dashboard's endpoints. If an ExploreOnBing offer ever fails to be credited, turn `apiSearchOnBing` off to fall back to the browser path.

### Logging

| Setting                          | Type     | Default                | Description                       | Docker environment variable     |
| -------------------------------- | -------- | ---------------------- | --------------------------------- | ------------------------------- |
| `debugLogs`                      | boolean  | `false`                | Enable debug logging              | `CONFIG_DEBUG_LOGS`             |
| `consoleLogFilter.enabled`       | boolean  | `false`                | Enable console log filtering      | `CONFIG_LOG_FILTER_ENABLED`     |
| `consoleLogFilter.mode`          | string   | `"whitelist"`          | Filter mode (whitelist/blacklist) | `CONFIG_LOG_FILTER_MODE`        |
| `consoleLogFilter.levels`        | string[] | `["error", "warn"]`    | Log levels to filter              | `CONFIG_LOG_FILTER_LEVELS` \*   |
| `consoleLogFilter.keywords`      | string[] | `["starting account"]` | Keywords to filter                | `CONFIG_LOG_FILTER_KEYWORDS` \* |
| `consoleLogFilter.regexPatterns` | string[] | `[]`                   | Regex patterns for filtering      |                                 |

> [!NOTE]
> \* Docker `CONFIG_*` array values are comma-separated strings e.g. `"error,warn"`. Regex patterns must be set directly in `config.json`.

### Proxy

| Setting             | Type    | Default | Description                 | Docker environment variable |
| ------------------- | ------- | ------- | --------------------------- | --------------------------- |
| `proxy.queryEngine` | boolean | `true`  | Proxy query engine requests | `CONFIG_PROXY_QUERY_ENGINE` |

### Webhooks

| Setting                                  | Type     | Default                                              | Description                       | Docker environment variable             |
| ---------------------------------------- | -------- | ---------------------------------------------------- | --------------------------------- | --------------------------------------- |
| `webhook.discord.enabled`                | boolean  | `false`                                              | Enable Discord webhook            | `CONFIG_DISCORD_ENABLED`                |
| `webhook.discord.url`                    | string   | `""`                                                 | Discord webhook URL               | `CONFIG_DISCORD_URL`                    |
| `webhook.telegram.enabled`               | boolean  | `false`                                              | Enable Telegram webhook           | `CONFIG_TELEGRAM_ENABLED`               |
| `webhook.telegram.botToken`              | string   | `""`                                                 | Telegram bot token                | `CONFIG_TELEGRAM_BOTTOKEN`              |
| `webhook.telegram.chatId`                | string   | `""`                                                 | Telegram chat id                  | `CONFIG_TELEGRAM_CHATID`                |
| `webhook.ntfy.enabled`                   | boolean  | `false`                                              | Enable ntfy notifications         | `CONFIG_NTFY_ENABLED`                   |
| `webhook.ntfy.url`                       | string   | `""`                                                 | ntfy server URL                   | `CONFIG_NTFY_URL`                       |
| `webhook.ntfy.topic`                     | string   | `""`                                                 | ntfy topic                        | `CONFIG_NTFY_TOPIC`                     |
| `webhook.ntfy.token`                     | string   | `""`                                                 | ntfy authentication token         | `CONFIG_NTFY_TOKEN`                     |
| `webhook.ntfy.title`                     | string   | `"Microsoft-Rewards-Script"`                         | Notification title                | `CONFIG_NTFY_TITLE`                     |
| `webhook.ntfy.tags`                      | string[] | `["bot", "notify"]`                                  | Notification tags                 | `CONFIG_NTFY_TAGS` \*                   |
| `webhook.ntfy.priority`                  | number   | `3`                                                  | Notification priority (1-5)       | `CONFIG_NTFY_PRIORITY`                  |
| `webhook.webhookLogFilter.enabled`       | boolean  | `false`                                              | Enable webhook log filtering      | `CONFIG_WEBHOOK_LOG_FILTER_ENABLED`     |
| `webhook.webhookLogFilter.mode`          | string   | `"whitelist"`                                        | Filter mode (whitelist/blacklist) | `CONFIG_WEBHOOK_LOG_FILTER_MODE`        |
| `webhook.webhookLogFilter.levels`        | string[] | `["error"]`                                          | Log levels to send                | `CONFIG_WEBHOOK_LOG_FILTER_LEVELS` \*   |
| `webhook.webhookLogFilter.keywords`      | string[] | `["starting account", "select number", "collected"]` | Keywords to filter                | `CONFIG_WEBHOOK_LOG_FILTER_KEYWORDS` \* |
| `webhook.webhookLogFilter.regexPatterns` | string[] | `[]`                                                 | Regex patterns for filtering      |                                         |

> [!NOTE]
> \* Docker `CONFIG_*` array values are comma-separated strings e.g. `"error,warn"`. Regex patterns must be set directly in `config.json`.

> [!WARNING]
> **NTFY** users set the `webhookLogFilter` to `enabled`, or you will receive push notifications for _all_ logs.
> When enabled, only account start, 2FA codes, and account completion summaries are delivered as push notifications.
> Customize which notifications you receive with the `keywords` options.

---

## Troubleshooting

> [!TIP]
> Most login issues can be fixed by deleting your /sessions folder, and redeploying the script

### Session management

The session utility requires an explicit command, so running it without an
argument only displays help and never deletes anything.

```bash
# List stored mobile and desktop sessions
npm run clear-sessions -- list

# Delete the sessions belonging to one account
npm run clear-sessions -- email user@example.com

# Delete every stored session
npm run clear-sessions -- all
```

```bash
# List safe session metadata
curl --request GET \
  --url http://127.0.0.1:3010/sessions \
  --header 'Authorization: Bearer YOUR_API_TOKEN'

# Delete only user@example.com's mobile and desktop sessions
curl --request DELETE \
  --url http://127.0.0.1:3010/sessions/user%40example.com \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

See the [Control API session documentation](scripts/api/README.md#session-management)
for response data, Axios examples, and error behavior.

---

## Disclaimer

Use at your own risk.  
Automation of Microsoft Rewards may lead to account suspension or bans.  
This software is provided for educational purposes only.  
The authors are not responsible for any actions taken by Microsoft.
