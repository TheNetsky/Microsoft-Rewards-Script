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
      # - ./jobstate:/usr/src/microsoft-rewards-script/dist/jobstate

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
Below is a summary of key configuration sections.

### Core
| Setting | Description | Default |
|----------|-------------|----------|
| `baseURL` | Microsoft Rewards base URL | `https://rewards.bing.com` |
| `sessionPath` | Folder to store browser sessions | `sessions` |
| `dryRun` | Simulate execution without running tasks | `false` |

### Browser
| Setting | Description | Default |
|----------|-------------|----------|
| `browser.headless` | Run browser invisibly | `false` |
| `browser.globalTimeout` | Timeout for actions | `"30s"` |

### Fingerprinting
| Setting | Description | Default |
|----------|-------------|----------|
| `fingerprinting.saveFingerprint.mobile` | Reuse mobile fingerprint | `true` |
| `fingerprinting.saveFingerprint.desktop` | Reuse desktop fingerprint | `true` |

### Execution
| Setting | Description | Default |
|----------|-------------|----------|
| `execution.parallel` | Run desktop and mobile simultaneously | `false` |
| `execution.runOnZeroPoints` | Run even with zero points | `false` |
| `execution.clusters` | Number of concurrent account clusters | `1` |

### Job State
| Setting | Description | Default |
|----------|-------------|----------|
| `jobState.enabled` | Save last job state | `true` |
| `jobState.dir` | Directory for job data | `""` |

### Workers (Tasks)
| Setting | Description | Default |
|----------|-------------|----------|
| `doDailySet` | Complete daily set | `true` |
| `doMorePromotions` | Complete more promotions | `true` |
| `doPunchCards` | Complete punchcards | `true` |
| `doDesktopSearch` | Perform desktop searches | `true` |
| `doMobileSearch` | Perform mobile searches | `true` |
| `doDailyCheckIn` | Complete daily check-in | `true` |
| `doReadToEarn` | Complete Read-to-Earn | `true` |
| `bundleDailySetWithSearch` | Combine daily set and searches | `true` |

### Search
| Setting | Description | Default |
|----------|-------------|----------|
| `search.useLocalQueries` | Use local query list | `true` |
| `search.settings.useGeoLocaleQueries` | Use region-based queries | `true` |
| `search.settings.scrollRandomResults` | Random scrolling | `true` |
| `search.settings.clickRandomResults` | Random link clicking | `true` |
| `search.settings.retryMobileSearchAmount` | Retry mobile searches | `2` |
| `search.settings.delay.min` | Minimum delay between searches | `1min` |
| `search.settings.delay.max` | Maximum delay between searches | `5min` |

### Query Diversity
| Setting | Description | Default |
|----------|-------------|----------|
| `queryDiversity.enabled` | Enable multiple query sources | `true` |
| `queryDiversity.sources` | Query providers | `["google-trends", "reddit", "local-fallback"]` |
| `queryDiversity.maxQueriesPerSource` | Limit per source | `10` |
| `queryDiversity.cacheMinutes` | Cache lifetime | `30` |

### Humanization
| Setting | Description | Default |
|----------|-------------|----------|
| `humanization.enabled` | Enable human behavior | `true` |
| `stopOnBan` | Stop immediately on ban | `true` |
| `immediateBanAlert` | Alert instantly if banned | `true` |
| `actionDelay.min` | Minimum delay per action (ms) | `500` |
| `actionDelay.max` | Maximum delay per action (ms) | `2200` |
| `gestureMoveProb` | Chance of random mouse movement | `0.65` |
| `gestureScrollProb` | Chance of random scrolls | `0.4` |

### Vacation Mode
| Setting | Description | Default |
|----------|-------------|----------|
| `vacation.enabled` | Enable random pauses | `true` |
| `minDays` | Minimum days off | `2` |
| `maxDays` | Maximum days off | `4` |

### Risk Management
| Setting | Description | Default |
|----------|-------------|----------|
| `enabled` | Enable risk-based adjustments | `true` |
| `autoAdjustDelays` | Adapt delays dynamically | `true` |
| `stopOnCritical` | Stop on critical warning | `false` |
| `banPrediction` | Predict bans based on signals | `true` |
| `riskThreshold` | Risk tolerance level | `75` |

### Retry Policy
| Setting | Description | Default |
|----------|-------------|----------|
| `maxAttempts` | Maximum retry attempts | `3` |
| `baseDelay` | Initial retry delay | `1000` |
| `maxDelay` | Maximum retry delay | `30s` |
| `multiplier` | Backoff multiplier | `2` |
| `jitter` | Random jitter factor | `0.2` |

### Proxy
| Setting | Description | Default |
|----------|-------------|----------|
| `proxy.proxyGoogleTrends` | Proxy Google Trends requests | `true` |
| `proxy.proxyBingTerms` | Proxy Bing terms requests | `true` |

### Notifications
| Setting | Description | Default |
|----------|-------------|----------|
| `notifications.webhook.enabled` | Enable Discord webhook | `false` |
| `notifications.webhook.url` | Discord webhook URL | `""` |
| `notifications.conclusionWebhook.enabled` | Enable summary webhook | `false` |
| `notifications.conclusionWebhook.url` | Summary webhook URL | `""` |
| `notifications.ntfy.enabled` | Enable Ntfy push alerts | `false` |
| `notifications.ntfy.url` | Ntfy server URL | `""` |
| `notifications.ntfy.topic` | Ntfy topic name | `"rewards"` |

### Logging
| Setting | Description | Default |
|----------|-------------|----------|
| `excludeFunc` | Exclude from console logs | `["SEARCH-CLOSE-TABS", "LOGIN-NO-PROMPT", "FLOW"]` |
| `webhookExcludeFunc` | Exclude from webhook logs | `["SEARCH-CLOSE-TABS", "LOGIN-NO-PROMPT", "FLOW"]` |
| `redactEmails` | Hide emails in logs | `true` |

---

## Account Configuration

Edit `src/accounts.json`:

```json
{
  "accounts": [
    {
      "enabled": true,
      "email": "email_1@outlook.com",
      "password": "password_1",
      "totp": "",
      "recoveryEmail": "your_email@domain.com",
      "proxy": {
        "proxyAxios": true,
        "url": "",
        "port": 0,
        "username": "",
        "password": ""
      }
    }
  ]
}
```

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
- Webhook and Ntfy notifications  
- Docker scheduling support  

---

## Disclaimer

Use at your own risk.  
Automation of Microsoft Rewards may lead to account suspension or bans.  
This software is provided for educational purposes only.  
The authors are not responsible for any actions taken by Microsoft.
