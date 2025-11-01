# Microsoft-Rewards-Rewi

[![Discord](https://img.shields.io/badge/💬_Join_Discord-7289DA?style=for-the-badge&logo=discord)](https://discord.gg/kn3695Kx32) 
[![GitHub](https://img.shields.io/badge/⭐_Star_Project-yellow?style=for-the-badge&logo=github)](https://github.com/LightZirconite/Microsoft-Rewards-Rewi)

---

# 🚀 Quick Setup (Recommended)

**Easiest way to get started — download and run:**

1. **Clone the repository:**
   ```bash
   git clone https://github.com/LightZirconite/Microsoft-Rewards-Rewi.git
   cd Microsoft-Rewards-Rewi
   ```

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
   * Rename `accounts.example.jsonc` → `accounts.jsonc`
   * Ask for Microsoft account credentials
   * Remind you to review `config.jsonc`
   * Install dependencies (`npm install`)
   * Build the project (`npm run build`)
   * Optionally start the script

**That's it — the setup script handles the rest.**

---

# ⚙️ Advanced Setup Options

### Nix Users

1. Install Nix from [https://nixos.org/](https://nixos.org/)
2. Run:
   ```bash
   ./run.sh
   ```

### Manual Setup (if setup script fails)

1. Copy `src/accounts.example.jsonc` → `src/accounts.jsonc` and add your accounts.
2. Edit `src/config.jsonc` as needed.
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

# 🐳 Docker Setup (Experimental)

**Before starting:**

* Remove local `/node_modules` and `/dist` if you previously built.
* Remove old Docker volumes when upgrading from older versions.
* You can reuse older `accounts.jsonc`.

**Quick Docker (recommended for scheduling):**

1. Clone the repository and configure `accounts.jsonc` (or rename from `accounts.example.jsonc`).
2. Ensure `config.jsonc` has `"headless": true` in browser settings.
3. Edit `compose.yaml`:
   * Set `TZ` (timezone)
   * **Choose scheduling mode:**
     * **Option A (default):** Built-in scheduler — configure `schedule` in `config.jsonc`
     * **Option B (cron):** Uncomment `USE_CRON: "true"` and set `CRON_SCHEDULE`
   * Optional: `RUN_ON_START=true` (runs once immediately on container start)
4. Start:
   ```bash
   docker compose up -d
   ```
5. Monitor:
   ```bash
   docker logs -f microsoft-rewards-script
   ```

### Scheduling Options

**Built-in Scheduler (Default):**
```yaml
# In docker-compose.yml - no cron variables needed
environment:
  TZ: "Europe/Paris"
```
```jsonc
// In config.jsonc
{
  "schedule": {
    "enabled": true,
    "time24": "09:00",
    "timeZone": "Europe/Paris"
  }
}
```

**Native Cron (Traditional):**
```yaml
# In docker-compose.yml
environment:
  TZ: "Europe/Paris"
  USE_CRON: "true"
  CRON_SCHEDULE: "0 9,16,21 * * *"  # 9 AM, 4 PM, 9 PM
  RUN_ON_START: "true"
```

Use [crontab.guru](https://crontab.guru) for cron syntax help.

**See [Docker Documentation](docs/docker.md) for detailed setup and troubleshooting.**

---

# 📋 Usage Notes

* **Headless=false cleanup:** If you stop the script without closing browser windows, use Task Manager or run `npm run kill-chrome-win` (Windows) to close leftover instances.
* **Scheduling advice:** Run at least once or twice daily. Use `"runOnZeroPoints": false` in config to skip runs when no points are available.
* **Multiple accounts:** Use `clusters` in `config.jsonc` to run accounts in parallel.
* **Built-in scheduler:** Enable `schedule.enabled` in `config.jsonc` to run automatically without external cron jobs.

---

# ⚙️ Configuration Reference

Edit `src/config.jsonc` to customize behavior. See the [full configuration documentation](docs/config.md) for detailed explanations.

<details>
<summary><b>Core Settings</b></summary>

| Setting | Description | Default |
| ------- | ----------- | ------- |
| `baseURL` | Microsoft Rewards URL | `https://rewards.bing.com` |
| `sessionPath` | Session/fingerprint storage | `sessions` |
| `browser.headless` | Run browser in background | `false` |
| `browser.globalTimeout` | Max timeout for operations | `30s` |
| `execution.parallel` | Run mobile/desktop tasks at once | `false` |
| `execution.runOnZeroPoints` | Run when no points available | `false` |
| `execution.clusters` | Concurrent account instances | `1` |
| `execution.passesPerRun` | How many times to process each account | `3` |

</details>

<details>
<summary><b>Fingerprint Settings</b></summary>

| Setting | Description | Default |
| ------- | ----------- | ------- |
| `fingerprinting.saveFingerprint.mobile` | Reuse mobile fingerprint | `true` |
| `fingerprinting.saveFingerprint.desktop` | Reuse desktop fingerprint | `true` |

</details>

<details>
<summary><b>Task Settings</b></summary>

| Setting | Description | Default |
| ------- | ----------- | ------- |
| `workers.doDailySet` | Complete daily set | `true` |
| `workers.doMorePromotions` | Complete promotional offers | `true` |
| `workers.doPunchCards` | Complete punchcard tasks | `true` |
| `workers.doDesktopSearch` | Perform desktop searches | `true` |
| `workers.doMobileSearch` | Perform mobile searches | `true` |
| `workers.doDailyCheckIn` | Complete daily check-in | `true` |
| `workers.doReadToEarn` | Complete read-to-earn tasks | `true` |
| `workers.bundleDailySetWithSearch` | Run desktop searches after Daily Set | `true` |

</details>

<details>
<summary><b>Search Settings</b></summary>

| Setting | Description | Default |
| ------- | ----------- | ------- |
| `search.useLocalQueries` | Use locale-specific query sources | `true` |
| `search.settings.useGeoLocaleQueries` | Use region-specific queries | `true` |
| `search.settings.scrollRandomResults` | Random scrolling on results | `true` |
| `search.settings.clickRandomResults` | Random link clicks | `true` |
| `search.settings.retryMobileSearchAmount` | Mobile retry attempts | `2` |
| `search.settings.delay.min` | Minimum delay between searches | `1min` |
| `search.settings.delay.max` | Maximum delay between searches | `5min` |

</details>

<details>
<summary><b>Query Diversity Engine</b></summary>

| Setting | Description | Default |
| ------- | ----------- | ------- |
| `queryDiversity.enabled` | Multi-source query generation | `true` |
| `queryDiversity.sources` | Available query sources | `["google-trends", "reddit", "local-fallback"]` |
| `queryDiversity.maxQueriesPerSource` | Max queries per source | `10` |
| `queryDiversity.cacheMinutes` | Cache duration in minutes | `30` |

</details>

<details>
<summary><b>Humanization & Natural Behavior</b></summary>

| Setting | Description | Default |
| ------- | ----------- | ------- |
| `humanization.enabled` | Enable human-like behavior patterns | `true` |
| `humanization.stopOnBan` | Stop processing accounts on ban detection | `true` |
| `humanization.immediateBanAlert` | Send immediate alert on ban | `true` |
| `humanization.actionDelay.min` | Minimum action delay (ms) | `500` |
| `humanization.actionDelay.max` | Maximum action delay (ms) | `2200` |
| `humanization.gestureMoveProb` | Mouse gesture probability | `0.65` |
| `humanization.gestureScrollProb` | Scroll gesture probability | `0.4` |
| `vacation.enabled` | Monthly vacation mode | `true` |
| `vacation.minDays` | Minimum vacation days per month | `2` |
| `vacation.maxDays` | Maximum vacation days per month | `4` |

</details>

<details>
<summary><b>Risk Management & Security</b></summary>

| Setting | Description | Default |
| ------- | ----------- | ------- |
| `riskManagement.enabled` | Dynamic delay adjustment | `true` |
| `riskManagement.autoAdjustDelays` | Auto-adjust delays on risk detection | `true` |
| `riskManagement.stopOnCritical` | Stop on critical risk level | `false` |
| `riskManagement.banPrediction` | ML-based ban prediction | `true` |
| `riskManagement.riskThreshold` | Risk threshold (0-100) | `75` |

</details>

<details>
<summary><b>Scheduling (Built-in)</b></summary>

| Setting | Description | Default |
| ------- | ----------- | ------- |
| `schedule.enabled` | Enable built-in scheduler | `false` |
| `schedule.useAmPm` | Use 12-hour time format | `false` |
| `schedule.time12` | Time in 12-hour format | `9:00 AM` |
| `schedule.time24` | Time in 24-hour format | `09:00` |
| `schedule.timeZone` | IANA timezone | `Europe/Paris` |
| `schedule.runImmediatelyOnStart` | Run on process start | `false` |

</details>

<details>
<summary><b>Job State Management</b></summary>

| Setting | Description | Default |
| ------- | ----------- | ------- |
| `jobState.enabled` | Save state to avoid duplicate work | `true` |
| `jobState.dir` | Custom state directory | `""` |

</details>

<details>
<summary><b>Proxy Settings</b></summary>

| Setting | Description | Default |
| ------- | ----------- | ------- |
| `proxy.proxyGoogleTrends` | Proxy Google Trends requests | `true` |
| `proxy.proxyBingTerms` | Proxy Bing Terms requests | `true` |

</details>

<details>
<summary><b>Notification Settings</b></summary>

| Setting | Description | Default |
| ------- | ----------- | ------- |
| `webhook.enabled` | Enable Discord webhook | `false` |
| `webhook.url` | Discord webhook URL | `""` |
| `conclusionWebhook.enabled` | Summary-only webhook | `false` |
| `conclusionWebhook.url` | Summary webhook URL | `""` |
| `ntfy.enabled` | Enable NTFY notifications | `false` |
| `ntfy.url` | NTFY server URL | `""` |
| `ntfy.topic` | NTFY topic | `rewards` |
| `ntfy.authToken` | NTFY auth token | `""` |

</details>

<details>
<summary><b>Logging & Diagnostics</b></summary>

| Setting | Description | Default |
| ------- | ----------- | ------- |
| `logging.excludeFunc` | Exclude log categories | `["SEARCH-CLOSE-TABS", "LOGIN-NO-PROMPT", "FLOW"]` |
| `logging.webhookExcludeFunc` | Exclude from webhook logs | `["SEARCH-CLOSE-TABS", "LOGIN-NO-PROMPT", "FLOW"]` |
| `logging.redactEmails` | Redact email addresses in logs | `true` |
| `diagnostics.enabled` | Capture diagnostic data | `true` |
| `diagnostics.saveScreenshot` | Save screenshots on failure | `true` |
| `diagnostics.saveHtml` | Save HTML on failure | `true` |
| `diagnostics.maxPerRun` | Max diagnostics per run | `2` |
| `diagnostics.retentionDays` | Days to keep diagnostics | `7` |

</details>

<details>
<summary><b>Analytics</b></summary>

| Setting | Description | Default |
| ------- | ----------- | ------- |
| `analytics.enabled` | Performance dashboard tracking | `true` |
| `analytics.retentionDays` | Data retention period | `30` |
| `analytics.exportMarkdown` | Generate markdown reports | `true` |
| `analytics.webhookSummary` | Send analytics via webhook | `true` |

</details>

<details>
<summary><b>Update Settings</b></summary>

| Setting | Description | Default |
| ------- | ----------- | ------- |
| `update.git` | Enable git auto-update | `true` |
| `update.docker` | Enable docker auto-update | `false` |
| `update.scriptPath` | Custom updater script path | `setup/update/update.mjs` |
| `update.autoUpdateConfig` | Auto-merge config changes | `true` |
| `update.autoUpdateAccounts` | Auto-merge account changes | `true` |

</details>

---

# 📚 Documentation

For detailed information about configuration, features, and advanced usage, please refer to the documentation in the `docs/` folder. Start with `docs/index.md` for an overview and navigation to specific topics.

---

# ⚠️ Disclaimer

**Use at your own risk.** Automation may violate Microsoft's Terms of Service and can result in suspension or permanent banning of your Microsoft Rewards account. This project is provided **for educational purposes only**. The developer is **not responsible** for any actions taken by Microsoft against your account.

---

# 📄 License

This project is licensed under a **PROPRIETARY** license. See [LICENSE](LICENSE) for details.
