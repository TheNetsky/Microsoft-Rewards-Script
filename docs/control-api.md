# Control API

[Overview](../README.md) · [Setup and settings](usage.md)

The Control API manages one rewards run or session-generation job at a time. A dashboard connects over HTTP; the frontend is a separate project.

## Contents

- [Setup](#start-the-api): local server or [Docker](#docker).
- [Authentication and options](#authentication-and-server-options).
- [Request examples](#request-examples) and [all endpoints](#endpoints).
- [Run control](#run-control) and [login-session generation](#regenerate-sessions).
- [Configuration](#configuration) and [scheduling](#scheduling).
- [Dashboard data](#dashboard-data), [live events](#live-events) and [errors](#errors-and-limits).

> [!NOTE]
> `rewardsMode=api` selects how reward tasks run. The Control API is a separate server and works with either rewards mode.

## Start the API

Complete [local setup](usage.md#local-setup), then generate a token:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add the token to `.env`:

```dotenv
API_TOKEN=replace-with-generated-token
API_HOST=127.0.0.1
API_PORT=3010
```

Start the server:

```bash
npm run api
```

- Local API startup waits for requests; it starts no rewards run or scheduler.
- `rewardsMode` still selects `browser` or `api` tasks.
- Nix: `bash scripts/nix/run.sh api`.
- Rebuild and start: `npm run dev:api`.
- CLI options: `--host`, `--port`, `--token`; see `npm run api -- --help`.

### Docker

Edit the existing service in `compose.yaml`; keep its volumes and `env_file`.

```yaml
environment:
    API_MODE: 'true'
    API_TOKEN: '${API_TOKEN}'
    RUN_ON_START: 'false'
    CRON_SCHEDULE: ''
    # Enable only the write capabilities you need:
    # API_ALLOW_CONFIG_WRITE: 'true'
    # API_ALLOW_SCHEDULE_WRITE: 'true'
ports:
    - '127.0.0.1:3010:3010'
```

```bash
docker compose up -d --build
```

- Host dashboard URL: `http://127.0.0.1:3010`.
- Dashboard backend in the same Compose network: `http://microsoft-rewards-script:3010`.
- Configure the same token in the dashboard.
- Docker listens on `0.0.0.0` inside the container; the mapping above exposes host loopback.
- Keep Compose `stop_grace_period` longer than the configured API stop timeout.
- `API_MODE` does not disable scheduling. Disable any saved schedule for manual-only runs.

## Authentication and server options

Send either header:

```text
Authorization: Bearer YOUR_TOKEN
X-API-Key: YOUR_TOKEN
```

- A configured token protects all application endpoints.
- Remote/non-loopback binding requires a token.
- Without a token, only trusted loopback hosts and the configured local origin are accepted.
- CORS preflight `OPTIONS` does not need a token.
- Browser EventSource may use `?token=` on `/events` only.
- Use a trusted HTTPS reverse proxy for access across machines.

Set server options in `.env` or Compose and restart/recreate the server.

| Variable                   | Default                                           | Purpose                                                         |
| -------------------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| `API_HOST`                 | Local `127.0.0.1`; Docker `0.0.0.0`               | Listen address.                                                 |
| `API_PORT`                 | `3010`                                            | Listen port, `1–65535`.                                         |
| `API_TOKEN`                | Unset                                             | Shared token.                                                   |
| `API_CORS_ORIGIN`          | `*` with token; otherwise `http://localhost:3000` | Allowed browser origin.                                         |
| `API_LOG_BUFFER`           | `2000`                                            | Retained log entries.                                           |
| `API_RUN_HISTORY`          | `20`                                              | Retained completed-run summaries.                               |
| `API_STOP_TIMEOUT_MS`      | `15000`                                           | Graceful-stop budget before forcing exit.                       |
| `API_DIAGNOSTICS_DIR`      | Project `diagnostics/`                            | Diagnostic directory.                                           |
| `API_ALLOW_CONFIG_WRITE`   | `false`                                           | Config writes and default sync.                                 |
| `API_ALLOW_SCHEDULE_WRITE` | `false`                                           | Schedule writes; needs Docker cron.                             |
| `API_ALLOW_CONFIG_REVEAL`  | `false`                                           | Unredacted config reads; also needs a token.                    |
| `API_ALLOW_ENV_OVERRIDES`  | `false`                                           | Supported per-job environment overrides.                        |
| `API_RUN_COMMAND`          | Unset                                             | Advanced: custom rewards executable.                            |
| `API_RUN_ARGS`             | Unset                                             | Advanced: JSON array or whitespace-separated rewards arguments. |

- Normal launches use the compiled bot; custom launch settings affect rewards runs only.
- Environment host/token values take precedence over their CLI options.
- Explicit CLI `--port` takes precedence over `API_PORT`.

## Request examples

Bash, Git Bash or WSL:

```bash
API_URL='http://127.0.0.1:3010'
API_TOKEN='replace-with-your-api-token'

curl "$API_URL/health" -H "Authorization: Bearer $API_TOKEN"
curl "$API_URL/accounts" -H "Authorization: Bearer $API_TOKEN"
curl "$API_URL/status" -H "Authorization: Bearer $API_TOKEN"
```

PowerShell:

```powershell
$api = 'http://127.0.0.1:3010'
$headers = @{ Authorization = 'Bearer replace-with-your-api-token' }
Invoke-RestMethod "$api/health" -Headers $headers
Invoke-RestMethod "$api/start" -Method Post -Headers $headers -ContentType 'application/json' -Body '{}'
```

Run-control and regeneration requests return **202 Accepted**.

- Check status/events for completion.
- After a lost response, check `/status` before repeating a start, restart or regeneration.
- Treat unknown/omitted response fields as unknown; tolerate added fields.

## Endpoints

`GET /` lists all **28 method/path combinations**. JSON reads return 200 unless noted; `/events` streams SSE and diagnostic downloads return files.

### Monitoring

| Method | Path          | Returns                                                                    |
| ------ | ------------- | -------------------------------------------------------------------------- |
| GET    | `/`           | Version, auth requirement and endpoint list.                               |
| GET    | `/health`     | Health, process state and uptime.                                          |
| GET    | `/status`     | Process state, active/finished run and `lastExit`.                         |
| GET    | `/plan`       | Effective execution plan and config warnings.                              |
| GET    | `/points`     | Balances, verified/unknown gains and account details.                      |
| GET    | `/logs`       | Retained logs and cursor metadata.                                         |
| GET    | `/errors`     | Errors and, by default, warnings.                                          |
| GET    | `/history`    | Persisted completed-run summaries.                                         |
| GET    | `/accounts`   | Account slots, metadata and retained statistics.                           |
| GET    | `/events`     | Live SSE status, logs and exit events.                                     |
| POST   | `/docker-log` | Internal Docker wrapper log ingestion; returns 202 `{ "accepted": true }`. |

| Read option                        | Default / behavior                                    |
| ---------------------------------- | ----------------------------------------------------- |
| `/logs?limit=200`                  | Most recent entries.                                  |
| `/logs?afterId=123&limit=200`      | First matching entries after that log ID.             |
| `/logs?level=info`                 | Minimum severity: `debug`, `info`, `warn` or `error`. |
| `/errors?limit=100&warnings=false` | Exclude warnings.                                     |
| `/history?limit=10`                | Up to the retained history limit.                     |
| `/events?replay=100`               | Recent log replay before live updates.                |

For log paging, continue from the **last returned log ID**. `latestLogId` identifies the newest entry in the whole buffer.

### Run endpoints

| Method | Path        | Action                           |
| ------ | ----------- | -------------------------------- |
| POST   | `/start`    | Start a rewards run.             |
| POST   | `/stop`     | Stop the active job.             |
| POST   | `/restart`  | Stop and replace the active run. |
| POST   | `/shutdown` | Stop the job and close the API.  |

### Settings

| Method | Path           | Action                                                            |
| ------ | -------------- | ----------------------------------------------------------------- |
| GET    | `/config`      | Redacted config, revision and ETag.                               |
| GET    | `/config/diff` | Missing built-in defaults.                                        |
| POST   | `/config/sync` | Add missing defaults; config-write flag required.                 |
| PUT    | `/config`      | Replace config, then validate/fill defaults; write flag required. |
| PATCH  | `/config`      | Merge config fields; write flag required.                         |
| GET    | `/schedule`    | Schedule, backend and write capability.                           |
| PUT    | `/schedule`    | Update supplied schedule fields; schedule-write flag required.    |
| PATCH  | `/schedule`    | Update supplied schedule fields; schedule-write flag required.    |

### Sessions and diagnostics

| Method | Path                       | Action                                                    |
| ------ | -------------------------- | --------------------------------------------------------- |
| GET    | `/sessions`                | Session metadata, without cookies/tokens.                 |
| POST   | `/sessions/regenerate`     | Login-only job; no rewards tasks.                         |
| DELETE | `/sessions/:email`         | Delete that account's desktop/mobile sessions; idle only. |
| GET    | `/diagnostics`             | Available diagnostic captures.                            |
| GET    | `/diagnostics/:name/:file` | Download an available diagnostic file.                    |

Diagnostic filenames: `screenshot.png`, `error.txt`, `metadata.json`, `dump.html`.

### Response fields

| Read           | Top-level fields                                                                                                                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`            | `name`, `version`, `message`, `authRequired`, `stateless`, `endpoints`.                                                                                                                                                           |
| `/health`      | `ok`, `name`, `version`, `state`, `uptimeSec`, `authRequired`.                                                                                                                                                                    |
| `/status`      | `name`, `version`, `state`, `shuttingDown`, `runId`, `pid`, `startedAt`, `operation`, `command`, `lastExit`, `logCount`, `logBufferSize`, `latestLogId`, `run`.                                                                   |
| `/points`      | `state`, `operation`, `runId`, `running`, `live`, `startedAt`, `currentAccount`, `balance`, `collected`, `pointsKnown`, `completion`, `updatedAt`, `finished`, `totals`, `accountsTotal`, `accountsSeen`, `accounts`, `lastExit`. |
| `/history`     | `runs`, `count`, `inMemoryOnly: false`. Most recent runs first.                                                                                                                                                                   |
| `/accounts`    | `accounts`, `count`. One row per configured account slot.                                                                                                                                                                         |
| `/logs`        | `logs`, `latestLogId`, `count`.                                                                                                                                                                                                   |
| `/errors`      | `errors`, `accountErrors`, `count`; `accountErrors` rows contain `email` and `error`.                                                                                                                                             |
| `/sessions`    | `databaseExists`, `sessions`, `count` (platform rows), `accounts` (distinct accounts).                                                                                                                                            |
| `/diagnostics` | `dir`, `count`, `entries`.                                                                                                                                                                                                        |

- Log rows contain `id`, `ts`, `receivedAt`, `level`, `color`, `user`, `platform`, `title`,
  `message`, `source`, `parsed` and `raw`. Structured rows may add `version`, `runId`,
  `consoleAllowed` and `data`. Unparsed fields can be null; log IDs restart with the API.
- Session rows contain `email`, `platform`, `updatedAt`, `hasStorageState`, `hasFingerprint`
  and `cookieCount`. Platforms are `desktop` or `mobile`; unreadable cookie counts are null.
- Diagnostic rows contain `name`, `createdAt`, `hasScreenshot`, `hasHtml`, `hasError` and `error`
  (up to 2,000 characters). Downloads return the file bytes.
- `/plan` returns `version`, `mode`, `enabledWorkers`, `appApiWorkers`, `unsupportedWorkers`,
  `browserRequirements`, `desktopProfile`, `pointClaims`, `edgeBrowsing`, `browserSearchApiReport`,
  `browserTaskOrder`, `globalTimeout`, `ignoredSettings`, `desktopSession`, `mobileSession`,
  `searchQuota`, `queryLocale`, `queryEngines`, `changesApply` and `configWarnings`.
  `browserRequirements` has `desktop` and `mobile` reason arrays. The plan reads effective
  configuration; authenticated quotas arrive during a run.
- `/docker-log` accepts `{ "line": "..." }` for supported, single-line Docker wrapper logs only.
  Normal authentication applies. It records a log without starting a run.

## Run control

Send a JSON object. An empty body is `{}`; unknown run-control fields return 400.

| Field                    | Allowed on                 | Meaning                                                                 |
| ------------------------ | -------------------------- | ----------------------------------------------------------------------- |
| `accountIndex`           | Start, restart, regenerate | One configured slot; positive JSON integer.                             |
| `excludedAccountIndexes` | Start, restart, regenerate | Skip configured slots; at least one account must remain.                |
| `args`                   | Start, restart             | `[]` or `["-dev"]`; other flags are rejected.                           |
| `env`                    | Start, restart, regenerate | Supported `CONFIG_*` / `ACCOUNT_N_*` overrides; override flag required. |
| `force`                  | Stop, restart, shutdown    | Boolean; default `false`.                                               |
| `runId`                  | Stop                       | Stop only that job; rejects a changed active run.                       |

- Slot numbers are the `ACCOUNT_N_*` numbers, including gaps.
- Use `accountIndex` or `excludedAccountIndexes` in one request.
- Override values accept strings, numbers or booleans; null is ignored.
- Arbitrary process environment keys are rejected.
- Restart validates replacement options before stopping the current run.

| Successful request | Response fields                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Start / restart    | `started: true` / `restarted: true`, `selectedAccount`, `excludedAccounts`, `runId`, `pid`, `startedAt`, `operation`, `command`, `args`. |
| Stop               | `stopping: true`, `force`; completion is asynchronous.                                                                                   |
| Shutdown           | `shuttingDown: true`, `stoppingBot`; the API closes after stopping the job.                                                              |
| Regenerate         | `regenerating: true`, `platform`, `fresh`, `accounts`, `selectedAccount`, `excludedAccounts`, plus the job fields returned by start.     |

Selected/excluded account rows use `{ "index": 2, "email": "user@example.com" }`.
`selectedAccount` is null when no single slot was selected.

**Start all accounts:**

```bash
curl "$API_URL/start" -X POST \
  -H "Authorization: Bearer $API_TOKEN" \
  -H 'Content-Type: application/json' -d '{}'
```

Other start bodies:

```json
{ "accountIndex": 2 }
```

```json
{ "excludedAccountIndexes": [2, 4], "args": ["-dev"] }
```

**Stop the job identified by the start response:**

```bash
curl "$API_URL/stop" -X POST \
  -H "Authorization: Bearer $API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"runId":"RUN_ID_FROM_START","force":false}'
```

- Idle stop: 409 `NOT_RUNNING`.
- Different active job: 409 `RUN_CHANGED`.
- Start during an active job: 409 `ALREADY_RUNNING`.
- Restart has no `runId` guard; it replaces the current active run.

## Regenerate sessions

Sign in upfront without running searches, claiming points or starting reward workers.

```bash
curl "$API_URL/sessions/regenerate" -X POST \
  -H "Authorization: Bearer $API_TOKEN" \
  -H 'Content-Type: application/json' -d '{}'
```

| Field                    | Default      | Options                                                        |
| ------------------------ | ------------ | -------------------------------------------------------------- |
| `accountIndex`           | All accounts | One configured slot.                                           |
| `excludedAccountIndexes` | `[]`         | Skip configured slots; mutually exclusive with `accountIndex`. |
| `platform`               | `"both"`     | `"desktop"`, `"mobile"`, `"both"`.                             |
| `fresh`                  | `true`       | Ignore saved cookies; `false` allows compatible-session reuse. |
| `env`                    | Omitted      | Supported overrides; override flag required.                   |

One account's mobile session:

```json
{ "accountIndex": 2, "platform": "mobile", "fresh": true }
```

1. Accounts run sequentially, desktop then mobile.
2. Follow `/logs` or `/events` for Authenticator approval/number matching.
3. Verified sessions are saved; each browser closes.
4. The job exits; check `/status` or `exit` for its outcome.

- No separate deletion is needed for a fresh sign-in.
- Failed/cancelled sign-ins preserve existing saved sessions.
- Browser visibility follows `headless` and the host environment.
- Headless/background jobs cannot accept stdin email codes; use [manual login](usage.md#sign-in-without-reward-tasks) when required.
- Failed sessions are reported individually; remaining sessions continue.
- Normal clustering and account/task delays do not apply to this login-only job.
- Rewards and regeneration jobs cannot overlap.

**Progress:** `/status.run.sessionGeneration.steps` lists each account/platform with status, timestamps and error. States: `pending`, `running`, `completed`, `failed`, `cancelled`.

`sessionGeneration` also contains `fresh`, `platforms` and selected `accounts`. Each step contains
`email`, `platform`, `status`, `startedAt`, `endedAt` and `error`. History retains the same progress.

**Cancel:** `POST /stop` with the regeneration `runId`; already saved sessions remain.

**Delete:** `DELETE /sessions/user%40example.com` while idle. There is no delete-all endpoint; absence returns 404 `SESSION_NOT_FOUND`.

Successful deletion returns `deleted: true`, `found: true`, `removed` (session rows), `email`
and `platforms`.

## Configuration

Enable `API_ALLOW_CONFIG_WRITE=true` to write settings.

1. Read `GET /config`.
2. Copy the returned ETag, including its quotes.
3. PATCH the config object with `If-Match`.
4. Inspect returned `warnings`; changes apply to the next run.

```bash
curl -i "$API_URL/config" -H "Authorization: Bearer $API_TOKEN"

curl "$API_URL/config" -X PATCH \
  -H "Authorization: Bearer $API_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'If-Match: "REVISION_HASH_FROM_GET"' \
  -d '{"taskDelay":{"min":"30sec","max":"1min"}}'
```

| Behavior                     | Detail                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------ |
| PATCH                        | Merge the provided fields into saved settings.                                 |
| PUT                          | Replace settings before validation/default filling.                            |
| Secrets                      | `***REDACTED***` retains existing values; empty strings clear string settings. |
| Reveal                       | `?reveal=1` works only with the reveal flag and token.                         |
| Stale ETag                   | 412; reload before saving again.                                               |
| Concurrent validation change | 409; reload and retry.                                                         |
| Validation warnings          | Invalid fields may fall back; unknown fields may be removed.                   |
| Environment overrides        | Active `CONFIG_*` values still take precedence.                                |

**Add missing defaults:** `POST /config/sync` with `{}` and optional `If-Match`. Existing values are retained; no example config is read.

| Request               | Response fields                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| GET `/config`         | `path`, `redacted`, `config`, `revision`; ETag header matches `revision`.                           |
| GET `/config/diff`    | `addedKeys`, `upToDate`.                                                                            |
| PUT / PATCH `/config` | `ok`, `path`, `via`, `appliesOnNextRun: true`, `warnings`, redacted `config`, `revision`; new ETag. |
| POST `/config/sync`   | `addedKeys`, `patched`, `revision`, `appliesOnNextRun: true`; new ETag.                             |

`If-Match` is optional; supplying the returned ETag protects against stale writes. Sync returns
the changed key list, without a config object. Config payload fields are documented in the
[settings reference](usage.md#settings-reference).

## Scheduling

Schedule writes require **Docker cron** and `API_ALLOW_SCHEDULE_WRITE=true`.

```bash
curl "$API_URL/schedule" -X PATCH \
  -H "Authorization: Bearer $API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true,"cron":"0 7 * * *","skipIfRunning":true,"excludedAccountIndexes":[]}'
```

| Field                    | Meaning                                                               |
| ------------------------ | --------------------------------------------------------------------- |
| `enabled`                | Boolean; use `false` to disable.                                      |
| `cron`                   | Five-field expression; required when enabled.                         |
| `skipIfRunning`          | `true` skips overlap; `false` waits within the stuck-process timeout. |
| `excludedAccountIndexes` | Account slots to skip.                                                |
| `timezone`               | Read-only; configure scheduler `TZ`.                                  |

- PUT and PATCH both update supplied fields.
- Changes persist in `config/schedule.json`; `SCHEDULE_FILE` can override the path.
- Saved values take precedence over initial `CRON_SCHEDULE`.
- `GET /schedule` reports `supported`, `backend` and `writable`.
- Unsupported backend: 503 `SCHEDULER_UNAVAILABLE`; nothing is saved.
- Corrupt schedules and cron-installation failures report errors while retaining existing saved settings.

Schedule reads return `enabled`, `cron`, `skipIfRunning`, `excludedAccountIndexes`, `updatedAt`,
`timezone`, `source` (`env` or `override`), `supported`, `backend` and `writable`.
Writes return the saved schedule fields with `source: "override"` and `writable: true`;
`supported` and `backend` are read-response fields.

## Dashboard data

### Process and finish signals

| Field          | Use                                                                             |
| -------------- | ------------------------------------------------------------------------------- |
| `state`        | `idle`, `starting`, `running`, `stopping`; controls run buttons.                |
| `runId`        | Active job ID; null after exit.                                                 |
| `run.runId`    | ID of the displayed run; retained after exit until the next run or API restart. |
| `pid`          | Active process; null after exit.                                                |
| `operation`    | `rewards` or `session-regeneration`.                                            |
| `lastExit`     | Finished job ID, outcome and exit details.                                      |
| `run.finished` | Final run data is available.                                                    |
| `shuttingDown` | Reject/disable new starts and restarts.                                         |

1. Load `/status` or the SSE `hello` snapshot.
2. Enable Start when `state === "idle"` and shutdown is false.
3. On final `status` with `reason: "exit"`, match `lastExit.runId`.
4. The next `exit` event carries the same finished-job record.
5. On reconnect, use the current snapshot to recover a missed finish event.

Account outcomes: `completed`, `partial`, `skipped`, `failed`, `cancelled`. Session-generation outcomes exclude `skipped`.

| Run outcome   | Meaning                                                        |
| ------------- | -------------------------------------------------------------- |
| `completed`   | Execution finished and reported activities completed.          |
| `partial`     | Execution finished; some activities failed or are unconfirmed. |
| `interrupted` | Execution did not finish, even if the process exited with 0.   |
| `cancelled`   | The run was stopped.                                           |
| `failed`      | Runner startup or session regeneration failed.                 |

- `run.executionComplete` and `lastExit.executionComplete` separate finished execution from activity outcomes.
- A rewards run needs `RUN-END` and final results for all expected accounts to count as finished.
- Unfinished accounts become `failed` or `cancelled`; completed account results are retained.
- Completed rewards runs exit with 0, including `partial`; interrupted execution remains a failure.
- Session regeneration uses `partial` when all session attempts finished but some failed; unfinished attempts make the job `interrupted`.
- History records include `executionComplete`; older records can have null/absent values.

### Run and account fields

`/status.run` contains:

| Fields                                                  | Meaning                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| `runId`, `operation`, `version`, `clusters`             | Displayed job identity and observed runner details.                 |
| `accountsTotal`, `accountsSeen`, `accounts`             | Expected count, observed count and account rows in start order.     |
| `status`, `finished`, `executionComplete`, `completion` | Current/final outcome and task breakdown.                           |
| `collected`, `pointsKnown`, `totals`                    | Overall gain; `totals` is null until the runner reports its result. |
| `live`                                                  | `currentAccount`, `currentBalance`, `gained`, `updatedAt`.          |
| `pendingDelay`                                          | Null or `seconds`, `nextEmail`, `sinceTs`.                          |
| `sessionGeneration`                                     | Null for rewards runs; login-only progress otherwise.               |

`totals` contains `accountsProcessed`, `collected`, `pointsKnown`, `oldTotal`, `newTotal`
and `runtimeMinutes`. `lastExit` / history `exit` contains `runId`, `operation`, `code`,
`signal`, `at`, `status`, `executionComplete` and optional `error`.

| Account fields in `/status.run.accounts[]`                                       | Meaning                                                                              |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `email`, `geoLocale`, `locale`, `cachedRegion`                                   | Account identity and observed locale.                                                |
| `level`, `pointsProgress`, `pointsRemaining`, `lifetimeEarn`, `accountUpdatedAt` | Membership observations; unavailable values are null.                                |
| `resetAt`, `resetAtSource`                                                       | Next reset and whether it comes from the service or an estimate.                     |
| `endedAt`, `durationSeconds`, `status`, `success`, `error`                       | Account execution; some fields appear only after their milestone.                    |
| `initialPoints`, `finalPoints`, `collectedPoints`, `pointsKnown`                 | Start/final balance and run gain.                                                    |
| `live`                                                                           | Latest `balance`, `gained`, `bySource`, `lastUpdateTs`, and observed `unattributed`. |
| `earnable`, `appQuotaState`, `searchSummary`                                     | Search/app pools and run search results.                                             |
| `activities`, `completion`                                                       | Recent activity results and grouped task outcomes.                                   |
| `streaks`, `streakProtection`, `punchCards`, `edgeBrowsing`                      | Latest observed feature progress.                                                    |
| `attribution`                                                                    | Optional internal credit tracking map; use `live.bySource` for display.              |

`/points.accounts[]` provides `email`, the membership/reset fields, `collected`, `pointsKnown`,
`balance`, `initialPoints`, `bySource`, `earnable`, `searchSummary`, `appQuotaState`, `streaks`,
`streakProtection`, `punchCards`, `edgeBrowsing`, `status`, `done`, `success`, `error` and `completion`.
Here, top-level `live` is a boolean for `starting`/`running`; top-level `running` also includes `stopping`.

Each `/history.runs[]` record contains `runId`, `operation`, `sessionGeneration`, `startedAt`,
`endedAt`, `exit`, `version`, `status`, `executionComplete`, `collected`, `pointsKnown`, `completion`
and `accounts`. History account rows retain `email`, the membership/reset and feature fields above,
plus `status`, `durationSeconds`, `initialPoints`, `currentBalance`, `collected`, `pointsKnown`,
`success`, `error`, `completion`, `bySource`, `unattributed`, `earnable`, `appQuotaState`,
`searchSummary` and `activities`.

`/accounts.accounts[]` includes `index`, `email`, `geoLocale`, `langCode`, `hasRecoveryEmail`,
`hasTotp`, `proxy`, the membership/reset and feature observations, `runs`, `totalCollected`,
`pointsKnown`, `verifiedCollected`, `successStreak`, `lastRunAt`, `lastCollected`, `lastSuccess`,
`lastError`, `lastCompletion` and `lastPointsBySource`. `proxy` is null or has a sanitized `url`,
`port` and `hasCredentials`. Credentials are not returned.

### Task breakdown

| Activity `category` | Display                                                         |
| ------------------- | --------------------------------------------------------------- |
| `completed`         | Confirmed or already completed/activated work.                  |
| `incomplete`        | Expected work failed or remains unconfirmed.                    |
| `unavailable`       | Service evidence says it is not offered, locked or unavailable. |
| `not-applicable`    | Configuration, task type or platform skip.                      |

Activity `status` is separately `confirmed`, `unconfirmed`, `skipped` or `failed`.

| Detail location                         | Available data                             |
| --------------------------------------- | ------------------------------------------ |
| `/status.run.accounts[].completion`     | Current/final account breakdown.           |
| `/points.accounts[].completion`         | The same breakdown alongside point totals. |
| `/history.runs[].accounts[].completion` | Saved breakdown.                           |
| `/accounts.accounts[].lastCompletion`   | Latest rewards-run breakdown.              |

Completion lists: `completed`, `incomplete`, `unavailable`, `notApplicable`. Rows carry reasons, titles/messages and point evidence when available.

Each completion contains `counts`, the four detail lists, `accountReason` and per-list `omitted`
counts. Detail rows contain `activity`, `label`, `platform` (`desktop`, `mobile` or null), `status`,
`category`, `reason`, `message`, `pointsGained`, `pointsKnown`, `balanceBefore`, `balanceAfter`,
and optional `title`, `offerId`, `operationId`, `errorCode`, `activation`.
The recent `activities` list carries the original result with `kind`, `activity`, `category`,
`ts`, `platform`, `summary` and `message`; its platform uses `MAIN`, `DESKTOP` or `MOBILE`.

- Use account/run `status` for the completion badge.
- Show `incomplete` and `accountReason` prominently.
- Unavailable/not-applicable skips do not make an account partial.
- Later confirmation resolves the previous incomplete task/offer.
- Missing/failed reads stay incomplete or unknown; they do not prove unavailability.
- No geographic cause is inferred from a missing offer or HTTP 403.
- Lists are bounded; show `omitted` counts.
- Counts cover observed work, not every possible Microsoft offer.
- Older history can lack details; handle null/missing completion data.

Example selected fields from a partial account:

```json
{
    "status": "partial",
    "completion": {
        "counts": {
            "completed": 1,
            "incomplete": 1,
            "unavailable": 1,
            "notApplicable": 0
        },
        "incomplete": [
            {
                "activity": "search",
                "status": "unconfirmed",
                "category": "incomplete",
                "reason": "quota-incomplete",
                "pointsGained": null,
                "pointsKnown": false
            }
        ]
    }
}
```

**Activation details:** Visual Search, Edge and API Search Perk can include `activation.status`, `reason`, `attempted`, `offerId`, `message`, `acknowledged`, `verified`, `httpStatus` and `errorCode`.

Activation states: `activated`, `already-active`, `unavailable`, `unconfirmed`, `failed`. Accepted activation does not establish credited points.

### Streaks

Account objects in `/status`, `/points`, `/accounts`, and `/history` include `streaks`.
Each observation has `partner`, `label`, `completedToday`, `completedDays`, `currentDay`,
`totalDays`, `isEnabled`, `dailyPoints`, `activitiesCompleted`, `activitiesTotal`, `resetAt`
and `updatedAt`. Day indexes and reward arrays follow the service's values.

Check the observation/reset timestamps before displaying historical completion. Streak observations
do not credit points. Older records may omit newer fields.

`streakProtection` is null or contains `enabled`, `remainingDays`, `streakCounter` and `updatedAt`.
Zero remaining days is a valid observation, independently of whether protection is enabled.

### Punchcards

Accounts in `/status.run.accounts[]`, `/points.accounts[]`, `/accounts.accounts[]` and
`/history.runs[].accounts[]` expose `punchCards`. One row per observed weekly/active card,
deduplicated by `offerId` across desktop/mobile observations:

```json
{
    "punchCards": [
        {
            "offerId": "weekly_pcparent_example_punchcard",
            "title": "Weekly quest",
            "completedSteps": 6,
            "totalSteps": 8,
            "lockedSteps": 2,
            "pointsGained": null,
            "pointsAvailable": 100,
            "pointsKnown": false,
            "complete": false
        }
    ]
}
```

| Field                          | Meaning                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `offerId`, `title`             | Service card ID and title; the ID is the fallback title.                                       |
| `completedSteps`, `totalSteps` | Observed task counts; null when unavailable.                                                   |
| `lockedSteps`                  | Observed incomplete locked/disabled steps; null without a full step list, zero when complete.  |
| `pointsGained`                 | Last explicit card point progress, including progress before this run; null when unexposed.    |
| `pointsAvailable`              | Advertised total card reward; null when unexposed. This is not a remaining-points calculation. |
| `pointsKnown`                  | Whether `pointsGained` was exposed by the service; independent of the advertised reward.       |
| `complete`                     | Card completion observed from the service or all known steps completed.                        |

- API and browser modes report discovery, refreshed step progress and final completion, including `8/8`.
- Already completed cards remain in the run snapshot/history. A later desktop/mobile discovery
  does not replace a completed card with an older incomplete snapshot.
- Missing later fields retain earlier observations for the same card. Progress observations do not
  add credit to account/run totals; completion alone does not prove points were earned.
- An empty array means no cards were observed. It does not distinguish no offered cards from
  unavailable data. Older history returns `[]` unless it already contains saved card data.
- `/accounts` uses the current run's observed cards when present, otherwise the most recent saved
  card observations. `/history` retains each run's own snapshot without refreshing Microsoft pages.

### Edge browsing

`edgeBrowsing` is null until observed. It contains `status` (`pending`, `running`, `complete`,
`partial`, `skipped`, `failed`, `cancelled`), `targetMinutes`, `serverIntervalMinutes`,
`reportsCompleted`, `reportsTotal`, `reportsRemaining`, `scheduledMinutesCovered`,
`nextReportInSeconds`, `estimatedRemainingMinutes`, `elapsedMinutes`, `accepted`, `duplicates`,
`failed`, `waitingForBackground` and `updatedAt`. Unknown timing/count values can be null.
Reports and ETA describe background work; use verified activity/account fields for earned points.

### Points and history

| Field           | Meaning                                                                               |
| --------------- | ------------------------------------------------------------------------------------- |
| `pointsKnown`   | Whether the amount is verified.                                                       |
| `pointsGained`  | Activity credit; consult `pointsKnown`.                                               |
| `balanceBefore` | Last observed account balance before an activity; null when unavailable.              |
| `balanceAfter`  | Balance observed during the activity's execution/verification; null when unavailable. |
| `bySource`      | Verified credit attributed to activities.                                             |
| `unattributed`  | Observed gains without a verified source.                                             |
| `earnable`      | Per-account `mobile`, `browser` (desktop) and `app` pools.                            |
| `appQuotaState` | `pending`, `available`, `unavailable`, `disabled` or null.                            |
| `searchSummary` | Search results for the run, including optional `apiReport`.                           |
| `resetAt`       | Account-level next reset timestamp in UTC, independent of whether streaks exist.      |
| `resetAtSource` | `service`, `estimated` or null.                                                       |

`/history.runs[].accounts[]` retains `searchSummary`, `earnable`, `appQuotaState`, and the last 200
`activities`. Activity and completion rows include nullable `balanceBefore` and `balanceAfter`,
reusing existing reads. Balance differences can include concurrent or delayed rewards and do not
establish verified activity credit. Missing historical observations cannot be reconstructed.

Account `resetAt` is exposed even without streaks when a valid browser timezone is known.
`resetAtSource: "service"` uses a future streak deadline; `"estimated"` uses the next local midnight
as a display fallback. Both fields are null when neither source is available.

Account objects in `/status`, `/points`, `/history`, and `/accounts` also expose numeric `level`,
`pointsProgress`, `pointsRemaining`, `lifetimeEarn`, and `accountUpdatedAt`. Missing membership values
are `null`; an incomplete update retains previously observed values. Levels are read from Rewards
`levelInfo.activeLevel` or page membership data, including `Level2`, `newLevel3`, and numeric values.
`/accounts` uses live membership, streak protection, and Edge browsing observations during a run;
its run statistics count rewards jobs in history only. Membership progress describes the current
level period, separately from today's search quotas and the spendable points balance.

- Unknown account/run totals are **null**; a stopped/crashed job retains its last observed balance separately.
- Activity events may carry compatibility `pointsGained: 0` with `pointsKnown: false`; display it as unknown.
- Completion and credited points are independent.
- Use account totals for overall gains; source totals can arrive earlier.
- Deduplicate operations by their operation ID; progress logs do not add credit again.
- Advertised points, HTTP success and `sessionBalanceDelta` do not establish new credit.
- Read to Earn per-read logs describe the aggregate activity; do not count them twice.
- API Search Report summaries can include `apiReport`; successful transport can earn zero.
- `/accounts` exposes `lastPointsBySource` and `lastCompletion`; older records may return null.
- Historical `totalCollected` is null if any retained result is unknown; `verifiedCollected` is the known subtotal.
- Completed summaries persist in `config/run-history.json`; live state/log buffers reset on API restart.
- Session-generation jobs retain their progress in history and do not contribute to rewards statistics.

Run-level `completion` aggregates account statuses and activity categories; `detailsKnown` indicates whether full account details are present.

## Live events

```bash
curl -N "$API_URL/events?replay=100" \
  -H "Authorization: Bearer $API_TOKEN"
```

| Event    | Client action                                                                       |
| -------- | ----------------------------------------------------------------------------------- |
| `hello`  | Initialize from the current status snapshot.                                        |
| `log`    | Append/deduplicate the numeric log ID.                                              |
| `status` | Refresh process/run state.                                                          |
| `exit`   | Match `runId` and finalize the job.                                                 |
| `reset`  | Reload `/status` and `/points`; log cursor expired or belongs to an earlier server. |

- Reconnect with `Last-Event-ID: <last received ID>`.
- Expired cursors receive recent replay plus `reset`.
- Browser EventSource can use `/events?token=<encoded-token>`; fetch clients use the authorization header.
- Version-2 domain kinds: `activity`, `quota`, `balance`, `account-info`, `account`, `run`, `session`, `punchcard`.
- `account-info` carries membership, reset and streak observations without adding credited points.
- `punchcard` carries the card fields above; the corresponding `status` event has `reason: "punchcard"`.
- Use structured fields for status/points; readable text is for display.
- Plain `color` values such as `green`, `yellow`, `red` match console result colors.
- Routine tracking events can update status/points while `consoleAllowed: false`.
- Use `/logs?level=info` for normal user output.
- Heartbeats arrive every 15 seconds; slow clients may be disconnected. Limit: 50 streams.

## Errors and limits

| HTTP status | Meaning / action                                                   |
| ----------- | ------------------------------------------------------------------ |
| 400         | Invalid JSON, fields, cursor, email or path; fix the request.      |
| 401         | Missing/incorrect token.                                           |
| 403         | Disabled write/override capability or untrusted local origin.      |
| 404         | Missing route, config, session or diagnostic.                      |
| 405         | Unsupported method on a settings route.                            |
| 408         | Request body timed out.                                            |
| 409         | Run conflict, active-session deletion or concurrent config change. |
| 412         | Stale config ETag; reload before writing.                          |
| 413         | Body exceeds 1,000,000 bytes.                                      |
| 422         | Config validation failed.                                          |
| 500         | Internal failure or corrupt stored state; inspect code/logs.       |
| 503         | Shutdown, unavailable scheduler/session runner or stream capacity. |
