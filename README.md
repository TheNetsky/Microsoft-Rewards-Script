[![Discord](https://img.shields.io/badge/Join%20Our%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/8BxYbV4pkj)

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

**Requirements:** Node.js >= 24 and Git  
Works on Windows, Linux, macOS, and WSL.

### Get the script

```bash
git clone https://github.com/TheNetsky/Microsoft-Rewards-Script.git
cd Microsoft-Rewards-Script
```

Or, download the latest release ZIP and extract it.

### Create an account.json and config.json

Copy, rename, and edit your account and configuration files before deploying the script.

- Copy or rename `src/accounts.example.json` to `src/accounts.json` and add your credentials
- Copy or rename `src/config.example.json` to `src/config.json` and customize your preferences.

> [!CAUTION]
> Do not skip this step.
> Prior versions of accounts.json and config.json are not compatible with current release.

> [!WARNING]
> You must rebuild your script after making any changes to accounts.json and config.json.

### Build and run the script (bare metal version)

```bash
npm run pre-build
npm run build
npm run start
```

### Build and run the script (docker version)

```bash
docker compose up -d
```

> [!CAUTION]
> Set `headless` to `true` in the `src/config.json` when using Docker.
> Additional docker-specific scheduling options are in the `compose.yaml`

> [!TIP]
> When headeless, monitor logs with `docker logs microsoft-rewards-script` (for example, to view passwordless codes), or enable a webhook service in the `src/config.json`.

---

## Nix Setup

If using Nix: `bash scripts/nix/run.sh`

---

## Configuration Reference

Edit `src/config.json` to customize behavior. Below are all currently available options.

> [!WARNING]
> Rebuild the script after all changes.

### Core

| Setting                    | Type    | Default                      | Description                           |
| -------------------------- | ------- | ---------------------------- | ------------------------------------- |
| `baseURL`                  | string  | `"https://rewards.bing.com"` | Microsoft Rewards base URL            |
| `sessionPath`              | string  | `"sessions"`                 | Directory to store browser sessions   |
| `headless`                 | boolean | `false`                      | Run browser invisibly                 |
| `runOnZeroPoints`          | boolean | `false`                      | Run even when no points are available |
| `clusters`                 | number / string  | `1`                          | Number of concurrent account clusters |
| `errorDiagnostics`         | boolean | `false`                      | Enable error diagnostics              |
| `searchOnBingLocalQueries` | boolean | `false`                      | Use local query list                  |
| `globalTimeout`            | string  | `"30sec"`                    | Timeout for all actions               |

> [!CAUTION]
> Set `headless` to `true` when using docker

### Workers

| Setting                       | Type    | Default | Description                 |
| ----------------------------- | ------- | ------- | --------------------------- |
| `workers.doDailySet`          | boolean | `true`  | Complete daily set          |
| `workers.doSpecialPromotions` | boolean | `true`  | Complete special promotions |
| `workers.doMorePromotions`    | boolean | `true`  | Complete more promotions    |
| `workers.doPunchCards`        | boolean | `true`  | Complete punchcards         |
| `workers.doAppPromotions`     | boolean | `true`  | Complete app promotions     |
| `workers.doDesktopSearch`     | boolean | `true`  | Perform desktop searches    |
| `workers.doMobileSearch`      | boolean | `true`  | Perform mobile searches     |
| `workers.doDailyCheckIn`      | boolean | `true`  | Complete daily check-in     |
| `workers.doReadToEarn`        | boolean | `true`  | Complete Read-to-Earn       |

### Search Settings

| Setting                                | Type     | Default                                      | Description                         |
| -------------------------------------- | -------- | -------------------------------------------- | ----------------------------------- |
| `searchSettings.scrollRandomResults`   | boolean  | `false`                                      | Scroll randomly on results          |
| `searchSettings.clickRandomResults`    | boolean  | `false`                                      | Click random links                  |
| `searchSettings.parallelSearching`     | boolean  | `true`                                       | Run searches in parallel            |
| `searchSettings.queryEngines`          | string[] | `["google", "wikipedia", "reddit", "local"]` | Query engines to use                |
| `searchSettings.searchResultVisitTime` | string   | `"10sec"`                                    | Time to spend on each search result |
| `searchSettings.searchDelay.min`       | string   | `"30sec"`                                    | Minimum delay between searches      |
| `searchSettings.searchDelay.max`       | string   | `"1min"`                                     | Maximum delay between searches      |
| `searchSettings.readDelay.min`         | string   | `"30sec"`                                    | Minimum delay for reading           |
| `searchSettings.readDelay.max`         | string   | `"1min"`                                     | Maximum delay for reading           |

### Logging

| Setting                          | Type     | Default                | Description                       |
| -------------------------------- | -------- | ---------------------- | --------------------------------- |
| `debugLogs`                      | boolean  | `false`                | Enable debug logging              |
| `consoleLogFilter.enabled`       | boolean  | `false`                | Enable console log filtering      |
| `consoleLogFilter.mode`          | string   | `"whitelist"`          | Filter mode (whitelist/blacklist) |
| `consoleLogFilter.levels`        | string[] | `["error", "warn"]`    | Log levels to filter              |
| `consoleLogFilter.keywords`      | string[] | `["starting account"]` | Keywords to filter                |
| `consoleLogFilter.regexPatterns` | string[] | `[]`                   | Regex patterns for filtering      |

### Proxy

| Setting             | Type    | Default | Description                 |
| ------------------- | ------- | ------- | --------------------------- |
| `proxy.queryEngine` | boolean | `true`  | Proxy query engine requests |

### Webhooks

| Setting                                  | Type     | Default                                              | Description                       |
| ---------------------------------------- | -------- | ---------------------------------------------------- | --------------------------------- |
| `webhook.discord.enabled`                | boolean  | `false`                                              | Enable Discord webhook            |
| `webhook.discord.url`                    | string   | `""`                                                 | Discord webhook URL               |
| `webhook.ntfy.enabled`                   | boolean  | `false`                                              | Enable ntfy notifications         |
| `webhook.ntfy.url`                       | string   | `""`                                                 | ntfy server URL                   |
| `webhook.ntfy.topic`                     | string   | `""`                                                 | ntfy topic                        |
| `webhook.ntfy.token`                     | string   | `""`                                                 | ntfy authentication token         |
| `webhook.ntfy.title`                     | string   | `"Microsoft-Rewards-Script"`                         | Notification title                |
| `webhook.ntfy.tags`                      | string[] | `["bot", "notify"]`                                  | Notification tags                 |
| `webhook.ntfy.priority`                  | number   | `3`                                                  | Notification priority (1-5)       |
| `webhook.webhookLogFilter.enabled`       | boolean  | `false`                                              | Enable webhook log filtering      |
| `webhook.webhookLogFilter.mode`          | string   | `"whitelist"`                                        | Filter mode (whitelist/blacklist) |
| `webhook.webhookLogFilter.levels`        | string[] | `["error"]`                                          | Log levels to send                |
| `webhook.webhookLogFilter.keywords`      | string[] | `["starting account", "select number", "collected"]` | Keywords to filter                |
| `webhook.webhookLogFilter.regexPatterns` | string[] | `[]`                                                 | Regex patterns for filtering      |

> [!WARNING]
> **NTFY** users set the `webhookLogFilter` to `enabled`, or you will receive push notifications for _all_ logs.
> When enabled, only account start, 2FA codes, and account completion summaries are delivered as push notifcations.
> Customize which notifications you receive with the `keywords` options.

---

## Account Setup

Edit `src/accounts.json`.

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
