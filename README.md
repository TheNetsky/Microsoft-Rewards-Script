<div align="center">

# Microsoft Rewards Script

**Automated Microsoft Rewards point collection with TypeScript, Cheerio, and Playwright**

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=flat&logo=node.js&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)

*Comprehensive automation for daily sets, searches, quizzes, and promotional activities*

</div>

---

## Quick Start

**Get up and running in 3 steps:**

### Method 1: Automated Setup (Recommended)

```bash
# Windows
setup/setup.bat

# Linux/macOS/WSL
bash setup/setup.sh

# Any platform
npm run setup
```

The setup script will:
- Configure your accounts automatically
- Install dependencies and build the project
- Guide you through initial configuration
- Optionally start the script immediately

### Method 2: Manual Setup

```bash
# 1. Configure accounts
cp src/accounts.example.json src/accounts.json
# Edit accounts.json with your credentials

# 2. Install and build
npm install
npm run build

# 3. Start
npm start
```

## Alternative Setup Methods

<details>
<summary><strong>🐧 Nix Users</strong></summary>

```bash
# Get Nix from https://nixos.org/
./run.sh
```

</details>

<details>
<summary><strong>🔧 Manual Troubleshooting</strong></summary>

If the automated setup fails:

```bash
# 1. Manual file setup
mv src/accounts.example.json src/accounts.json
# Edit accounts.json with your Microsoft credentials

# 2. Install dependencies
npm install

# 3. Build project
npm run build

# 4. Start script
npm start
```

</details>

---

## Docker Deployment

**Perfect for servers and automated scheduling**

### Quick Docker Setup

```yaml
# docker-compose.yml
services:
  rewards:
    build: .
    environment:
      - TZ=America/New_York
      - CRON_SCHEDULE=0 */6 * * *  # Every 6 hours
      - RUN_ON_START=true
      - ACCOUNTS_FILE=/data/accounts.json
    volumes:
      - ./accounts.json:/data/accounts.json:ro
    restart: unless-stopped
```

```bash
# Deploy
docker compose up -d

# Monitor
docker logs -f rewards
```

### Account Configuration Options

| Method | Description | Use Case |
|--------|-------------|----------|
| **File Mount** | `ACCOUNTS_FILE=/data/accounts.json` | Production (recommended) |
| **Environment** | `ACCOUNTS_JSON='[{"email":"...","password":"..."}]'` | CI/CD pipelines |
| **Image Baked** | Include `src/accounts.json` in image | Testing only |

**Notes:**
- Container adds 5-50 minute random delays for natural behavior
- Use `"headless": true` in config.json for Docker
- Dev mode: Use `-dev` flag to load `accounts.dev.json`

## Configuration Reference

**Customize behavior by editing `src/config.json`**

<details>
<summary><strong>Core Settings</strong></summary>

| Setting | Description | Default |
|---------|-------------|---------|
| `baseURL` | Microsoft Rewards page URL | `https://rewards.bing.com` |
| `sessionPath` | Session/fingerprint storage location | `sessions` |
| `headless` | Run browser in background | `false` |
| `parallel` | Run mobile/desktop tasks simultaneously | `true` |
| `runOnZeroPoints` | Continue when no points available | `false` |
| `clusters` | Number of concurrent account instances | `1` |

</details>

<details>
<summary><strong>Task Management</strong></summary>

| Setting | Description | Default |
|---------|-------------|---------|
| `workers.doDailySet` | Complete daily set activities | `true` |
| `workers.doMorePromotions` | Complete promotional offers | `true` |
| `workers.doPunchCards` | Complete punchcard activities | `true` |
| `workers.doDesktopSearch` | Perform desktop searches | `true` |
| `workers.doMobileSearch` | Perform mobile searches | `true` |
| `workers.doDailyCheckIn` | Complete daily check-in | `true` |
| `workers.doReadToEarn` | Complete read-to-earn activities | `true` |

</details>

<details>
<summary><strong>Search Configuration</strong></summary>

| Setting | Description | Default |
|---------|-------------|---------|
| `searchOnBingLocalQueries` | Use local queries vs. fetched | `false` |
| `searchSettings.useGeoLocaleQueries` | Generate location-based queries | `false` |
| `searchSettings.scrollRandomResults` | Randomly scroll search results | `true` |
| `searchSettings.clickRandomResults` | Click random result links | `true` |
| `searchSettings.searchDelay` | Delay between searches (min/max) | `3-5 minutes` |
| `searchSettings.retryMobileSearchAmount` | Mobile search retry attempts | `2` |

</details>

<details>
<summary><strong>Browser & Fingerprinting</strong></summary>

| Setting | Description | Default |
|---------|-------------|---------|
| `saveFingerprint.mobile` | Reuse mobile browser fingerprint | `false` |
| `saveFingerprint.desktop` | Reuse desktop browser fingerprint | `false` |
| `globalTimeout` | Action timeout duration | `30s` |
| `proxy.proxyGoogleTrends` | Proxy Google Trends requests | `true` |
| `proxy.proxyBingTerms` | Proxy Bing Terms requests | `true` |

</details>

<details>
<summary><strong>Logging & Debugging</strong></summary>

| Setting | Description | Default |
|---------|-------------|---------|
| `logExcludeFunc` | Functions to exclude from console logs | `["SEARCH-CLOSE-TABS"]` |
| `webhookLogExcludeFunc` | Functions to exclude from webhook logs | `["SEARCH-CLOSE-TABS"]` |

**Log Filtering:**
- Add tags like `"LOGIN-NO-PROMPT"` or `"FLOW"` to reduce console noise
- Separate control for webhook vs console output

</details>

<details>
<summary><strong>Notifications</strong></summary>

| Setting | Description | Default |
|---------|-------------|---------|
| `webhook.enabled` | Enable Discord live notifications | `false` |
| `webhook.url` | Discord webhook URL | `null` |
| `conclusionWebhook.enabled` | Enable end-of-run summary | `false` |
| `conclusionWebhook.url` | Summary webhook URL | `null` |
| `ntfy.enabled` | Enable NTFY push notifications | `false` |
| `ntfy.url` | NTFY server URL | `null` |
| `ntfy.topic` | NTFY topic | `rewards` |
| `ntfy.authToken` | NTFY authentication token | `null` |

**Enhanced Summary Webhook:**
- Rich Discord embeds with totals, success/error counts, and per-account breakdown
- Automatic chunking for Discord limits (max 10 embeds, 25 fields each)
- Footer includes run ID and version info
- NTFY receives a clean text fallback

</details>

<details>
<summary><strong>Diagnostics & Troubleshooting</strong></summary>

| Setting | Description | Default |
|---------|-------------|---------|
| `diagnostics.enabled` | Enable error diagnostics capture | `false` |
| `diagnostics.saveScreenshot` | Save PNG screenshots on failure | `true` |
| `diagnostics.saveHtml` | Save page HTML on failure | `true` |
| `diagnostics.maxPerRun` | Max captures per run | `2` |
| `diagnostics.retentionDays` | Delete reports older than N days | `7` |

**Notes:**
- Disabled by default to avoid clutter
- Captures are saved to `reports/YYYY-MM-DD/` with run IDs
- Automatic cleanup based on retention period

</details>

<details>
<summary><strong>Auto-Update (Post-Run)</strong></summary>

| Setting | Description | Default |
|---------|-------------|---------|
| `update.git` | Auto-update via Git after completion | `true` |
| `update.docker` | Auto-update Docker containers after completion | `false` |
| `update.scriptPath` | Custom update script path | `setup/update/update.mjs` |

**Git Update Process:**
```bash
git fetch --all --prune
git pull --ff-only
npm ci
npm run build
```

**Docker Update Process:**
```bash
docker compose pull
docker compose up -d
```

**Notes:**
- Updates only run if tools are available
- Failures don't break the main script
- Git and Docker updates are independent

</details>

---

## Features Overview

<div align="center">

### Account Management
✓ Multi-Account Support • ✓ Session Persistence • ✓ 2FA Support • ✓ Passwordless Login

### Automation & Control  
✓ Headless Operation • ✓ Clustering Support • ✓ Task Selection • ✓ Proxy Support • ✓ Docker Scheduling

### Search & Activities
✓ Desktop & Mobile Searches • ✓ Edge Simulation • ✓ Geo-Located Queries • ✓ Emulated Scrolling & Clicking  
✓ Daily Set Completion • ✓ Promotional Activities • ✓ Punchcard Completion • ✓ Daily Check-in • ✓ Read to Earn

### Quiz & Interactive Content
✓ Quiz Solving (10 & 30-40 point variants) • ✓ This Or That Quiz • ✓ ABC Quiz Solving • ✓ Poll Completion • ✓ Click Rewards

### Notifications & Monitoring
✓ Discord Webhook Integration • ✓ Rich Summary Reports • ✓ Comprehensive Logging • ✓ NTFY Push Notifications

</div>

---

## Usage Tips

**Browser Management:**
- Use `"headless": true` for server deployments
- Clean up browser instances with Task Manager or `npm run kill-chrome-win` if needed

**Scheduling Recommendations:**
- Run at least twice daily for optimal point collection
- Set `"runOnZeroPoints": false` to skip runs when no points are available
- Use Docker with cron for automated scheduling

**Troubleshooting:**
- Enable `diagnostics.enabled` for error screenshots and HTML dumps
- Check Discord webhooks for real-time monitoring
- Review logs in `reports/` directory for detailed run information

---

## Disclaimer

> **⚠️ Important Notice**
> 
> This script is provided for educational purposes only. Use at your own risk.
> 
> Microsoft may suspend or ban accounts that use automation tools. The authors are not responsible for any account actions taken by Microsoft.

---

## Contributing

This project welcomes contributions while maintaining focus on personal use. Please ensure any changes:

- Maintain compatibility with the existing configuration system
- Follow the established code patterns and TypeScript standards  
- Include appropriate documentation for new features
- Consider Docker and headless deployment scenarios

For major changes, please open an issue first to discuss the proposed modifications.