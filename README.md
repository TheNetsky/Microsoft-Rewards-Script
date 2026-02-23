[![Discord](https://img.shields.io/badge/Join%20Our%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/8BxYbV4pkj)
[![Latest Build](https://img.shields.io/github/actions/workflow/status/TheNetsky/Microsoft-Rewards-Script/auto-release.yml?branch=v3&style=for-the-badge&label=Latest%20Build)](https://github.com/TheNetsky/Microsoft-Rewards-Script/actions/workflows/auto-release.yml)
[![Docker](https://img.shields.io/badge/Docker-GHCR-blue?style=for-the-badge&logo=docker)](https://github.com/TheNetsky/Microsoft-Rewards-Script/pkgs/container/microsoft-rewards-script)

> [!CAUTION]
> V3.x does not support the new Bing Rewards interface!
>
> Use at your own risk — some features may not work as expected.

---

## Table of Contents

- [Quick Setup](#quick-setup)
- [Nix Setup](#nix-setup)
- [Configuration Options](#configuration-options)
- [Account Setup](#account-setup)
- [Troubleshooting](#troubleshooting)
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

#### Create an account.json and config.json

Copy, rename, and edit your account and configuration files before deploying the script.

- Copy or rename `src/accounts.example.json` to `src/accounts.json` and add your credentials
- Copy or rename `src/config.example.json` to `src/config.json` and customize your preferences.

> [!CAUTION]
> Do not skip this step.
> Prior versions of accounts.json and config.json are not compatible with current release.

> [!WARNING]
> You must rebuild your script after making any changes to accounts.json and config.json.

#### Build and run the script (bare metal version)

```bash
npm run pre-build
npm run build
npm run start
```

### Docker
- Copy the sample [`compose.yaml`](compose.yaml)
- Copy and rename [`env.example`](env.example) to `.env` and add your account credentials:
```env
ACCOUNT_1_EMAIL=you@example.com
ACCOUNT_1_PASSWORD=your_password
```
> [!NOTE]
> A valid `accounts.json` is automatically created based on these values, and saved locally to `./config/`

- Review `compose.yaml` to adjust scheduling, timezone, and config options. 

> [!NOTE]
> A valid `config.json` is auto-generated on first run using default values, and saved locally to `./config/`. 
> Optionally, use `CONFIG_*` variables in the `environment:` section of the `compose.yaml` to customise your options (e.g., clusters, webhook). 
> Commonly changed values are included in the sample `compose.yaml`, and a full list of configuration options are in [the table below](#configuration-options). 
> Custom config values set in the `compose.yaml` are applied on every startup and always take precedence over `./config/config.json`.

> [!TIP]
> If a new image adds config options you're missing, a warning will appear in the container logs.
> To update, delete `./config/config.json` and restart, a fresh one will be generated from the latest example, with your `compose.yaml` overrides re-applied.

- Start the container: `docker compose up -d`

> [!TIP]
> Monitor logs with `docker logs microsoft-rewards-script`, useful for viewing passwordless login codes or diagnosing issues. 
> You can also enable a webhook in `compose.yaml` for notifications.
---

## Nix Setup

If using Nix: `bash scripts/nix/run.sh`

---

## Configuration Options

Edit `config.json` to customize behavior, or set `CONFIG_*` environment variables in `compose.yaml` (Docker). Below are all currently available options.

> [!WARNING]
> Rebuild the script (bare metal), or recreate the container (Docker) after all config changes.

### Core

| Setting                    | Type    | Default                      | Description                           | Docker environment variable   |
| -------------------------- | ------- | ---------------------------- | ------------------------------------- | ----------------------------- |
| `baseURL`                  | string  | `"https://rewards.bing.com"` | Microsoft Rewards base URL            |                               |
| `sessionPath`              | string  | `"sessions"`                 | Directory to store browser sessions   |                               |
| `headless`                 | boolean | `false`                      | Run browser invisibly                 | Always `true` in Docker       |
| `clusters`                 | number  | `1`                          | Number of concurrent account clusters | `CONFIG_CLUSTERS`             |
| `errorDiagnostics`         | boolean | `false`                      | Enable error diagnostics              | `CONFIG_ERROR_DIAGNOSTICS`    |
| `searchOnBingLocalQueries` | boolean | `false`                      | Use local query list                  | `CONFIG_SEARCH_ON_BING_LOCAL` |
| `globalTimeout`            | string  | `"30sec"`                    | Timeout for all actions               | `CONFIG_GLOBAL_TIMEOUT`       |

### Workers

| Setting                       | Type    | Default | Description                 | Docker environment variable          |
| ----------------------------- | ------- | ------- | --------------------------- | ------------------------------------ |
| `workers.doDailySet`          | boolean | `true`  | Complete daily set          | `CONFIG_WORKER_DAILY_SET`            |
| `workers.doSpecialPromotions` | boolean | `true`  | Complete special promotions | `CONFIG_WORKER_SPECIAL_PROMOTIONS`   |
| `workers.doMorePromotions`    | boolean | `true`  | Complete more promotions    | `CONFIG_WORKER_MORE_PROMOTIONS`      |
| `workers.doPunchCards`        | boolean | `true`  | Complete punchcards         | `CONFIG_WORKER_PUNCH_CARDS`          |
| `workers.doAppPromotions`     | boolean | `true`  | Complete app promotions     | `CONFIG_WORKER_APP_PROMOTIONS`       |
| `workers.doDesktopSearch`     | boolean | `true`  | Perform desktop searches    | `CONFIG_WORKER_DESKTOP_SEARCH`       |
| `workers.doMobileSearch`      | boolean | `true`  | Perform mobile searches     | `CONFIG_WORKER_MOBILE_SEARCH`        |
| `workers.doDailyCheckIn`      | boolean | `true`  | Complete daily check-in     | `CONFIG_WORKER_DAILY_CHECKIN`        |
| `workers.doReadToEarn`        | boolean | `true`  | Complete Read-to-Earn       | `CONFIG_WORKER_READ_TO_EARN`         |

### Search Settings

| Setting                                | Type     | Default                                      | Description                         | Docker environment variable     |
| -------------------------------------- | -------- | -------------------------------------------- | ----------------------------------- | ------------------------------- |
| `searchSettings.scrollRandomResults`   | boolean  | `false`                                      | Scroll randomly on results          | `CONFIG_SEARCH_SCROLL_RANDOM`   |
| `searchSettings.clickRandomResults`    | boolean  | `false`                                      | Click random links                  | `CONFIG_SEARCH_CLICK_RANDOM`    |
| `searchSettings.parallelSearching`     | boolean  | `true`                                       | Run searches in parallel            | `CONFIG_SEARCH_PARALLEL`        |
| `searchSettings.queryEngines`          | string[] | `["google", "wikipedia", "reddit", "local"]` | Query engines to use                |                                 |
| `searchSettings.searchResultVisitTime` | string   | `"10sec"`                                    | Time to spend on each search result | `CONFIG_SEARCH_VISIT_TIME`      |
| `searchSettings.searchDelay.min`       | string   | `"30sec"`                                    | Minimum delay between searches      | `CONFIG_SEARCH_DELAY_MIN`       |
| `searchSettings.searchDelay.max`       | string   | `"1min"`                                     | Maximum delay between searches      | `CONFIG_SEARCH_DELAY_MAX`       |
| `searchSettings.readDelay.min`         | string   | `"30sec"`                                    | Minimum delay for reading           | `CONFIG_SEARCH_READ_DELAY_MIN`  |
| `searchSettings.readDelay.max`         | string   | `"1min"`                                     | Maximum delay for reading           | `CONFIG_SEARCH_READ_DELAY_MAX`  |

### Logging

| Setting                          | Type     | Default                | Description                       | Docker environment variable   |
| -------------------------------- | -------- | ---------------------- | --------------------------------- | ----------------------------- |
| `debugLogs`                      | boolean  | `false`                | Enable debug logging              | `CONFIG_DEBUG_LOGS`           |
| `consoleLogFilter.enabled`       | boolean  | `false`                | Enable console log filtering      | `CONFIG_LOG_FILTER_ENABLED`   |
| `consoleLogFilter.mode`          | string   | `"whitelist"`          | Filter mode (whitelist/blacklist) | `CONFIG_LOG_FILTER_MODE`      |
| `consoleLogFilter.levels`        | string[] | `["error", "warn"]`    | Log levels to filter              | `CONFIG_LOG_FILTER_LEVELS`\*  |
| `consoleLogFilter.keywords`      | string[] | `["starting account"]` | Keywords to filter                | `CONFIG_LOG_FILTER_KEYWORDS`\*|
| `consoleLogFilter.regexPatterns` | string[] | `[]`                   | Regex patterns for filtering      |                               |

> [!NOTE]
> \* Docker `CONFIG_*` array values are comma-separated strings e.g. `"error,warn"`
> Regex pattenrs must be entered directly in the `config.yaml`

### Proxy

| Setting             | Type    | Default | Description                 | Docker environment variable|
| ------------------- | ------- | ------- | --------------------------- | -------------------------- |
| `proxy.queryEngine` | boolean | `true`  | Proxy query engine requests | `CONFIG_PROXY_QUERY_ENGINE` |

### Webhooks

| Setting                                  | Type     | Default                                              | Description                       | Docker environment variable              |
| ---------------------------------------- | -------- | ---------------------------------------------------- | --------------------------------- | ---------------------------------------- |
| `webhook.discord.enabled`                | boolean  | `false`                                              | Enable Discord webhook            | `CONFIG_DISCORD_ENABLED`                 |
| `webhook.discord.url`                    | string   | `""`                                                 | Discord webhook URL               | `CONFIG_DISCORD_URL`                     |
| `webhook.ntfy.enabled`                   | boolean  | `false`                                              | Enable ntfy notifications         | `CONFIG_NTFY_ENABLED`                    |
| `webhook.ntfy.url`                       | string   | `""`                                                 | ntfy server URL                   | `CONFIG_NTFY_URL`                        |
| `webhook.ntfy.topic`                     | string   | `""`                                                 | ntfy topic                        | `CONFIG_NTFY_TOPIC`                      |
| `webhook.ntfy.token`                     | string   | `""`                                                 | ntfy authentication token         | `CONFIG_NTFY_TOKEN`                      |
| `webhook.ntfy.title`                     | string   | `"Microsoft-Rewards-Script"`                         | Notification title                | `CONFIG_NTFY_TITLE`                      |
| `webhook.ntfy.tags`                      | string[] | `["bot", "notify"]`                                  | Notification tags                 | `CONFIG_NTFY_TAGS` \*                    |
| `webhook.ntfy.priority`                  | number   | `3`                                                  | Notification priority (1-5)       | `CONFIG_NTFY_PRIORITY`                   |
| `webhook.webhookLogFilter.enabled`       | boolean  | `false`                                              | Enable webhook log filtering      | `CONFIG_WEBHOOK_LOG_FILTER_ENABLED`      |
| `webhook.webhookLogFilter.mode`          | string   | `"whitelist"`                                        | Filter mode (whitelist/blacklist) | `CONFIG_WEBHOOK_LOG_FILTER_MODE`         |
| `webhook.webhookLogFilter.levels`        | string[] | `["error"]`                                          | Log levels to send                | `CONFIG_WEBHOOK_LOG_FILTER_LEVELS` \*    |
| `webhook.webhookLogFilter.keywords`      | string[] | `["starting account", "select number", "collected"]` | Keywords to filter                | `CONFIG_WEBHOOK_LOG_FILTER_KEYWORDS` \*  |
| `webhook.webhookLogFilter.regexPatterns` | string[] | `[]`                                                 | Regex patterns for filtering      |                                          |

> [!NOTE]
> \* Docker `CONFIG_*` array values are comma-separated strings e.g. `"error,warn"`
> Regex pattenrs must be entered directly in the `config.yaml`

> [!WARNING]
> **NTFY** users set the `webhookLogFilter` to `enabled`, or you will receive push notifications for _all_ logs.
> When enabled, only account start, 2FA codes, and account completion summaries are delivered as push notifications.
> Customize which notifications you receive with the `keywords` options.

---

## Account Setup

Edit `src/accounts.json`.

> [!TIP]
> Docker users can set account details directly in the `compose.yaml`, using a `.env` is recommended for sensitive information.
> Docker will automatically create a valid `accounts.json` on container creation, and save the file in `./config/`

> [!WARNING]
> The file is a **flat array** of accounts, not `{ "accounts": [ ... ] }`.
> Rebuild the script after all changes.

```json
[
    {
        "email": "email_1",
        "password": "password_1",
        "totpSecret": "",
        "recoveryEmail": "",
        "geoLocale": "auto",
        "langCode": "en",
        "proxy": {
            "proxyAxios": false,
            "url": "",
            "port": 0,
            "username": "",
            "password": ""
        },
        "saveFingerprint": {
            "mobile": false,
            "desktop": false
        }
    },
    {
        "email": "email_2",
        "password": "password_2",
        "totpSecret": "",
        "recoveryEmail": "",
        "geoLocale": "auto",
        "langCode": "en",
        "proxy": {
            "proxyAxios": false,
            "url": "",
            "port": 0,
            "username": "",
            "password": ""
        },
        "saveFingerprint": {
            "mobile": false,
            "desktop": false
        }
    }
]
```

> [!NOTE]
> `geoLocale` uses the default locale of your Microsoft profile. You can overwrite it here with a custom locale.

> [!TIP]
> When using 2FA login, adding your `totpSecret` will enable the script to automatically generate and enter the timed 6 digit code to login. To get your `totpSecret` in your Microsoft Security settings, click 'Manage how you sign in'. Add Authenticator app, when shown the QR code, select 'enter code manually'. Use this code in the `accounts.json`.

---

## Troubleshooting

> [!TIP]
> Most login issues can be fixed by deleting your /sessions folder, and redeploying the script

---

## Disclaimer

Use at your own risk.  
Automation of Microsoft Rewards may lead to account suspension or bans.  
This software is provided for educational purposes only.  
The authors are not responsible for any actions taken by Microsoft.
