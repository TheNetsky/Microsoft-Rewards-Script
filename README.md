[![Discord](https://img.shields.io/badge/Join%20Our%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/8BxYbV4pkj)

---

## Table of Contents
- [Setup](#setup)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Copy Configuration Files](#2-copy-configuration-files)
  - [3. Install Dependencies and Prepare the Browser](#3-install-dependencies-and-prepare-the-browser)
  - [4. Build and Run](#4-build-and-run)
- [Nix Users](#nix-setup)
- [Docker Setup](#docker-setup)
  - [Before Starting](#before-starting)
  - [Quick Start](#quick-start)
  - [Example compose.yaml](#example-composeyaml)
- [Configuration Reference](#configuration-reference)
- [Account Configuration](#account-configuration)
- [Features Overview](#features-overview)
- [Disclaimer](#disclaimer)

---

## Setup

**Requirements:** Node.js ≥ 20 and Git  
Works on Windows, Linux, macOS, and WSL.

---

### 1. Clone the Repository
**All systems:**
```bash
git clone https://github.com/TheNetsky/Microsoft-Rewards-Script.git
cd Microsoft-Rewards-Script
```
Or download the latest release ZIP and extract it.

---

### 2. Copy Configuration Files

**Windows:**
Rename manually:
```
src/accounts.example.json → src/accounts.json
```

**Linux / macOS / WSL:**
```bash
cp src/accounts.example.json src/accounts.json
```

Then edit:
- `src/accounts.json` — fill in your Microsoft account credentials.  
- `src/config.json` — review or customize options.

---

### 3. Install Dependencies and Prepare the Browser

**All systems:**
```bash
npm run pre-build
```

This command:
- Installs all dependencies  
- Clears old builds (`dist/`)  
- Installs Playwright Chromium (required browser)

---

### 4. Build and Run

**All systems:**
```bash
npm run build
npm run start
```

---

## Nix Setup

If using Nix:

1. Run the pre-build step first:
   ```bash
   npm run pre-build
   ```

2. Then start the script:
   ```bash
   ./run.sh
   ```

This will launch the script headlessly using `xvfb-run`.

---

## Docker Setup

### Before Starting
- Remove local `/node_modules` and `/dist` if previously built.  
- Remove old Docker volumes if upgrading from older versions.  
- You can reuse your existing `accounts.json`.

---

### Quick Start
1. Clone the repository and configure your `accounts.json`.  
2. Ensure `config.json` has `"headless": true`.  
3. Edit `compose.yaml`:  
   - Set your timezone (`TZ`)  
   - Set the cron schedule (`CRON_SCHEDULE`)  
   - Optionally enable `RUN_ON_START=true`  
4. Start the container:
   ```bash
   docker compose up -d
   ```
5. Monitor logs:
   ```bash
   docker logs microsoft-rewards-script
   ```

The container includes a randomized delay (about 5–50 minutes by default)  
before each scheduled run to appear more natural. This can be configured or disabled via environment variables.

---

### Example compose.yaml

```yaml
services:
  microsoft-rewards-script:
    image: ghcr.io/your-org/microsoft-rewards-script:latest
    container_name: microsoft-rewards-script
    restart: unless-stopped

    volumes:
      - ./src/accounts.json:/usr/src/microsoft-rewards-script/dist/accounts.json:ro
      - ./src/config.json:/usr/src/microsoft-rewards-script/dist/config.json:ro
      - ./sessions:/usr/src/microsoft-rewards-script/dist/sessions
      
    environment:
      TZ: "Europe/Amsterdam"
      NODE_ENV: "production"
      CRON_SCHEDULE: "0 7,16,20 * * *"
      RUN_ON_START: "true"
      # MIN_SLEEP_MINUTES: "5"
      # MAX_SLEEP_MINUTES: "50"
      # SKIP_RANDOM: "true"

    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: "1g"
```

#### compose.yaml Notes
- **volumes**  
  - `accounts.json` and `config.json` are mounted read-only to prevent accidental edits.  
  - `sessions` persists login sessions and fingerprints across runs.  
  - If `jobState.enabled` is used, mount its directory as a volume.
- **CRON_SCHEDULE**  
  - Uses standard crontab syntax (e.g., via [crontab.guru](https://crontab.guru/)).  
  - Schedule is evaluated inside the container using the configured `TZ`.
- **RUN_ON_START**  
  - Runs the script once immediately on startup, then continues on schedule.
- **Randomization**  
  - Default delay: 5–50 minutes.  
  - Adjustable via `MIN_SLEEP_MINUTES` and `MAX_SLEEP_MINUTES`, or disable with `SKIP_RANDOM`.

---

## Configuration Reference

Edit `src/config.json` to customize behavior.  
Below is a summary of available options (matches the latest version in the repository).

### Core
| Setting | Type | Default | Description |
|----------|------|----------|-------------|
| `baseURL` | string | `"https://rewards.bing.com"` | Microsoft Rewards base URL |
| `sessionPath` | string | `"sessions"` | Directory to store browser sessions |
| `headless` | boolean | `false` | Run browser invisibly |
| `parallel` | boolean | `false` | Run desktop and mobile simultaneously |
| `runOnZeroPoints` | boolean | `false` | Run even when no points are available |
| `clusters` | number | `1` | Number of concurrent account clusters |
| `globalTimeout` | string | `"30s"` | Timeout for all actions |
| `searchOnBingLocalQueries` | boolean | `false` | Use local query list |

### Fingerprinting
| Setting | Type | Default | Description |
|----------|------|----------|-------------|
| `saveFingerprint.mobile` | boolean | `false` | Reuse mobile fingerprint |
| `saveFingerprint.desktop` | boolean | `false` | Reuse desktop fingerprint |

### Workers
| Setting | Type | Default | Description |
|----------|------|----------|-------------|
| `doDailySet` | boolean | `true` | Complete daily set |
| `doMorePromotions` | boolean | `true` | Complete more promotions |
| `doPunchCards` | boolean | `true` | Complete punchcards |
| `doDesktopSearch` | boolean | `true` | Perform desktop searches |
| `doMobileSearch` | boolean | `true` | Perform mobile searches |
| `doDailyCheckIn` | boolean | `true` | Complete daily check-in |
| `doReadToEarn` | boolean | `true` | Complete Read-to-Earn |

### Search
| Setting | Type | Default | Description |
|----------|------|----------|-------------|
| `searchSettings.useGeoLocaleQueries` | boolean | `false` | Use region-based queries |
| `searchSettings.scrollRandomResults` | boolean | `true` | Scroll randomly on results |
| `searchSettings.clickRandomResults` | boolean | `true` | Click random links |
| `searchSettings.searchDelay.min` | string | `"3min"` | Minimum delay between searches |
| `searchSettings.searchDelay.max` | string | `"5min"` | Maximum delay between searches |
| `searchSettings.retryMobileSearchAmount` | number | `2` | Retry mobile searches amount |

### Logging
| Setting | Type | Default | Description |
|----------|------|----------|-------------|
| `logExcludeFunc` | string[] | `["SEARCH-CLOSE-TABS"]` | Exclude from console logs |
| `webhookLogExcludeFunc` | string[] | `["SEARCH-CLOSE-TABS"]` | Exclude from webhook logs |

### Proxy
| Setting | Type | Default | Description |
|----------|------|----------|-------------|
| `proxy.proxyGoogleTrends` | boolean | `true` | Proxy Google Trends requests |
| `proxy.proxyBingTerms` | boolean | `true` | Proxy Bing term requests |

### Webhooks
| Setting | Type | Default | Description |
|----------|------|----------|-------------|
| `webhook.enabled` | boolean | `false` | Enable Discord webhook |
| `webhook.url` | string | `""` | Webhook URL |
| `conclusionWebhook.enabled` | boolean | `false` | Enable summary webhook |
| `conclusionWebhook.url` | string | `""` | Summary webhook URL |

---

## Account Configuration

Edit `src/accounts.json` — the file is an **array** of accounts:

```json
[
  {
    "email": "email_1",
    "password": "password_1",
    "proxy": {
      "proxyAxios": true,
      "url": "",
      "port": 0,
      "username": "",
      "password": ""
    }
  },
  {
    "email": "email_2",
    "password": "password_2",
    "proxy": {
      "proxyAxios": true,
      "url": "",
      "port": 0,
      "username": "",
      "password": ""
    }
  }
]
```

**Notes**
- The file is a **flat array** — not `{ "accounts": [ ... ] }`.  
- Only `email`, `password`, and `proxy` are supported.  
- `proxyAxios` enables Axios-level proxying for API requests.

---

## Features Overview

- Multi-account and session handling  
- Persistent browser fingerprints  
- Parallel task execution  
- Proxy and retry support  
- Human-like behavior simulation  
- Full daily set automation  
- Mobile and desktop search support  
- Vacation and risk protection  
- Webhook notifications  
- Docker scheduling support  

---

## Disclaimer

Use at your own risk.  
Automation of Microsoft Rewards may lead to account suspension or bans.  
This software is provided for educational purposes only.  
The authors are not responsible for any actions taken by Microsoft.
