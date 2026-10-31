# Setup and usage

[Overview](../README.md) · [Control API](control-api.md)

## Contents

- [Quick setup](#local-setup): local Node.js, [Nix](#nix) or [Docker](#docker).
- [Account setup and login sessions](#accounts-and-sessions).
- [Configuration examples](#configuration-examples) and [settings reference](#settings-reference).
- [Commands](#commands) and [updating/troubleshooting](#updating-and-troubleshooting).

## Local setup

1. Install **Node.js 24+**.
2. Extract the source ZIP, or clone the project:

```bash
git clone --branch v5 https://github.com/TheNetsky/Microsoft-Rewards-Script.git
cd Microsoft-Rewards-Script
```

3. Copy `env.example` to `.env` and enter your accounts.
4. Install dependencies, Chromium and the compiled runtime:

```bash
npm ci
npm run install:browser
npm run build
node dist/config/ConfigSync.js sync --patch
```

5. Edit `config.json`; use a [configuration example](#configuration-examples) if helpful.
6. Start the bot:

```bash
npm start
```

- Config sync creates a missing config or adds missing defaults; existing values stay in place.
- You may rename `config.example.json` to `config.json` for manual setup. It is only a template and can be absent.
- Linux dependency install: `npx patchright install --with-deps chromium`.
- A visible browser needs a graphical desktop. Linux without a display runs headlessly.

### Nix

Enable Nix flakes and run commands from the project directory.

1. Copy `env.example` to `.env` and add your accounts.
2. Keep your existing `config.json`, or use a [configuration example](#configuration-examples) below.
3. Run the launcher; a separate Node.js installation is unnecessary.

| Command                                                                 | Starts                                  |
| ----------------------------------------------------------------------- | --------------------------------------- |
| `bash scripts/nix/run.sh`                                               | Rewards bot, using the configured mode. |
| `bash scripts/nix/run.sh api`                                           | Control API.                            |
| `bash scripts/nix/run.sh manual-login user@example.com --platform both` | Interactive sign-in.                    |

The launcher installs pinned dependencies and Chromium, then builds. It supplies Chromium libraries on Linux; macOS uses the native runtime.

## Docker

1. Copy `env.example` to `.env` and add your accounts.
2. Edit the existing service in `compose.yaml`.
3. Start it:

```bash
docker compose up -d --build
docker compose logs -f
```

| Option in Compose `environment` | Example            | Meaning                                                |
| ------------------------------- | ------------------ | ------------------------------------------------------ |
| `TZ`                            | `Europe/Amsterdam` | Scheduler timezone.                                    |
| `CRON_SCHEDULE`                 | `0 7 * * *`        | Run daily at 07:00.                                    |
| `RUN_ON_START`                  | `false`            | Run immediately when the container starts.             |
| `SKIP_RANDOM_SLEEP`             | `false`            | Skip the random delay before scheduled runs when true. |
| `MIN_SLEEP_MINUTES`             | `5` (default)      | Minimum scheduled-run delay.                           |
| `MAX_SLEEP_MINUTES`             | `50` (default)     | Maximum scheduled-run delay.                           |
| `STUCK_PROCESS_TIMEOUT_HOURS`   | `8` (default)      | Timeout for an existing process.                       |
| `CONFIG_REWARDS_MODE`           | `browser`          | Rewards task transport: `browser` or `api`.            |
| `API_MODE`                      | `true`             | Enable the Control API alongside the scheduler.        |
| `CONFIG_AUTO_SYNC`              | `true`             | Add missing config defaults at startup.                |

- Docker runs headlessly in both rewards modes.
- Settings live at **`config/config.json` on the host**.
- First startup creates that file from built-in defaults.
- To reuse a local config, place it at `config/config.json` before starting.
- Keep the supplied `config`, `sessions` and `diagnostics` volume mounts.
- Saved schedules override `CRON_SCHEDULE`; see [API scheduling](control-api.md#scheduling).
- For manual API-only runs, disable the saved schedule, set `RUN_ON_START=false` and clear `CRON_SCHEDULE`.

Connect a dashboard using the [Docker API setup](control-api.md#docker).

To use a published v5 image, replace the service's `build:` block and `image:` with:

```yaml
image: ghcr.io/thenetsky/microsoft-rewards-script:5
```

Then use `docker compose pull` and `docker compose up -d`. Pin an exact `5.x.y`

## Accounts and sessions

Add one numbered block per account in `.env`:

```dotenv
ACCOUNT_1_EMAIL=user@example.com
# Omit the password for passwordless/Authenticator sign-in.
#ACCOUNT_1_PASSWORD=your-password
ACCOUNT_1_LANG_CODE=en
ACCOUNT_1_GEO_LOCALE=NL

ACCOUNT_2_EMAIL=another@example.com
#ACCOUNT_2_PASSWORD=another-password
```

- Repeat with `ACCOUNT_3_*`, `ACCOUNT_4_*`, etc.
- Gaps in slot numbers are allowed.
- Accounts are selected in slot order; `clusters` controls concurrency.
- Keep `.env` and saved sessions private.

### Account options

Replace `N` with the account slot number.

| Environment variable                 | Default  | Purpose                                          |
| ------------------------------------ | -------- | ------------------------------------------------ |
| `ACCOUNT_N_EMAIL`                    | Required | Microsoft account email.                         |
| `ACCOUNT_N_PASSWORD`                 | Empty    | Password; optional for passwordless sign-in.     |
| `ACCOUNT_N_TOTP_SECRET`              | Unset    | Authenticator TOTP secret, when used.            |
| `ACCOUNT_N_RECOVERY_EMAIL`           | Empty    | Recovery email for supported verification flows. |
| `ACCOUNT_N_LANG_CODE`                | `en`     | Browser language; examples: `nl`, `en`, `pt-BR`. |
| `ACCOUNT_N_GEO_LOCALE`               | `auto`   | Account country; examples: `NL`, `US`.           |
| `ACCOUNT_N_SAVE_FINGERPRINT_DESKTOP` | `true`   | Reuse the saved desktop browser identity.        |
| `ACCOUNT_N_SAVE_FINGERPRINT_MOBILE`  | `true`   | Reuse the saved mobile browser identity.         |
| `ACCOUNT_N_PROXY_URL`                | Empty    | Browser proxy URL.                               |
| `ACCOUNT_N_PROXY_PORT`               | `0`      | Separate proxy port when needed.                 |
| `ACCOUNT_N_PROXY_USERNAME`           | Empty    | HTTP/HTTPS proxy username.                       |
| `ACCOUNT_N_PROXY_PASSWORD`           | Empty    | HTTP/HTTPS proxy password.                       |
| `ACCOUNT_N_PROXY_HTTP`               | `false`  | Also proxy supported HTTP requests.              |

- `auto` caches the Microsoft profile country once available.
- Browser language applies to new tabs, popups and manual sessions; site language settings can take precedence.
- Query language is separate: `useAccountLocale=true` derives it from the account country.
- The browser supplies the rewards runtime timezone; Docker scheduling uses `TZ`.
- HTTP, HTTPS and unauthenticated SOCKS proxies are supported.

### Sign in without reward tasks

**Through the API:** [Regenerate sessions](control-api.md#regenerate-sessions) for all accounts or one slot.

**On a graphical desktop:**

```bash
npm run manual-login -- user@example.com --platform both --fresh
```

1. Complete sign-in in each browser.
2. Wait for the saved-session message.
3. The browser closes automatically after verification.

| Option               | Behavior                                   |
| -------------------- | ------------------------------------------ |
| `--platform desktop` | Desktop session only.                      |
| `--platform mobile`  | Mobile session only; manual-login default. |
| `--platform both`    | Both sessions, one at a time.              |
| `--fresh`            | Ignore saved cookies while signing in.     |

- Failed verification or cancellation preserves existing saved sessions.
- Automated runs reuse compatible sessions and sign in again when needed.
- API-mode browsers close before reward tasks run.
- Background API/Docker jobs cannot prompt for email codes through stdin; use manual login for that interaction.
- Stop active runs before deleting sessions.

## Configuration examples

Copy the listed values into the matching fields in `config.json`. Keep other settings and sibling fields in nested objects.

For a new `config.json`, a snippet can be the whole starting file. Missing settings use built-in defaults.

### Browser, sequential sessions

```json
{
    "rewardsMode": "browser",
    "headless": false,
    "clusters": 1,
    "searchSettings": {
        "parallelSearching": false,
        "maxSearchOnBingAttempts": 3
    }
}
```

### API, sequential sessions

```json
{
    "rewardsMode": "api",
    "headless": true,
    "clusters": 1,
    "searchSettings": {
        "parallelSearching": false,
        "maxSearchOnBingAttempts": 3
    }
}
```

### Activities only

Disables regular, bonus and Explore search workers, Visual Search and optional search experiments.

```json
{
    "workers": {
        "doDailySet": true,
        "doClaimBonusPoints": true,
        "doMorePromotions": true,
        "doPunchCards": true,
        "doAppPromotions": true,
        "doDailyCheckIn": true,
        "doReadToEarn": true,
        "doDesktopSearch": false,
        "doMobileSearch": false,
        "doBonusSearches": false,
        "doActivateSearchPerk": false,
        "doVisualSearch": false
    },
    "activities": {
        "searchOnBing": false
    },
    "experimental": {
        "edgeBrowsing": false,
        "browserSearchApiReport": false
    }
}
```

### Longer pauses

Combine with either rewards mode.

```json
{
    "accountDelay": { "min": "2min", "max": "5min" },
    "taskDelay": { "min": "30sec", "max": "1min" },
    "searchSettings": {
        "searchDelay": { "min": "45sec", "max": "90sec" },
        "readDelay": { "min": "30sec", "max": "1min" }
    }
}
```

## Settings reference

Defaults below come from the built-in configuration. Environment columns work in `.env` or Compose `environment:`.

- Edit `config.json`; changes apply to the **next run**.
- Durations accept strings such as `"30sec"` or numbers in milliseconds.
- Delay `max` must be at least `min`.
- Missing/invalid settings fall back with a warning; malformed JSON must be fixed.

### General

| Setting                     | Default       | Purpose                                                   | Environment override                                    |
| --------------------------- | ------------- | --------------------------------------------------------- | ------------------------------------------------------- |
| `rewardsMode`               | `"browser"`   | Rendered controls or `"api"` HTTP tasks.                  | `CONFIG_REWARDS_MODE`                                   |
| `sessionPath`               | `"sessions"`  | Saved-session directory.                                  | -                                                       |
| `headless`                  | `false`       | Hide the browser window.                                  | `CONFIG_HEADLESS`                                       |
| `clusters`                  | `1`           | Concurrent accounts; positive whole number.               | `CONFIG_CLUSTERS`                                       |
| `accountDelay`              | `1min–3min`   | Gap between sequential accounts.                          | `CONFIG_ACCOUNT_DELAY_MIN` / `CONFIG_ACCOUNT_DELAY_MAX` |
| `taskDelay`                 | `15sec–30sec` | Gap between individual reward tasks.                      | `CONFIG_TASK_DELAY_MIN` / `CONFIG_TASK_DELAY_MAX`       |
| `globalTimeout`             | `"30sec"`     | Browser actions and account-data request budget.          | `CONFIG_GLOBAL_TIMEOUT`                                 |
| `ensureStreakProtection`    | `true`        | Enable available streak protection.                       | `CONFIG_ENSURE_STREAK_PROTECTION`                       |
| `autoClaimPunchcardRewards` | `false`       | Claim completed punchcard rewards automatically.          | `CONFIG_AUTO_CLAIM_PUNCHCARD_REWARDS`                   |
| `continueOnBotWarning`      | `false`       | Allow continuing after an explicit Microsoft bot warning. | `CONFIG_CONTINUE_ON_BOT_WARNING`                        |
| `skipNonPointTasks`         | `true`        | Skip activities with no advertised points.                | `CONFIG_SKIP_NON_POINT_TASKS`                           |
| `searchOnBingLocalQueries`  | `false`       | Use bundled Explore on Bing queries.                      | `CONFIG_SEARCH_ON_BING_LOCAL`                           |
| `debugLogs`                 | `false`       | Extra diagnostic output.                                  | `CONFIG_DEBUG_LOGS`                                     |
| `errorDiagnostics`          | `false`       | Save available sanitized diagnostics.                     | `CONFIG_ERROR_DIAGNOSTICS`                              |

Streak protection is checked once per account over the API in both modes. If it cannot be enabled
or verified, including when no protection days remain, a warning is recorded and other tasks continue.

**Task pacing**

- Each Daily Set item gets its own `taskDelay`.
- The gap also applies across promotions, punchcard steps and app tasks.
- Failed tasks keep the gap; skipped tasks add no new gap.
- Parallel desktop/mobile work keeps separate pacing.
- Set both delay bounds to `0` to disable task spacing.
- Searches and article reads use their own delays below.

### Workers

Set these fields inside `workers`. Enabled workers run when supported by the account.

| Worker                 | Default | Activity                       | Environment override                 |
| ---------------------- | ------- | ------------------------------ | ------------------------------------ |
| `doDailySet`           | `true`  | Daily Set items.               | `CONFIG_WORKER_DAILY_SET`            |
| `doMorePromotions`     | `true`  | Additional promotions.         | `CONFIG_WORKER_MORE_PROMOTIONS`      |
| `doPunchCards`         | `true`  | Punchcard steps.               | `CONFIG_WORKER_PUNCH_CARDS`          |
| `doClaimBonusPoints`   | `true`  | Claim available bonus points.  | `CONFIG_WORKER_CLAIM_BONUS_POINTS`   |
| `doAppPromotions`      | `true`  | App-platform promotions.       | `CONFIG_WORKER_APP_PROMOTIONS`       |
| `doDailyCheckIn`       | `true`  | Daily Check-In.                | `CONFIG_WORKER_DAILY_CHECKIN`        |
| `doReadToEarn`         | `true`  | Read to Earn articles.         | `CONFIG_WORKER_READ_TO_EARN`         |
| `doDesktopSearch`      | `true`  | Desktop search quota.          | `CONFIG_WORKER_DESKTOP_SEARCH`       |
| `doMobileSearch`       | `true`  | Mobile search quota.           | `CONFIG_WORKER_MOBILE_SEARCH`        |
| `doBonusSearches`      | `false` | Bonus search offers.           | `CONFIG_WORKER_BONUS_SEARCHES`       |
| `doActivateSearchPerk` | `true`  | Search-perk activation.        | `CONFIG_WORKER_ACTIVATE_SEARCH_PERK` |
| `doVisualSearch`       | `false` | Visual Search streak activity. | `CONFIG_WORKER_VISUAL_SEARCH`        |

Daily Check-In runs once per account before Read to Earn. A fresh streak/promotion check skips
completed check-ins, including after a restart; completion is verified from refreshed state or balance.
Bonus claims are submitted only when a positive claimable total is known. Browser cards use flyout,
`/earn` and `/dashboard` fallbacks; controls that still match ambiguously are left untouched.

Inside `activities`:

| Setting        | Default | Controls                    | Environment override             |
| -------------- | ------- | --------------------------- | -------------------------------- |
| `urlReward`    | `true`  | URL-reward activities.      | `CONFIG_ACTIVITY_URL_REWARD`     |
| `searchOnBing` | `true`  | Explore on Bing activities. | `CONFIG_ACTIVITY_SEARCH_ON_BING` |

### Search settings

Set these fields inside `searchSettings`.

| Setting                   | Default                                              | Purpose                                                         | Environment override                                            |
| ------------------------- | ---------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| `parallelSearching`       | `true`                                               | Overlap desktop and mobile work.                                | `CONFIG_SEARCH_PARALLEL`                                        |
| `searchDelay`             | `30sec–1min`                                         | Gap between searches.                                           | `CONFIG_SEARCH_DELAY_MIN` / `CONFIG_SEARCH_DELAY_MAX`           |
| `readDelay`               | `30sec–1min`                                         | Article-reading pause.                                          | `CONFIG_SEARCH_READ_DELAY_MIN` / `CONFIG_SEARCH_READ_DELAY_MAX` |
| `maxSearchOnBingAttempts` | `3`                                                  | Explore searches per offer; positive whole number.              | `CONFIG_SEARCH_ON_BING_MAX_ATTEMPTS`                            |
| `maxBonusSearches`        | `110`                                                | Bonus search ceiling; `0` disables, maximum `1000`.             | `CONFIG_SEARCH_MAX_BONUS_SEARCHES`                              |
| `runOnZeroPoints`         | `false`                                              | Allow bounded searches when no search points remain.            | `CONFIG_SEARCH_RUN_ON_ZERO_POINTS`                              |
| `clusterSearch`           | `true`                                               | Add related Bing suggestions to each topic.                     | `CONFIG_SEARCH_CLUSTER`                                         |
| `useAccountLocale`        | `true`                                               | Prefer query language/country derived from the account country. | `CONFIG_SEARCH_USE_ACCOUNT_LOCALE`                              |
| `queryEngines`            | `["google", "local", "wikipedia", "rss.googleNews"]` | Topic sources; at least one.                                    | `CONFIG_SEARCH_QUERY_ENGINES`                                   |
| `scrollRandomResults`     | `false`                                              | Optional results-page scrolling in browser mode.                | `CONFIG_SEARCH_SCROLL_RANDOM`                                   |
| `clickRandomResults`      | `false`                                              | Optional result visits in browser mode.                         | `CONFIG_SEARCH_CLICK_RANDOM`                                    |
| `searchResultVisitTime`   | `"10sec"`                                            | Time spent on an optional result visit.                         | `CONFIG_SEARCH_VISIT_TIME`                                      |

**Search behavior**

- Explore's budget is shared across flyout, earn and mobile passes; failures count.
- The budget resets for the next account run.
- Regular/bonus browser submissions allow up to five attempts per query.
- Browser points checks run every **four searches**, plus a final check.
- A crashed Bing tab is replaced in the same session.
- Crashed optional result visits close their popups and produce a warning.
- Browser clicks use Ghostclick; scrolling uses the shared mouse-wheel routine.
- Consent messages are handled before controls; blocked consent leaves the task incomplete.

### Query sources

| Value                                 | Topics                                                    |
| ------------------------------------- | --------------------------------------------------------- |
| `google`                              | Google trend topics.                                      |
| `local`                               | Bundled [local queries](../src/data/search-queries.json). |
| `wikipedia`                           | Wikipedia topic source.                                   |
| `wikirandom`                          | Random Wikipedia topics.                                  |
| `hackernews`                          | Hacker News topics.                                       |
| `reddit`                              | Reddit topics.                                            |
| `rss`                                 | Regional Google feeds and configured RSS feeds.           |
| `rss.googleTrends` / `rss.googleNews` | Regional Google trends/news.                              |
| `rss.bbc`                             | All configured BBC feeds.                                 |
| `rss.bbc.technology`                  | One named feed.                                           |

RSS selectors follow `rss`, `rss.<site>` or `rss.<site>.<feed>`; see the [feed list](../src/constants/rssFeeds.ts).

- `useAccountLocale=false` uses English/US query preferences.
- A source can return another language or have unknown language metadata.
- Normal search logs show the selected query's language and source.
- Debug logs add the parent topic and source URL.

```text
[SEARCH-BING] Searching | search=1 | query="alexander zverev" | language=nl | source=rss.googleTrends | progressCheckEvery=4
```

### Experiments and proxies

Set experiment fields inside `experimental`; all default to `false`.

| Setting                  | Behavior                                                                                             | Environment override                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `blockMedia`             | Block browser image/video/audio requests.                                                            | `CONFIG_EXPERIMENTAL_BLOCK_MEDIA`               |
| `edgeBrowsing`           | Run the background Edge API worker in either rewards mode.                                           | `CONFIG_EXPERIMENTAL_EDGE_BROWSING`             |
| `browserSearchApiReport` | Check today's Bing Search Streak; send one desktop API search/report if completion is not confirmed. | `CONFIG_EXPERIMENTAL_BROWSER_SEARCH_API_REPORT` |

- The report runs after the desktop search phase, including full quotas or a disabled desktop search worker.
- A fresh Bing Search Streak check skips today's completed streak, including after a restart.
  Otherwise, at most one request is sent. Verification does not resubmit it.
- Cancelled/deferred accounts stop without more work.
- API rewards mode ignores this experiment.

Inside `proxy`:

| Setting                   | Default | Purpose                                                                    | Environment override                     |
| ------------------------- | ------- | -------------------------------------------------------------------------- | ---------------------------------------- |
| `queryEngine`             | `true`  | Apply the account proxy to supported topic-source requests.                | `CONFIG_PROXY_QUERY_ENGINE`              |
| `ignoreCertificateErrors` | `false` | Disable TLS verification for a deliberately configured intercepting proxy. | `CONFIG_PROXY_IGNORE_CERTIFICATE_ERRORS` |

### Logs and notifications

Completed Bing Search, Daily Set, Edge Browsing, Bing App, and Visual Search streaks produce green completion logs.
When Rewards supplies the cycle count, the message includes `streak=4/7` (completed days / total days).
The same completion is not repeated on every snapshot poll; logging resets for each account run.
Browser mode refreshes streaks before closing its active browser. Unavailable or incomplete streaks are not logged as completed.

| Result        | Meaning                                                    |
| ------------- | ---------------------------------------------------------- |
| `confirmed`   | Completion verified; credited amount may still be unknown. |
| `unconfirmed` | Expected work could not be confirmed.                      |
| `failed`      | The operation failed.                                      |
| `skipped`     | Already done, unavailable, disabled or not applicable.     |

- Green logs show confirmed completions or verified credit.
- Read to Earn shows each verified credit; pending checks are informational.
- Missing point evidence shows `unknown`, not a guessed reward amount.
- The API separates incomplete work from unavailable/not-applicable activities.
- Popups opened by rewards, result visits and MSN reads are cleaned up per click.
- Diagnostics are saved under `diagnostics/`; review them before sharing.

**Log filters**

Use `consoleLogFilter` for console output and `webhook.webhookLogFilter` for notifications.

| Field           | Values or example                                           |
| --------------- | ----------------------------------------------------------- |
| `enabled`       | `false` by default; `true` enables the filter.              |
| `mode`          | `"whitelist"` keeps matches; `"blacklist"` removes matches. |
| `levels`        | `["info", "warn", "error"]`; `"debug"` is also supported.   |
| `keywords`      | `["Finished account"]`                                      |
| `regexPatterns` | `["SEARCH-.*"]`                                             |

A match in any level, keyword or regex rule counts. Debug console output still requires `debugLogs=true` or `-dev`.

- Console filter overrides: `CONFIG_LOG_FILTER_ENABLED`, `CONFIG_LOG_FILTER_MODE`, `CONFIG_LOG_FILTER_LEVELS`, `CONFIG_LOG_FILTER_KEYWORDS`.
- Webhook filter overrides: `CONFIG_WEBHOOK_LOG_FILTER_ENABLED`, `CONFIG_WEBHOOK_LOG_FILTER_MODE`, `CONFIG_WEBHOOK_LOG_FILTER_LEVELS`, `CONFIG_WEBHOOK_LOG_FILTER_KEYWORDS`.
- Keep `regexPatterns` in JSON.

**Notification services**

Set each service under `webhook`.

Environment names use `CONFIG_DISCORD_*`, `CONFIG_TELEGRAM_*` or `CONFIG_NTFY_*`; see the examples below.

| Service    | Enable and configure            | Optional fields                               |
| ---------- | ------------------------------- | --------------------------------------------- |
| `discord`  | `enabled`, `url`                | -                                             |
| `telegram` | `enabled`, `botToken`, `chatId` | -                                             |
| `ntfy`     | `enabled`, `url`                | `topic`, `token`, `title`, `tags`, `priority` |

- All services are disabled by default.
- ntfy defaults: title `Microsoft-Rewards-Script`, tags `["bot", "notify"]`, priority `3` on a `1–5` scale.
- Technical debug output is kept out of notification webhooks.

Example Discord settings:

```json
{
    "webhook": {
        "discord": {
            "enabled": true,
            "url": "https://discord.com/api/webhooks/WEBHOOK_ID/WEBHOOK_TOKEN"
        }
    }
}
```

Equivalent Discord environment settings:

```dotenv
CONFIG_DISCORD_ENABLED=true
CONFIG_DISCORD_URL=https://discord.com/api/webhooks/WEBHOOK_ID/WEBHOOK_TOKEN
```

Other notification examples:

```dotenv
CONFIG_TELEGRAM_ENABLED=true
CONFIG_TELEGRAM_BOTTOKEN=your-bot-token
CONFIG_TELEGRAM_CHATID=your-chat-id

CONFIG_NTFY_ENABLED=true
CONFIG_NTFY_URL=https://ntfy.sh
CONFIG_NTFY_TOPIC=your-topic
```

### Environment overrides

`CONFIG_*` values in `.env` or the process environment override JSON settings.

```dotenv
CONFIG_REWARDS_MODE=browser
CONFIG_GLOBAL_TIMEOUT=60sec
CONFIG_TASK_DELAY_MIN=15sec
CONFIG_TASK_DELAY_MAX=30sec
CONFIG_SEARCH_ON_BING_MAX_ATTEMPTS=3
CONFIG_SEARCH_PARALLEL=false
CONFIG_SEARCH_QUERY_ENGINES=google,local,wikipedia,rss.googleNews
```

- Arrays use comma-separated values.
- For automated runs, `FORCE_HEADLESS=true` forces a hidden browser.
- Put regex filters in JSON.
- Compose `environment:` values take precedence over `env_file` values.
- Restart the API after changing account/environment values; recreate Docker containers for environment changes.
- An API config write cannot override an active `CONFIG_*` value.

List every supported override:

```bash
node dist/config/ConfigEnvOverrides.js list
node dist/config/ConfigEnvOverrides.js list --format env
```

## Commands

| Command                                                       | Purpose                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------ |
| `npm start`                                                   | Run the compiled bot once.                                   |
| `npm run ts-start`                                            | Run directly from TypeScript.                                |
| `npm run dev`                                                 | TypeScript run with debug logs.                              |
| `npm run api`                                                 | Start the Control API.                                       |
| `npm run dev:api`                                             | Build and start the API.                                     |
| `npm run manual-login -- user@example.com --platform both`    | Create sessions without tasks.                               |
| `npm run open-session -- user@example.com --platform desktop` | Inspect a saved session.                                     |
| `npm run clear-sessions -- list`                              | List saved sessions.                                         |
| `npm run clear-sessions -- email user@example.com`            | Delete one account's sessions.                               |
| `npm run clear-sessions -- all`                               | Delete all saved sessions.                                   |
| `npm run clear-diagnostics`                                   | Delete captured diagnostics.                                 |
| `npm run kill-chrome-win`                                     | Windows: close instances of the bundled Chromium executable. |
| `npm run install:browser`                                     | Install matching Chromium.                                   |
| `npm run build`                                               | Compile and copy runtime assets.                             |
| `npm run pre-build`                                           | Install lockfile dependencies and matching Chromium.         |
| `npm run create-docker`                                       | Build the Docker image.                                      |
| `npm run check`                                               | Build, API type checks, lint and formatting.                 |
| `npm run check:api`                                           | Type-check the API JavaScript.                               |
| `npm run lint` / `npm run lint:fix`                           | Check/fix code style.                                        |
| `npm run format:check` / `npm run format`                     | Check/apply formatting.                                      |

## Updating and troubleshooting

1. Keep `.env`, `config.json`, `config/` and `sessions/`.
2. Replace source files.
3. Reinstall and rebuild:

```bash
npm ci
npm run install:browser
npm run build
node dist/config/ConfigSync.js sync --patch
```

4. Restart the bot/API. For Docker, run `docker compose up -d --build`.

Config sync uses built-in defaults and backs up an existing config when patching it.

| Problem                      | Next step                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------- |
| Chromium executable missing  | Run `npm run install:browser`.                                                  |
| Login needs interaction      | Create sessions with `manual-login`.                                            |
| Saved sign-in is broken      | Delete that account's sessions, then sign in again.                             |
| Task is unavailable          | Check its category/reason; unavailable skips are informational.                 |
| Task remains incomplete      | Inspect its reason and logs; request success alone does not confirm completion. |
| Page/request times out       | Increase `globalTimeout`; enable debug logs if needed.                          |
| Repeated renderer crashes    | Check host RAM and container limits; search-tab recovery is automatic.          |
| API/dashboard cannot connect | Check host, port and token in the [API guide](control-api.md).                  |
