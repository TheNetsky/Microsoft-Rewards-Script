[![Discord](https://img.shields.io/badge/Join%20Our%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/8BxYbV4pkj)

# Quick Setup (Recommended)

**Easiest way to get started — download and run:**

1. **Clone the branch** or download the zip.
2. **Run the setup script:**

   * **Windows:** double-click `setup/setup.bat` or run it from a command prompt
   * **Linux / macOS / WSL:**

     ```bash
     bash setup/setup.sh
     ```
   * **Alternative (any platform):**

     ```bash
     npm run setup
     ```
3. **Follow the setup prompts.** The script will:

   * Rename `accounts.example.json` → `accounts.json`
   * Ask for Microsoft account credentials
   * Remind you to review `config.json`
   * Install dependencies (`npm install`)
   * Build the project (`npm run build`)
   * Optionally start the script

**That's it — the setup script handles the rest.**

---

# Advanced Setup Options

### Nix Users

1. Install Nix from [https://nixos.org/](https://nixos.org/)
2. Run:

```bash
./run.sh
```

### Manual Setup (if setup script fails)

1. Copy `src/accounts.example.json` → `src/accounts.json` and add accounts.
2. Edit `src/config.json` as needed.
3. Install dependencies:

```bash
npm install
```

4. Build:

```bash
npm run build
```

5. Start:

```bash
npm run start
```

---

# Docker Setup (Experimental)

**Before starting**

* Remove local `/node_modules` and `/dist` if you previously built.
* Remove old Docker volumes when upgrading from v1.4 or earlier.
* You can reuse older `accounts.json`.

**Quick Docker (recommended for scheduling)**

1. Clone v2 and configure `accounts.json`.
2. Ensure `config.json` has `"headless": true`.
3. Edit `compose.yaml`:

   * Set `TZ` (timezone)
   * Set `CRON_SCHEDULE` (use crontab.guru for help)
   * Optional: `RUN_ON_START=true`
4. Start:

```bash
docker compose up -d
```

5. Monitor:

```bash
docker logs microsoft-rewards-script
```

> The container randomly delays scheduled runs by ~5–50 minutes to appear more natural.

---

# Usage Notes

* **Headless=false cleanup:** If you stop the script without closing browser windows, use Task Manager / `npm run kill-chrome-win` to close leftover instances.
* **Scheduling advice:** Run at least twice daily. Use `"runOnZeroPoints": false` in config to skip runs with no points.
* **Multiple accounts:** Use `clusters` in `config.json` to run accounts in parallel.

---

# Configuration Reference

Edit `src/config.json` to customize behavior.

### Core Settings (examples)

| Setting           |                      Description |                    Default |
| ----------------- | -------------------------------: | -------------------------: |
| `baseURL`         |            Microsoft Rewards URL | `https://rewards.bing.com` |
| `sessionPath`     |      Session/fingerprint storage |                 `sessions` |
| `headless`        |        Run browser in background |                    `false` |
| `parallel`        | Run mobile/desktop tasks at once |                     `true` |
| `runOnZeroPoints` |     Run when no points available |                    `false` |
| `clusters`        |     Concurrent account instances |                        `1` |

### Fingerprint Settings

| Setting                   |               Description | Default |
| ------------------------- | ------------------------: | ------: |
| `saveFingerprint.mobile`  |  Reuse mobile fingerprint | `false` |
| `saveFingerprint.desktop` | Reuse desktop fingerprint | `false` |

### Task Settings (important ones)

| Setting                    |        Description | Default |
| -------------------------- | -----------------: | ------: |
| `workers.doDailySet`       |       Do daily set |  `true` |
| `workers.doMorePromotions` | Promotional offers |  `true` |
| `workers.doPunchCards`     |    Punchcard tasks |  `true` |
| `workers.doDesktopSearch`  |   Desktop searches |  `true` |
| `workers.doMobileSearch`   |    Mobile searches |  `true` |
| `workers.doDailyCheckIn`   |     Daily check-in |  `true` |
| `workers.doReadToEarn`     |       Read-to-earn |  `true` |

### Search Settings

| Setting                                  |            Description |       Default |
| ---------------------------------------- | ---------------------: | ------------: |
| `searchOnBingLocalQueries`               |      Use local queries |       `false` |
| `searchSettings.useGeoLocaleQueries`     |      Geo-based queries |       `false` |
| `searchSettings.scrollRandomResults`     |       Random scrolling |        `true` |
| `searchSettings.clickRandomResults`      |     Random link clicks |        `true` |
| `searchSettings.searchDelay`             | Delay between searches | `3-5 minutes` |
| `searchSettings.retryMobileSearchAmount` |  Mobile retry attempts |           `2` |

### Advanced Settings

| Setting                   |                 Description |             Default |
| ------------------------- | --------------------------: | ------------------: |
| `globalTimeout`           |              Action timeout |               `30s` |
| `logExcludeFunc`          | Exclude functions from logs | `SEARCH-CLOSE-TABS` |
| `proxy.proxyGoogleTrends` |         Proxy Google Trends |              `true` |
| `proxy.proxyBingTerms`    |            Proxy Bing Terms |              `true` |

### Webhook Settings

| Setting                     |                  Description | Default |
| --------------------------- | ---------------------------: | ------: |
| `webhook.enabled`           | Enable Discord notifications | `false` |
| `webhook.url`               |          Discord webhook URL |  `null` |
| `conclusionWebhook.enabled` |         Summary-only webhook | `false` |
| `conclusionWebhook.url`     |          Summary webhook URL |  `null` |

---

# Features

**Account & Session**

* Multi-account support
* Persistent sessions & fingerprints
* 2FA support & passwordless options

**Automation**

* Headless operation & clustering
* Selectable task sets
* Proxy support & scheduling (Docker)

**Search & Rewards**

* Desktop & mobile searches
* Emulated browsing, scrolling, clicks
* Daily sets, promotions, punchcards, quizzes

**Interactions**

* Quiz solving (10 & 30–40 point variants)
* Polls, ABC quizzes, “This or That” answers

**Notifications**

* Discord webhooks and summary webhooks
* Extensive logs for debugging

---

# Disclaimer

**Use at your own risk.** Automation may cause suspension or banning of Microsoft Rewards accounts. This project is provided for educational purposes only. The maintainers are **not** responsible for account actions taken by Microsoft.
