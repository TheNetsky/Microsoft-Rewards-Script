# ⚙️ Configuration Guide# ⚙️ Configuration Guide



**Customize script behavior in `src/config.jsonc`**This page documents every field in the configuration file. The default ships as `src/config.jsonc` so you get inline `//` guidance without editor warnings, and the loader still accepts traditional `config.json` files if you prefer plain JSON.



---Looking for ready-to-use presets? Check `docs/config-presets/` for curated examples such as `balanced.jsonc` (full automation with humanization) and `minimal.jsonc` (lean runs with quick scheduling).



## ⚡ Quick Start (Essentials)> NOTE: Previous versions had `logging.live` (live streaming webhook); it was removed and replaced by a simple `logging.redactEmails` flag.



### Minimal Working Config---

## Top-Level Fields

```jsonc

{### baseURL

  "humanization": {Internal Microsoft Rewards base. Leave it unless you know what you are doing.

    "enabled": true  // Natural behavior (recommended)

  },### sessionPath

  "workers": {Directory where session data (cookies / fingerprints / job-state) is stored.

    "doDailySet": true,

    "doDesktopSearch": true,---

    "doMobileSearch": true## browser

  }| Key | Type | Default | Description |

}|-----|------|---------|-------------|

```| headless | boolean | false | Run browser UI-less. Set to `false` to keep the browser visible (default). |

| globalTimeout | string/number | "30s" | Max time for common Playwright operations. Accepts ms number or time string (e.g. `"45s"`, `"2min"`). |

**That's all you need!** Everything else has good defaults.

---

---## execution

| Key | Type | Default | Description |

## 🎯 Popular Configurations|-----|------|---------|-------------|

| parallel | boolean | false | Run desktop + mobile simultaneously (higher resource usage). |

### 1. Daily Automation| runOnZeroPoints | boolean | false | Skip full run early if there are zero points available (saves time). |

| clusters | number | 1 | Number of process clusters (multi-process concurrency). |

```jsonc| passesPerRun | number | 1 | Advanced: extra full passes per started run. |

{

  "humanization": { "enabled": true },---

  "schedule": {## buyMode

    "enabled": true,Manual redeem / purchase assistance.

    "time": "09:00",| Key | Type | Default | Description |

    "timeZone": "America/New_York"|-----|------|---------|-------------|

  }| enabled (CLI `-buy`) | boolean | false | Enable buy mode (usually via CLI argument). |

}| maxMinutes | number | 45 | Max session length for buy mode. |

```

---

→ **[Full Scheduler Guide](./schedule.md)**## fingerprinting.saveFingerprint

Persist browser fingerprints per device type for consistency.

---| Key | Type | Default | Description |

|-----|------|---------|-------------|

### 2. With Notifications| mobile | boolean | false | Save/reuse a consistent mobile fingerprint. |

| desktop | boolean | false | Save/reuse a consistent desktop fingerprint. |

```jsonc

{---

  "humanization": { "enabled": true },## search

  "conclusionWebhook": {| Key | Type | Default | Description |

    "enabled": true,|-----|------|---------|-------------|

    "url": "https://discord.com/api/webhooks/YOUR_WEBHOOK"| useLocalQueries | boolean | false | Use locale-specific query sources instead of global ones. |

  }

}### search.settings

```| Key | Type | Default | Description |

|-----|------|---------|-------------|

→ **[Discord Setup](./conclusionwebhook.md)** | **[NTFY Setup](./ntfy.md)**| useGeoLocaleQueries | boolean | false | Blend geo / locale into chosen queries. |

| scrollRandomResults | boolean | true | Random scroll during search pages to look natural. |

---| clickRandomResults | boolean | true | Occasionally click safe results. |

| retryMobileSearchAmount | number | 2 | Retries if mobile searches didn’t yield points. |

### 3. Background Mode (Headless)| delay.min / delay.max | string/number | 3–5min | Delay between searches (ms or time string). |



```jsonc---

{## humanization

  "browser": {Human‑like behavior simulation.

    "headless": true| Key | Type | Default | Description |

  },|-----|------|---------|-------------|

  "humanization": { "enabled": true }| enabled | boolean | true | Global on/off. |

}| stopOnBan | boolean | true | Stop processing further accounts if a ban is detected. |

```| immediateBanAlert | boolean | true | Fire notification immediately upon ban detection. |

| actionDelay.min/max | number/string | 150–450ms | Random micro-delay per action. |

**Note:** Set `headless: false` to see the browser during development.| gestureMoveProb | number | 0.4 | Probability of a small mouse move gesture. |

| gestureScrollProb | number | 0.2 | Probability of a small scroll gesture. |

---| allowedWindows | string[] | [] | Local time windows (e.g. `["08:30-11:00","19:00-22:00"]`). Outside windows, run waits. |



### 4. Skip When No Points---

## vacation

```jsoncRandom contiguous block of days off per month.

{| Key | Type | Default | Description |

  "execution": {|-----|------|---------|-------------|

    "runOnZeroPoints": false| enabled | boolean | false | Activate monthly break behavior. |

  }| minDays | number | 3 | Minimum skipped days per month. |

}| maxDays | number | 5 | Maximum skipped days per month. |

```

---

Saves time by skipping accounts with 0 available points.## retryPolicy

Generic transient retry/backoff.

---| Key | Type | Default | Description |

|-----|------|---------|-------------|

### 5. Multiple Accounts Faster| maxAttempts | number | 3 | Max tries for retryable blocks. |

| baseDelay | number | 1000 | Initial delay in ms. |

```jsonc| maxDelay | number/string | 30s | Max backoff delay. |

{| multiplier | number | 2 | Exponential backoff multiplier. |

  "execution": {| jitter | number | 0.2 | Randomization factor (0..1). |

    "parallel": false,  // Desktop + mobile simultaneously

    "clusters": 1       // Process multiple accounts in parallel---

  }## workers

}Enable/disable scripted task categories.

```| Key | Default | Description |

|-----|---------|-------------|

⚠️ **Higher detection risk** with parallel execution.| doDailySet | true | Daily set activities. |

| doMorePromotions | true | Promotional tasks. |

---| doPunchCards | true | Punch card flows. |

| doDesktopSearch | true | Desktop searches. |

## 🛡️ Anti-Ban Settings| doMobileSearch | true | Mobile searches. |

| doDailyCheckIn | true | Daily check-in. |

### Humanization (Recommended)| doReadToEarn | true | Reading tasks. |

| bundleDailySetWithSearch | false | Immediately start desktop search bundle after daily set. |

```jsonc

{---

  "humanization": {## proxy

    "enabled": true,| Key | Default | Description |

    "actionDelay": { "min": 150, "max": 450 },|-----|---------|-------------|

    "gestureMoveProb": 0.4,| proxyGoogleTrends | true | Route Google Trends fetch through proxy if set. |

    "gestureScrollProb": 0.2,| proxyBingTerms | true | Route Bing query source fetch through proxy if set. |

    "randomOffDaysPerWeek": 1

  }---

}## notifications

```Manages notification channels (Discord webhooks, NTFY, etc.).



→ **[Full Humanization Guide](./humanization.md)**### notifications.webhook

Primary webhook (can be used for summary or generic messages).

---| Key | Default | Description |

|-----|---------|-------------|

### Vacation Mode| enabled | false | Allow sending webhook-based notifications and live log streaming. |

| url | "" | Webhook endpoint. |

```jsonc

{### notifications.conclusionWebhook

  "vacation": {Rich end-of-run summary (if enabled separately).

    "enabled": true,| Key | Default | Description |

    "minDays": 3,|-----|---------|-------------|

    "maxDays": 5| enabled | false | Enable run summary posting. |

  }| url | "" | Webhook endpoint. |

}

```### notifications.ntfy

Lightweight push notifications.

Skips 3-5 random consecutive days per month.| Key | Default | Description |

|-----|---------|-------------|

---| enabled | false | Enable NTFY push. |

| url | "" | Base NTFY server URL (e.g. https://ntfy.sh). |

## 🔧 Advanced Options| topic | rewards | Topic/channel name. |

| authToken | "" | Bearer token if your server requires auth. |

<details>

<summary><strong>Click to expand all options</strong></summary>---

## logging

### Browser| Key | Type | Description |

|-----|------|-------------|

```jsonc| excludeFunc | string[] | Log buckets suppressed in console + any webhook usage. |

{| webhookExcludeFunc | string[] | Buckets suppressed specifically for webhook output. |

  "browser": {| redactEmails | boolean | If true, email addresses are partially masked in logs. |

    "headless": false,| liveWebhookUrl | string | Optional override URL for live log streaming (falls back to `notifications.webhook.url`). |

    "globalTimeout": "30s"

  }_Removed fields_: `live.enabled`, `live.url`, `live.redactEmails` — replaced by `redactEmails` only.

}

```---

## diagnostics

### Workers (Tasks)Capture evidence when something fails.

| Key | Default | Description |

```jsonc|-----|---------|-------------|

{| enabled | true | Master switch for diagnostics. |

  "workers": {| saveScreenshot | true | Save screenshot on failure. |

    "doDailySet": true,| saveHtml | true | Save HTML snapshot on failure. |

    "doMorePromotions": true,| maxPerRun | 2 | Cap artifacts per run per failure type. |

    "doPunchCards": true,| retentionDays | 7 | Old run artifacts pruned after this many days. |

    "doDesktopSearch": true,

    "doMobileSearch": true,---

    "doDailyCheckIn": true,## jobState

    "doReadToEarn": trueCheckpoint system to avoid duplicate work.

  }| Key | Default | Description |

}|-----|---------|-------------|

```| enabled | true | Enable job state tracking. |

| dir | "" | Custom directory (default: `<sessionPath>/job-state`). |

### Search Behavior

---

```jsonc## schedule

{Built-in scheduler (avoids external cron inside container or host).

  "search": {| Key | Default | Description |

    "useLocalQueries": false,|-----|---------|-------------|

    "settings": {| enabled | false | Enable scheduling loop. |

      "useGeoLocaleQueries": false,| useAmPm | false | If true, parse `time12`; else use `time24`. |

      "scrollRandomResults": true,| time12 | 9:00 AM | 12‑hour format time (only if useAmPm=true). |

      "clickRandomResults": true| time24 | 09:00 | 24‑hour format time (only if useAmPm=false). |

    }| timeZone | America/New_York | IANA zone string (e.g. Europe/Paris). |

  }| runImmediatelyOnStart | false | Run one pass instantly in addition to daily schedule. |

}

```_Legacy_: If both `time12` and `time24` are empty, a legacy `time` (HH:mm) may still be read.



### Diagnostics---

## update

```jsoncAuto-update behavior after a run.

{| Key | Default | Description |

  "diagnostics": {|-----|---------|-------------|

    "enabled": true,| git | true | Pull latest git changes after run. |

    "saveScreenshot": true,| docker | false | Recreate container (if running in Docker orchestration). |

    "saveHtml": true,| scriptPath | setup/update/update.mjs | Custom script executed for update flow. |

    "maxPerRun": 2,

    "retentionDays": 7---

  }## Security / Best Practices

}- Keep `redactEmails` true if you share logs publicly.

```- Use a private NTFY instance or secure Discord webhooks (do not leak URLs).

- Avoid setting `headless` false on untrusted remote servers.

### Job State

---

```jsonc## Minimal Example

{```jsonc

  "jobState": {{

    "enabled": true,  "browser": { "headless": true },

    "dir": ""  // Empty = use default location  "execution": { "parallel": false },

  }  "workers": { "doDailySet": true, "doDesktopSearch": true, "doMobileSearch": true },

}  "logging": { "redactEmails": true }

```}

```

### Auto-Update

## Common Tweaks

```jsonc| Goal | Change |

{|------|--------|

  "update": {| Faster dev feedback | Set `browser.headless` to false and shorten search delays. |

    "git": true,| Reduce detection risk | Keep humanization enabled, add vacation window. |

    "docker": false,| Silent mode | Add more buckets to `excludeFunc`. |

    "scriptPath": "setup/update/update.mjs"| Skip mobile searches | Set `workers.doMobileSearch=false`. |

  }| Use daily schedule | Set `schedule.enabled=true` and adjust `time24` + `timeZone`. |

}

```---

## NEW INTELLIGENT FEATURES

</details>

### riskManagement

---Dynamic risk assessment and ban prediction.



## 🎛️ Intelligent Features (v2.2+)| Key | Type | Default | Description |

|-----|------|---------|-------------|

### Risk Management| enabled | boolean | true | Enable risk-aware throttling. |

| autoAdjustDelays | boolean | true | Automatically increase delays when captchas/errors are detected. |

```jsonc| stopOnCritical | boolean | false | Stop execution if risk score exceeds threshold. |

{| banPrediction | boolean | true | Enable ML-style pattern analysis to predict ban risk. |

  "riskManagement": {| riskThreshold | number | 75 | Risk score (0-100) above which bot pauses or alerts. |

    "enabled": true,

    "autoAdjustDelays": true,**How it works:** Monitors captchas, errors, timeouts, and account patterns. Dynamically adjusts delays (e.g., 1x → 2.5x) and warns you before bans happen.

    "banPrediction": true,

    "riskThreshold": 75---

  }### analytics

}Performance dashboard and metrics tracking.

```

| Key | Type | Default | Description |

Dynamically adjusts delays when detecting captchas/errors.|-----|------|---------|-------------|

| enabled | boolean | true | Track points earned, success rates, execution times. |

---| retentionDays | number | 30 | How long to keep analytics data. |

| exportMarkdown | boolean | true | Generate human-readable markdown reports. |

### Query Diversity| webhookSummary | boolean | false | Send analytics summary via webhook. |



```jsonc**Output location:** `analytics/` folder (JSON files per account per day).

{

  "queryDiversity": {---

    "enabled": true,### queryDiversity

    "sources": ["google-trends", "reddit", "local-fallback"],Multi-source search query generation.

    "maxQueriesPerSource": 10

  }| Key | Type | Default | Description |

}|-----|------|---------|-------------|

```| enabled | boolean | true | Use diverse sources instead of just Google Trends. |

| sources | array | `["google-trends", "reddit", "local-fallback"]` | Which sources to query (google-trends, reddit, news, wikipedia, local-fallback). |

Uses multiple search sources to avoid patterns.| maxQueriesPerSource | number | 10 | Max queries to fetch per source. |

| cacheMinutes | number | 30 | Cache duration to avoid hammering APIs. |

---

**Why?** Reduces patterns by mixing Reddit posts, news headlines, Wikipedia topics instead of predictable Google Trends.

### Analytics

---

```jsonc### dryRun

{Test mode: simulate execution without actually running tasks.

  "analytics": {

    "enabled": true,| Key | Type | Default | Description |

    "retentionDays": 30,|-----|------|---------|-------------|

    "exportMarkdown": true| dryRun | boolean | false | When true, logs actions but doesn't execute (useful for testing config). |

  }

}**Use case:** Validate new config changes, estimate execution time, debug issues without touching accounts.

```

---

Tracks points earned, success rates, execution times.## Changelog Notes

- **v2.2.0**: Added risk-aware throttling, analytics dashboard, query diversity, ban prediction, dry-run mode.

---- Removed live webhook streaming complexity; now simpler logging.

- Centralized redaction logic under `logging.redactEmails`.

### Dry Run (Test Mode)

If something feels undocumented or unclear, open a documentation issue or extend this page.

```jsonc
{
  "dryRun": true
}
```

**Or via CLI:**
```bash
npm start -- --dry-run
```

Simulates execution without actually running tasks.

---

## 🛠️ Troubleshooting

| Issue | Solution |
|-------|----------|
| **Config not loading** | Check JSON syntax (trailing commas OK in `.jsonc`) |
| **Script ignoring config** | Verify file is `src/config.jsonc` |
| **Errors after update** | Compare with example config |

---

## 📚 Next Steps

**Setup scheduler?**  
→ **[Scheduler Guide](./schedule.md)**

**Want notifications?**  
→ **[Discord Webhooks](./conclusionwebhook.md)**

**Need proxies?**  
→ **[Proxy Guide](./proxy.md)**

---

**[← Back to Hub](./index.md)** | **[Getting Started](./getting-started.md)**
