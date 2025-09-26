# ⚙️ Configuration Guide

This page documents every field in `config.json`. You can keep the file lean by deleting blocks you do not use – missing values fall back to defaults. Comments (`// ...`) are supported in the JSON thanks to a custom parser.

> NOTE: Previous versions had `logging.live` (live streaming webhook); it was removed and replaced by a simple `logging.redactEmails` flag.

---
## Top-Level Fields

### baseURL
Internal Microsoft Rewards base. Leave it unless you know what you are doing.

### sessionPath
Directory where session data (cookies / fingerprints / job-state) is stored.

---
## browser
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| headless | boolean | false | Run browser UI-less. Setting to `false` can improve stability or help visual debugging. |
| globalTimeout | string/number | "30s" | Max time for common Playwright operations. Accepts ms number or time string (e.g. `"45s"`, `"2min"`). |

---
## execution
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| parallel | boolean | false | Run desktop + mobile simultaneously (higher resource usage). |
| runOnZeroPoints | boolean | false | Skip full run early if there are zero points available (saves time). |
| clusters | number | 1 | Number of process clusters (multi-process concurrency). |
| passesPerRun | number | 1 | Advanced: extra full passes per started run. |

---
## buyMode
Manual redeem / purchase assistance.
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| enabled (CLI `-buy`) | boolean | false | Enable buy mode (usually via CLI argument). |
| maxMinutes | number | 45 | Max session length for buy mode. |

---
## fingerprinting.saveFingerprint
Persist browser fingerprints per device type for consistency.
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| mobile | boolean | false | Save/reuse a consistent mobile fingerprint. |
| desktop | boolean | false | Save/reuse a consistent desktop fingerprint. |

---
## search
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| useLocalQueries | boolean | false | Use locale-specific query sources instead of global ones. |

### search.settings
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| useGeoLocaleQueries | boolean | false | Blend geo / locale into chosen queries. |
| scrollRandomResults | boolean | true | Random scroll during search pages to look natural. |
| clickRandomResults | boolean | true | Occasionally click safe results. |
| retryMobileSearchAmount | number | 2 | Retries if mobile searches didn’t yield points. |
| delay.min / delay.max | string/number | 3–5min | Delay between searches (ms or time string). |

---
## humanization
Human‑like behavior simulation.
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| enabled | boolean | true | Global on/off. |
| stopOnBan | boolean | true | Stop processing further accounts if a ban is detected. |
| immediateBanAlert | boolean | true | Fire notification immediately upon ban detection. |
| actionDelay.min/max | number/string | 150–450ms | Random micro-delay per action. |
| gestureMoveProb | number | 0.4 | Probability of a small mouse move gesture. |
| gestureScrollProb | number | 0.2 | Probability of a small scroll gesture. |
| allowedWindows | string[] | [] | Local time windows (e.g. `["08:30-11:00","19:00-22:00"]`). Outside windows, run waits. |

---
## vacation
Random contiguous block of days off per month.
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| enabled | boolean | false | Activate monthly break behavior. |
| minDays | number | 3 | Minimum skipped days per month. |
| maxDays | number | 5 | Maximum skipped days per month. |

---
## retryPolicy
Generic transient retry/backoff.
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| maxAttempts | number | 3 | Max tries for retryable blocks. |
| baseDelay | number | 1000 | Initial delay in ms. |
| maxDelay | number/string | 30s | Max backoff delay. |
| multiplier | number | 2 | Exponential backoff multiplier. |
| jitter | number | 0.2 | Randomization factor (0..1). |

---
## workers
Enable/disable scripted task categories.
| Key | Default | Description |
|-----|---------|-------------|
| doDailySet | true | Daily set activities. |
| doMorePromotions | true | Promotional tasks. |
| doPunchCards | true | Punch card flows. |
| doDesktopSearch | true | Desktop searches. |
| doMobileSearch | true | Mobile searches. |
| doDailyCheckIn | true | Daily check-in. |
| doReadToEarn | true | Reading tasks. |
| bundleDailySetWithSearch | false | Immediately start desktop search bundle after daily set. |

---
## proxy
| Key | Default | Description |
|-----|---------|-------------|
| proxyGoogleTrends | true | Route Google Trends fetch through proxy if set. |
| proxyBingTerms | true | Route Bing query source fetch through proxy if set. |

---
## notifications
Manages notification channels (Discord webhooks, NTFY, etc.).

### notifications.webhook
Primary webhook (can be used for summary or generic messages).
| Key | Default | Description |
|-----|---------|-------------|
| enabled | false | Allow sending webhook-based notifications. |
| url | "" | Webhook endpoint. |

### notifications.conclusionWebhook
Rich end-of-run summary (if enabled separately).
| Key | Default | Description |
|-----|---------|-------------|
| enabled | false | Enable run summary posting. |
| url | "" | Webhook endpoint. |

### notifications.ntfy
Lightweight push notifications.
| Key | Default | Description |
|-----|---------|-------------|
| enabled | false | Enable NTFY push. |
| url | "" | Base NTFY server URL (e.g. https://ntfy.sh). |
| topic | rewards | Topic/channel name. |
| authToken | "" | Bearer token if your server requires auth. |

---
## logging
| Key | Type | Description |
|-----|------|-------------|
| excludeFunc | string[] | Log buckets suppressed in console + any webhook usage. |
| webhookExcludeFunc | string[] | Buckets suppressed specifically for webhook output. |
| redactEmails | boolean | If true, email addresses are partially masked in logs. |

_Removed fields_: `live.enabled`, `live.url`, `live.redactEmails` — replaced by `redactEmails` only.

---
## diagnostics
Capture evidence when something fails.
| Key | Default | Description |
|-----|---------|-------------|
| enabled | true | Master switch for diagnostics. |
| saveScreenshot | true | Save screenshot on failure. |
| saveHtml | true | Save HTML snapshot on failure. |
| maxPerRun | 2 | Cap artifacts per run per failure type. |
| retentionDays | 7 | Old run artifacts pruned after this many days. |

---
## jobState
Checkpoint system to avoid duplicate work.
| Key | Default | Description |
|-----|---------|-------------|
| enabled | true | Enable job state tracking. |
| dir | "" | Custom directory (default: `<sessionPath>/job-state`). |

---
## schedule
Built-in scheduler (avoids external cron inside container or host).
| Key | Default | Description |
|-----|---------|-------------|
| enabled | false | Enable scheduling loop. |
| useAmPm | false | If true, parse `time12`; else use `time24`. |
| time12 | 9:00 AM | 12‑hour format time (only if useAmPm=true). |
| time24 | 09:00 | 24‑hour format time (only if useAmPm=false). |
| timeZone | America/New_York | IANA zone string (e.g. Europe/Paris). |
| runImmediatelyOnStart | false | Run one pass instantly in addition to daily schedule. |

_Legacy_: If both `time12` and `time24` are empty, a legacy `time` (HH:mm) may still be read.

---
## update
Auto-update behavior after a run.
| Key | Default | Description |
|-----|---------|-------------|
| git | true | Pull latest git changes after run. |
| docker | false | Recreate container (if running in Docker orchestration). |
| scriptPath | setup/update/update.mjs | Custom script executed for update flow. |

---
## Security / Best Practices
- Keep `redactEmails` true if you share logs publicly.
- Use a private NTFY instance or secure Discord webhooks (do not leak URLs).
- Avoid setting `headless` false on untrusted remote servers.

---
## Minimal Example
```jsonc
{
  "browser": { "headless": true },
  "execution": { "parallel": false },
  "workers": { "doDailySet": true, "doDesktopSearch": true, "doMobileSearch": true },
  "logging": { "redactEmails": true }
}
```

## Common Tweaks
| Goal | Change |
|------|--------|
| Faster dev feedback | Set `browser.headless` to false and shorten search delays. |
| Reduce detection risk | Keep humanization enabled, add vacation window. |
| Silent mode | Add more buckets to `excludeFunc`. |
| Skip mobile searches | Set `workers.doMobileSearch=false`. |
| Use daily schedule | Set `schedule.enabled=true` and adjust `time24` + `timeZone`. |

---
## Changelog Notes
- Removed live webhook streaming complexity; now simpler logging.
- Centralized redaction logic under `logging.redactEmails`.

If something feels undocumented or unclear, open a documentation issue or extend this page.
