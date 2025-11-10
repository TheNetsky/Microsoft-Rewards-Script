[![Discord](https://img.shields.io/badge/Join%20Our%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/8BxYbV4pkj)

# Quick Setup (Recommended)

1. Clone this repository or download the latest release ZIP.  
2. Run the setup script:

   * **Windows:**  
     Double-click `setup/setup.bat`
   * **Linux / macOS / WSL:**  
     ```bash
     bash setup/setup.sh
     ```
   * **Alternative (any platform):**  
     ```bash
     npm run setup
     ```

3. Follow the prompts — the setup script will:
   * Copy `accounts.example.json` → `accounts.json`
   * Ask for your Microsoft account credentials
   * Remind you to review `config.json`
   * Install dependencies (`npm install`)
   * Build (`npm run build`)
   * Optionally start the script

That's it — the setup script handles the rest.

---

# Advanced Setup Options

### Nix Users
If using Nix:
```bash
./run.sh
```

### Manual Setup (if setup script fails)
1. Copy:
   ```bash
   cp src/accounts.example.json src/accounts.json
   ```
2. Edit `src/accounts.json` and `src/config.json`.
3. Install and build:
   ```bash
   npm install
   npm run build
   npm run start
   ```

---

# Docker Setup (Recommended for Scheduling)

## Before Starting
* Remove local `/node_modules` and `/dist` if previously built.
* Remove old Docker volumes if upgrading from older versions.
* You can reuse your old `accounts.json`.

## Quick Start
1. Clone v2 and configure `accounts.json`
2. Ensure `config.json` has `"headless": true`
3. Edit `compose.yaml`:
   * Set your timezone (`TZ`)
   * Set cron schedule (`CRON_SCHEDULE`)
   * Optional: `RUN_ON_START=true`
4. Start:
   ```bash
   docker compose up -d
   ```
5. Monitor logs:
   ```bash
   docker logs microsoft-rewards-script
   ```

The container randomly delays scheduled runs by approximately 5–50 minutes to appear more natural (configurable, see notes below).

## Example compose.yaml

```yaml
services:
  microsoft-rewards-script:
    image: ghcr.io/your-org/microsoft-rewards-script:latest
    container_name: microsoft-rewards-script
    restart: unless-stopped

    # Mount your configuration and persistent session storage
    volumes:
      # Read-only config files from your working directory into the container
      - ./src/accounts.json:/usr/src/microsoft-rewards-script/dist/accounts.json:ro
      - ./src/config.json:/usr/src/microsoft-rewards-script/dist/config.json:ro

      # Persist browser sessions/fingerprints between runs
      - ./sessions:/usr/src/microsoft-rewards-script/dist/sessions

      # Optional: persist job state directory (if you set jobState.dir to a folder inside dist/)
      # - ./jobstate:/usr/src/microsoft-rewards-script/dist/jobstate

    environment:
      # Timezone for scheduling
      TZ: "Europe/Amsterdam"

      # Node runtime
      NODE_ENV: "production"

      # Cron schedule for automatic runs (UTC inside container)
      # Example: run at 07:00, 16:00, and 20:00 every day
      CRON_SCHEDULE: "0 7,16,20 * * *"

      # Run immediately on container start (in addition to CRON_SCHEDULE)
      RUN_ON_START: "true"

      # Randomize scheduled start-time between MIN..MAX minutes
      # Comment these to use defaults (about 5–50 minutes)
      # MIN_SLEEP_MINUTES: "5"
      # MAX_SLEEP_MINUTES: "50"

      # Optional: disable randomization entirely
      # SKIP_RANDOM: "true"

    # Optional: limit resources if desired
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: "1g"
```

### compose.yaml Notes
- `volumes`  
  - `accounts.json` and `config.json` are mounted read-only to avoid accidental in-container edits. Edit them on the host.  
  - `sessions` persists your login sessions and fingerprints across restarts and updates.  
  - If you enable `jobState.enabled` and set `jobState.dir`, consider mounting that path as a volume too.
- `CRON_SCHEDULE`  
  - Standard crontab format. Use a site like crontab.guru to generate expressions.  
  - The schedule is evaluated inside the container; ensure `TZ` matches your desired timezone.
- `RUN_ON_START`  
  - If `"true"`, the script runs once immediately when the container is started, then on the cron schedule.
- Randomization  
  - By default, a randomized delay prevents runs from happening at exactly the same time every day.  
  - You can tune it with `MIN_SLEEP_MINUTES` and `MAX_SLEEP_MINUTES`, or disable with `SKIP_RANDOM`.

---

# Configuration Reference

Edit `src/config.json` to customize the bot’s behavior.

## Core

| Setting | Description | Default |
|----------|-------------|----------|
| `baseURL` | Microsoft Rewards base URL | `https://rewards.bing.com` |
| `sessionPath` | Folder to store browser sessions | `sessions` |
| `dryRun` | Simulate without running tasks | `false` |

---

## Browser

| Setting | Description | Default |
|----------|-------------|----------|
| `browser.headless` | Run browser invisibly | `false` |
| `browser.globalTimeout` | Timeout for actions | `"30s"` |

---

## Fingerprinting

| Setting | Description | Default |
|----------|-------------|----------|
| `fingerprinting.saveFingerprint.mobile` | Reuse mobile fingerprint | `true` |
| `fingerprinting.saveFingerprint.desktop` | Reuse desktop fingerprint | `true` |

---

## Execution

| Setting | Description | Default |
|----------|-------------|----------|
| `execution.parallel` | Run desktop and mobile at once | `false` |
| `execution.runOnZeroPoints` | Run even with no points | `false` |
| `execution.clusters` | Concurrent account clusters | `1` |

---

## Job State

| Setting | Description | Default |
|----------|-------------|----------|
| `jobState.enabled` | Save last job state | `true` |
| `jobState.dir` | Directory for job data | `""` |

---

## Workers (Tasks)

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

---

## Search

| Setting | Description | Default |
|----------|-------------|----------|
| `search.useLocalQueries` | Use local query list | `true` |
| `search.settings.useGeoLocaleQueries` | Use region-based queries | `true` |
| `search.settings.scrollRandomResults` | Random scrolling | `true` |
| `search.settings.clickRandomResults` | Random link clicking | `true` |
| `search.settings.retryMobileSearchAmount` | Retry mobile searches | `2` |
| `search.settings.delay.min` | Minimum delay between searches | `1min` |
| `search.settings.delay.max` | Maximum delay between searches | `5min` |

---

## Query Diversity

| Setting | Description | Default |
|----------|-------------|----------|
| `queryDiversity.enabled` | Enable multiple query sources | `true` |
| `queryDiversity.sources` | Query providers | `["google-trends", "reddit", "local-fallback"]` |
| `queryDiversity.maxQueriesPerSource` | Limit per source | `10` |
| `queryDiversity.cacheMinutes` | Cache lifetime | `30` |

---

## Humanization

| Setting | Description | Default |
|----------|-------------|----------|
| `humanization.enabled` | Enable human behavior | `true` |
| `stopOnBan` | Stop immediately on ban | `true` |
| `immediateBanAlert` | Alert instantly if banned | `true` |
| `actionDelay.min` | Minimum delay per action (ms) | `500` |
| `actionDelay.max` | Maximum delay per action (ms) | `2200` |
| `gestureMoveProb` | Chance of random mouse movement | `0.65` |
| `gestureScrollProb` | Chance of random scrolls | `0.4` |

---

## Vacation Mode

| Setting | Description | Default |
|----------|-------------|----------|
| `vacation.enabled` | Enable random pauses | `true` |
| `minDays` | Minimum days off | `2` |
| `maxDays` | Maximum days off | `4` |

---

## Risk Management

| Setting | Description | Default |
|----------|-------------|----------|
| `enabled` | Enable risk-based adjustments | `true` |
| `autoAdjustDelays` | Adapt delays dynamically | `true` |
| `stopOnCritical` | Stop on critical warning | `false` |
| `banPrediction` | Predict bans based on signals | `true` |
| `riskThreshold` | Risk tolerance level | `75` |

---

## Retry Policy

| Setting | Description | Default |
|----------|-------------|----------|
| `maxAttempts` | Maximum retry attempts | `3` |
| `baseDelay` | Initial retry delay | `1000` |
| `maxDelay` | Maximum retry delay | `30s` |
| `multiplier` | Backoff multiplier | `2` |
| `jitter` | Random jitter factor | `0.2` |

---

## Proxy

| Setting | Description | Default |
|----------|-------------|----------|
| `proxy.proxyGoogleTrends` | Proxy Google Trends | `true` |
| `proxy.proxyBingTerms` | Proxy Bing Terms | `true` |

---

## Notifications

| Setting | Description | Default |
|----------|-------------|----------|
| `notifications.webhook.enabled` | Enable Discord webhook | `false` |
| `notifications.webhook.url` | Discord webhook URL | `""` |
| `notifications.conclusionWebhook.enabled` | Enable summary webhook | `false` |
| `notifications.conclusionWebhook.url` | Summary webhook URL | `""` |
| `notifications.ntfy.enabled` | Enable Ntfy push alerts | `false` |
| `notifications.ntfy.url` | Ntfy server URL | `""` |
| `notifications.ntfy.topic` | Ntfy topic name | `"rewards"` |

---

## Logging

| Setting | Description | Default |
|----------|-------------|----------|
| `excludeFunc` | Exclude from console logs | `["SEARCH-CLOSE-TABS", "LOGIN-NO-PROMPT", "FLOW"]` |
| `webhookExcludeFunc` | Exclude from webhook logs | `["SEARCH-CLOSE-TABS", "LOGIN-NO-PROMPT", "FLOW"]` |
| `redactEmails` | Hide emails in logs | `true` |

---

# Account Configuration

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
    },
    {
      "enabled": false,
      "email": "email_2@outlook.com",
      "password": "password_2",
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

# Features Overview

- Multi-account and session handling  
- Persistent browser fingerprints  
- Parallel task execution  
- Proxy and retry support  
- Human-like delays and scrolling  
- Full daily set automation  
- Mobile and desktop search support  
- Vacation and risk protection  
- Webhook and Ntfy notifications  
- Docker scheduling support  

---

# Disclaimer

Use at your own risk.  
Automation of Microsoft Rewards may lead to account suspension or bans.  
This software is provided for educational purposes only.  
The authors are not responsible for any actions taken by Microsoft.