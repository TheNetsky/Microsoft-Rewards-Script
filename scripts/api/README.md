# Microsoft Rewards Script Control API

A small, dependency-free HTTP API that lets a dashboard or another local tool
control and observe the Microsoft Rewards Script.

The API can:

- start, stop, restart, and remotely shut down the bot process;
- run every configured account, one specific account, or all accounts except a
  selected set;
- expose live process status and point totals;
- stream structured logs over Server-Sent Events (SSE);
- return recent errors, in-memory run history, configured account summaries,
  and diagnostic captures;
- list stored session metadata and delete the mobile/desktop sessions belonging
  to one account;
- read `config.json` and, when explicitly enabled, validate and update it;
- read the effective cron schedule and, in Docker API mode, persist and apply
  schedule changes without restarting the container.

It uses only Node.js built-ins and follows the same ESM `.js` convention as the
other scripts in the project.

---

## Table of Contents

- [Microsoft Rewards Script Control API](#microsoft-rewards-script-control-api)
    - [Table of Contents](#table-of-contents)
    - [Architecture and persistence](#architecture-and-persistence)
    - [Requirements](#requirements)
    - [Quick Setup](#quick-setup)
        - [Build the bot](#build-the-bot)
        - [Run without authentication](#run-without-authentication)
        - [Run with authentication from the command line](#run-with-authentication-from-the-command-line)
        - [Run with authentication from `.env`](#run-with-authentication-from-env)
        - [Connect a dashboard](#connect-a-dashboard)
        - [Verify the API](#verify-the-api)
    - [Authentication](#authentication)
        - [Bearer token](#bearer-token)
        - [API key header](#api-key-header)
        - [SSE query parameter](#sse-query-parameter)
    - [HTTP conventions](#http-conventions)
    - [Axios setup](#axios-setup)
    - [Endpoint overview](#endpoint-overview)
        - [Read endpoints](#read-endpoints)
        - [Control and write endpoints](#control-and-write-endpoints)
    - [Reading API state](#reading-api-state)
        - [`GET /`](#get-)
        - [`GET /health`](#get-health)
        - [`GET /status`](#get-status)
        - [`GET /points`](#get-points)
        - [`GET /logs`](#get-logs)
        - [`GET /errors`](#get-errors)
        - [`GET /history`](#get-history)
        - [`GET /accounts`](#get-accounts)
    - [Session management](#session-management)
        - [`GET /sessions`](#get-sessions)
        - [`DELETE /sessions/:email`](#delete-sessionsemail)
    - [Reading diagnostics](#reading-diagnostics)
        - [`GET /diagnostics`](#get-diagnostics)
    - [Starting and controlling runs](#starting-and-controlling-runs)
        - [`POST /start`](#post-start)
            - [Start all configured accounts](#start-all-configured-accounts)
            - [Start only one account](#start-only-one-account)
            - [Start all except selected accounts](#start-all-except-selected-accounts)
            - [Override launch arguments](#override-launch-arguments)
            - [Add per-run environment variables](#add-per-run-environment-variables)
            - [Start errors](#start-errors)
        - [`POST /stop`](#post-stop)
        - [`POST /restart`](#post-restart)
        - [`POST /shutdown`](#post-shutdown)
    - [Live event stream with SSE](#live-event-stream-with-sse)
        - [`GET /events`](#get-events)
        - [Terminal stream](#terminal-stream)
        - [Node.js stream with Axios](#nodejs-stream-with-axios)
        - [Browser `EventSource`](#browser-eventsource)
    - [Reading and editing configuration](#reading-and-editing-configuration)
        - [`GET /config`](#get-config)
        - [`PATCH /config`](#patch-config)
        - [`PUT /config`](#put-config)
    - [Reading and editing the schedule](#reading-and-editing-the-schedule)
        - [`GET /schedule`](#get-schedule)
        - [`PUT /schedule` and `PATCH /schedule`](#put-schedule-and-patch-schedule)
    - [Axios response and error handling](#axios-response-and-error-handling)
    - [PowerShell examples](#powershell-examples)
    - [HTTP status codes](#http-status-codes)
    - [Environment variables](#environment-variables)
    - [Security guidance](#security-guidance)
    - [Keeping the API running](#keeping-the-api-running)
        - [Development terminal](#development-terminal)
        - [PM2](#pm2)
        - [systemd](#systemd)
        - [Docker](#docker)
    - [Startup readiness](#startup-readiness)
    - [File layout](#file-layout)

---

## Architecture and persistence

The API is designed as a lightweight runtime controller between the bot and a
dashboard. It launches the normal bot command as a child process and parses its
output without maintaining a runtime database.

```text
bot repository                               dashboard or other client
┌───────────────────────────────┐            ┌────────────────────────┐
│ node scripts/api/server.js    │            │ HTTP client             │
│   ├─ starts/stops the bot     │ ◀──HTTP──▶ │ CONTROL_API_URL         │
│   ├─ parses logs and points   │   + token  │ CONTROL_API_TOKEN       │
│   └─ keeps short-lived state  │            │ persistent dashboard DB │
└───────────────────────────────┘            └────────────────────────┘
```

The following data exists only in memory and is reset whenever the API process
restarts:

- buffered logs;
- live run state;
- parsed errors;
- completed run history;
- account statistics calculated from that history.

The API does not create its own database. Config and schedule writes are both
disabled by default and require separate opt-in environment variables:

- `PUT` or `PATCH /config` updates `config.json`. The previous file is copied to
  `config.json.bak` on a best-effort basis before replacement.
- `PUT` or `PATCH /schedule` writes `config/schedule.json` atomically and applies
  the cron change immediately. The file lives in the existing Docker `./config`
  volume, so it survives container restarts and takes precedence over
  `CRON_SCHEDULE`.
- `DELETE /sessions/:email` removes only the matching account rows from the
  bot's existing `sessions.db`. The API never exposes stored cookies or
  fingerprint contents and has no delete-all session route.

All live logs, parsed run state, errors, history, and calculated account
statistics remain memory-only. A dashboard can store those results separately
when durable history is needed.

## Requirements

- Node.js 24 or newer;
- a built bot, normally with `dist/index.js` available;
- the API files located under `scripts/api/` in the bot repository.

The implementation is platform-independent. Process-tree termination uses
`taskkill` on Windows and process-group signals on Linux and macOS.

## Quick Setup

### Build the bot

Install and build the project before starting the Control API:

```bash
npm install
npm run build
```

`npm run api` starts the API server, not an immediate rewards run. Use
`POST /start` or a connected dashboard to start the bot after the API is
listening.

### Run without authentication

Start the API without a token:

```bash
npm run api
```

The equivalent direct command is:

```bash
node scripts/api/server.js
```

This starts an unauthenticated API at:

```text
http://127.0.0.1:3010
```

> [!IMPORTANT]
> This is unauthenticated only when `API_TOKEN` is absent or empty in both the
> current process environment and the loaded `.env` file. If `.env` already
> contains `API_TOKEN`, remove or comment out that line and restart the API.

> [!WARNING]
> Run without authentication only while `API_HOST` is `127.0.0.1`, `localhost`,
> or `::1` on a trusted machine. Never expose an unauthenticated API through a
> LAN address, published container port, reverse proxy, or the public internet.

### Run with authentication from the command line

Pass a token through npm for a one-time authenticated launch:

```bash
npm run api -- --token "YOUR_API_TOKEN"
```

The first `--` belongs to npm. It tells npm to forward the remaining arguments
to `scripts/api/server.js`. The API itself receives
`--token "YOUR_API_TOKEN"`.

The equivalent direct command is:

```bash
node scripts/api/server.js --token "YOUR_API_TOKEN"
```

> [!NOTE]
> The supported option is `--token`, not `--auth`. If `API_TOKEN` is already set
> in the environment or `.env`, that value takes precedence over the command-line
> token.

Generate a strong token instead of using a short example value:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

You can also set the listen address and port for the same launch:

```bash
npm run api -- --host 127.0.0.1 --port 3010 --token "YOUR_API_TOKEN"
```

### Run with authentication from `.env`

For normal or repeated use, configure authentication in the project `.env`:

```dotenv
API_HOST=127.0.0.1
API_PORT=3010
API_TOKEN=replace-with-a-long-random-token
API_CORS_ORIGIN=http://127.0.0.1:3000
```

Then start the API normally:

```bash
npm run api
```

The API automatically loads the first available `.env` from the current working
directory, repository root, or `dist/` directory. Authentication mode is chosen
at startup, so restart the API after adding, changing, or removing `API_TOKEN`.

### Connect a dashboard

Give the dashboard the same base URL and token used by the API:

```dotenv
CONTROL_API_URL=http://127.0.0.1:3010
CONTROL_API_TOKEN=replace-with-the-same-token
```

Leave `CONTROL_API_TOKEN` empty only when the API is intentionally running
without authentication.

### Verify the API

For an unauthenticated server:

```bash
curl --request GET \
  --url http://127.0.0.1:3010/health
```

For an authenticated server:

```bash
curl --request GET \
  --url http://127.0.0.1:3010/health \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

A successful response looks like:

```json
{
    "ok": true,
    "name": "microsoft-rewards-script",
    "version": "4.1.0",
    "state": "idle",
    "uptimeSec": 12,
    "authRequired": true
}
```

If authentication is enabled, the same request without a valid token returns
`401 Unauthorized`. The exact package name and version are read from the
repository's `package.json`.

## Authentication

When `API_TOKEN` is unset, every endpoint is open. This is acceptable only when
the API is bound to a trusted loopback interface.

When `API_TOKEN` is set, **every endpoint** requires the token, including `/`,
`/health`, diagnostic files, and the SSE stream.

The server token can be configured either persistently with `API_TOKEN` or for
a one-time launch with `npm run api -- --token "YOUR_API_TOKEN"`. An environment
or `.env` value takes precedence when both are present. The token is fixed for
the lifetime of the API process; restart the server to change authentication
mode or use a different token.

The token can be supplied in one of three ways.

### Bearer token

```bash
curl --request GET \
  --url http://127.0.0.1:3010/status \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

### API key header

```bash
curl --request GET \
  --url http://127.0.0.1:3010/status \
  --header 'X-API-Key: YOUR_API_TOKEN'
```

### SSE query parameter

```text
http://127.0.0.1:3010/events?token=<API_TOKEN>
```

The query form is accepted only by `/events` and is intended for browser
`EventSource`, which cannot set custom authorization headers. Use a header for
every other request because URLs can be stored in browser history and proxy
logs.

An invalid or missing token returns:

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json
```

```json
{
    "error": "Unauthorized",
    "hint": "Provide the API token via Authorization: Bearer or X-API-Key. Browser EventSource may use ?token= only on /events. ..."
}
```

## HTTP conventions

- The base URL is `http://<API_HOST>:<API_PORT>`.
- Request and response bodies are JSON unless the endpoint returns SSE or a
  diagnostic file.
- JSON requests should include `Content-Type: application/json`.
- An omitted or empty JSON body is treated as `{}`.
- The maximum accepted request body is 1,000,000 bytes.
- Unknown routes return `404` with a JSON error.
- CORS is enabled according to `API_CORS_ORIGIN`.
- `OPTIONS` preflight requests return `204 No Content`.

All examples below use these placeholders:

- `http://127.0.0.1:3010` is the API base URL;
- `YOUR_API_TOKEN` is the value configured as `API_TOKEN`.

The cURL examples are deliberately self-contained, similar to public API
reference documentation, so any individual request can be copied without first
defining shell variables.

## Axios setup

Install Axios in the dashboard or other client project:

```bash
npm install axios
```

Create one reusable client:

```js
import axios from 'axios'

export const api = axios.create({
    baseURL: 'http://127.0.0.1:3010',
    headers: {
        Authorization: 'Bearer YOUR_API_TOKEN'
    },
    timeout: 30_000
})
```

The Axios examples below assume this client is imported:

```js
import { api } from './apiClient.js'
```

Axios is required only by the consuming dashboard or client. The control API
server itself remains dependency-free.

## Endpoint overview

### Read endpoints

| Method | Path                            | Purpose                                                           |
| ------ | ------------------------------- | ----------------------------------------------------------------- |
| `GET`  | `/`                             | API name, version, authentication state, and endpoint index.      |
| `GET`  | `/health`                       | Lightweight liveness and process-state check.                     |
| `GET`  | `/status`                       | Complete process and parsed run state.                            |
| `GET`  | `/points`                       | Simplified live point totals for dashboard polling.               |
| `GET`  | `/logs`                         | Buffered structured logs.                                         |
| `GET`  | `/errors`                       | Recent warning/error logs and per-account failures.               |
| `GET`  | `/history`                      | Completed runs retained by this API process.                      |
| `GET`  | `/accounts`                     | Safe summaries of configured accounts and recent run statistics.  |
| `GET`  | `/sessions`                     | Stored account/platform session metadata without secret contents. |
| `GET`  | `/diagnostics`                  | List available error-capture directories.                         |
| `GET`  | `/diagnostics/<capture>/<file>` | Download or view one diagnostic artifact.                         |
| `GET`  | `/config`                       | Read `config.json`, redacted by default.                          |
| `GET`  | `/schedule`                     | Read the effective cron schedule and its source.                  |
| `GET`  | `/events`                       | SSE stream containing live logs and status updates.               |

### Control and write endpoints

| Method   | Path               | Purpose                                                 |
| -------- | ------------------ | ------------------------------------------------------- |
| `POST`   | `/start`           | Start a bot run.                                        |
| `POST`   | `/stop`            | Request graceful or forced process termination.         |
| `POST`   | `/restart`         | Stop an active run, then start a new one.               |
| `POST`   | `/shutdown`        | Stop the bot if needed and terminate the API process.   |
| `DELETE` | `/sessions/:email` | Delete only one account's mobile and desktop sessions.  |
| `PUT`    | `/config`          | Replace the complete config after validation.           |
| `PATCH`  | `/config`          | Deep-merge a partial config after validation.           |
| `PUT`    | `/schedule`        | Persist and immediately apply supplied schedule fields. |
| `PATCH`  | `/schedule`        | Persist and immediately apply supplied schedule fields. |

## Reading API state

### `GET /`

Returns a machine-readable endpoint index:

**cURL**

```bash
curl --request GET \
  --url http://127.0.0.1:3010/ \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/')
console.log(data)
```

```json
{
    "name": "microsoft-rewards-script",
    "version": "4.1.0",
    "message": "Control API",
    "authRequired": true,
    "stateless": true,
    "endpoints": [
        "GET /health",
        "GET /status",
        "GET /points",
        "GET /logs",
        "GET /errors",
        "GET /history",
        "GET /accounts",
        "GET /sessions",
        "GET /diagnostics",
        "GET /events",
        "GET /config",
        "GET /schedule",
        "POST /start",
        "POST /stop",
        "POST /restart",
        "POST /shutdown",
        "DELETE /sessions/:email",
        "PUT|PATCH /config",
        "PUT|PATCH /schedule"
    ]
}
```

### `GET /health`

Use this for a simple liveness check. It does not include account or point
details.

**cURL**

```bash
curl --request GET \
  --url http://127.0.0.1:3010/health \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/health')
console.log(data)
```

Important fields:

- `ok`: always `true` when the API can answer;
- `state`: `idle`, `starting`, `running`, or `stopping`;
- `uptimeSec`: API process uptime, not bot-run duration;
- `authRequired`: whether `API_TOKEN` is configured.

### `GET /status`

Returns the full controller and parsed run state:

**cURL**

```bash
curl --request GET \
  --url http://127.0.0.1:3010/status \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/status')
console.log(data)
```

Representative response:

```jsonc
{
    "name": "microsoft-rewards-script",
    "version": "4.1.0",
    "state": "running",
    "pid": 18420,
    "startedAt": "2026-07-14T09:30:00.000Z",
    "command": "node /app/dist/index.js",
    "lastExit": null,
    "logCount": 418,
    "logBufferSize": 2000,
    "latestLogId": 418,
    "run": {
        "version": "4.1.0",
        "clusters": 1,
        "accountsTotal": 2,
        "accountsSeen": 1,
        "collected": 155,
        "totals": null,
        "finished": false,
        "live": {
            "currentAccount": "user@example.com",
            "currentBalance": 12480,
            "gained": 155,
            "updatedAt": "7/14/2026, 11:31:04 AM"
        },
        "accounts": [
            {
                "email": "user@example.com",
                "geoLocale": "NL",
                "initialPoints": 12325,
                "collectedPoints": null,
                "finalPoints": null,
                "earnable": { "mobile": 60, "browser": 90, "app": 30 },
                "searchSummary": { "mobile": 60, "desktop": 90, "bonus": 0, "total": 150 },
                "streakProtection": {
                    "enabled": true,
                    "remainingDays": 1,
                    "streakCounter": 9,
                    "updatedAt": "7/14/2026, 11:30:44 AM"
                },
                "edgeBrowsing": {
                    "status": "running",
                    "targetMinutes": 30,
                    "serverIntervalMinutes": 5,
                    "reportsCompleted": 2,
                    "reportsTotal": 6,
                    "reportsRemaining": 4,
                    "scheduledMinutesCovered": 10,
                    "nextReportInSeconds": 312.6,
                    "estimatedRemainingMinutes": 20.8,
                    "elapsedMinutes": 10.4,
                    "accepted": 2,
                    "duplicates": 0,
                    "failed": 0,
                    "waitingForBackground": false,
                    "updatedAt": "7/14/2026, 11:30:44 AM"
                },
                "durationSeconds": null,
                "success": null,
                "error": null,
                "live": {
                    "balance": 12480,
                    "gained": 155,
                    "bySource": { "search": 150, "checkIn": 5 },
                    "lastUpdateTs": "7/14/2026, 11:31:04 AM"
                }
            }
        ]
    }
}
```

While idle, `pid` and `startedAt` are `null`. `lastExit` contains information
about the most recently finished child process.

### `GET /points`

This is the preferred polling endpoint for a live points widget. It presents a
smaller, point-focused view than `/status`.

**cURL**

```bash
curl --request GET \
  --url http://127.0.0.1:3010/points \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/points')
console.log(data)
```

```jsonc
{
    "state": "running",
    "running": true,
    "live": true,
    "startedAt": "2026-07-14T09:30:00.000Z",
    "currentAccount": "user@example.com",
    "balance": 12480,
    "collected": 155,
    "updatedAt": "7/14/2026, 11:31:04 AM",
    "finished": false,
    "totals": null,
    "accountsTotal": 2,
    "accountsSeen": 1,
    "accounts": [
        {
            "email": "user@example.com",
            "collected": 155,
            "balance": 12480,
            "initialPoints": 12325,
            "bySource": { "search": 150, "checkIn": 5 },
            "earnable": { "mobile": 60, "browser": 90, "app": 30 },
            "streakProtection": {
                "enabled": true,
                "remainingDays": 1,
                "streakCounter": 9,
                "updatedAt": "7/14/2026, 11:30:44 AM"
            },
            "edgeBrowsing": {
                "status": "running",
                "targetMinutes": 30,
                "serverIntervalMinutes": 5,
                "reportsCompleted": 2,
                "reportsTotal": 6,
                "reportsRemaining": 4,
                "scheduledMinutesCovered": 10,
                "nextReportInSeconds": 312.6,
                "estimatedRemainingMinutes": 20.8,
                "elapsedMinutes": 10.4,
                "accepted": 2,
                "duplicates": 0,
                "failed": 0,
                "waitingForBackground": false,
                "updatedAt": "7/14/2026, 11:30:44 AM"
            },
            "done": false,
            "success": null,
            "error": null
        }
    ],
    "lastExit": null
}
```

The API updates point totals from stable machine-facing log fields such as
`pointsGained`, `currentBalance`, and `previousBalance`. When an account emits
its final `ACCOUNT-END` line, the live estimate is replaced by the bot's final
authoritative numbers.

### `GET /logs`

Returns structured logs from the in-memory ring buffer.

Query parameters:

| Parameter | Default | Behavior                                                                           |
| --------- | ------: | ---------------------------------------------------------------------------------- |
| `limit`   |   `200` | Number of most recent entries to return. Clamped between `1` and `API_LOG_BUFFER`. |
| `afterId` |   unset | Return entries whose numeric `id` is greater than this value. Useful for polling.  |
| `level`   |   unset | Minimum severity: `debug`, `info`, `warn`, or `error`.                             |

Examples:

**cURL - last 50 entries**

```bash
curl --request GET \
  --url 'http://127.0.0.1:3010/logs?limit=50' \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios - last 50 entries**

```js
const { data } = await api.get('/logs', {
    params: { limit: 50 }
})
console.log(data.logs)
```

Other useful Axios queries:

```js
// Warning and error entries only
const warnings = await api.get('/logs', {
    params: { level: 'warn', limit: 100 }
})

// Entries created after log ID 418
const newerLogs = await api.get('/logs', {
    params: { afterId: 418 }
})
```

Response:

```jsonc
{
    "logs": [
        {
            "id": 419,
            "receivedAt": "2026-07-14T09:31:05.000Z",
            "ts": "7/14/2026, 11:31:05 AM",
            "level": "info",
            "user": "user",
            "platform": "DESKTOP",
            "title": "SEARCH-BING",
            "message": "pointsGained=3 | currentBalance=12483",
            "source": "stdout",
            "parsed": true,
            "raw": "[7/14/2026, 11:31:05 AM] [...]"
        }
    ],
    "latestLogId": 419,
    "count": 1
}
```

When `afterId` is supplied, the API returns all newer entries still available in
the ring buffer instead of applying the normal tail behavior.

### `GET /errors`

Returns warning/error log entries and the current run's account failures.

Query parameters:

| Parameter  | Default | Behavior                                     |
| ---------- | ------: | -------------------------------------------- |
| `limit`    |   `100` | Maximum warning/error log entries to return. |
| `warnings` |  `true` | Use `warnings=false` to return errors only.  |

**cURL**

```bash
curl --request GET \
  --url 'http://127.0.0.1:3010/errors?limit=50' \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/errors', {
    params: {
        limit: 50,
        warnings: false
    }
})
console.log(data)
```

```jsonc
{
    "errors": [
        {
            "id": 510,
            "level": "error",
            "title": "ACCOUNT-ERROR",
            "message": "user@example.com: Page closed unexpectedly"
        }
    ],
    "accountErrors": [
        {
            "email": "user@example.com",
            "error": "Page closed unexpectedly"
        }
    ],
    "count": 1
}
```

### `GET /history`

Returns completed runs launched by the current API process, newest first.

Query parameter:

| Parameter |           Default | Behavior                                                            |
| --------- | ----------------: | ------------------------------------------------------------------- |
| `limit`   | `API_RUN_HISTORY` | Number of records to return, capped at the configured history size. |

**cURL**

```bash
curl --request GET \
  --url 'http://127.0.0.1:3010/history?limit=10' \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/history', {
    params: { limit: 10 }
})
console.log(data.runs)
```

```jsonc
{
    "runs": [
        {
            "startedAt": "2026-07-14T09:30:00.000Z",
            "endedAt": "2026-07-14T09:36:12.000Z",
            "exit": {
                "code": 0,
                "signal": null,
                "at": "2026-07-14T09:36:12.000Z"
            },
            "version": "4.1.0",
            "collected": 312,
            "accounts": [
                {
                    "email": "user@example.com",
                    "collected": 155,
                    "success": true,
                    "error": null,
                    "streakProtection": {
                        "enabled": true,
                        "remainingDays": 1,
                        "streakCounter": 9,
                        "updatedAt": "7/14/2026, 11:30:44 AM"
                    },
                    "edgeBrowsing": {
                        "status": "complete",
                        "reportsCompleted": 6,
                        "reportsTotal": 6,
                        "reportsRemaining": 0,
                        "scheduledMinutesCovered": 30,
                        "estimatedRemainingMinutes": 0,
                        "accepted": 6,
                        "duplicates": 0,
                        "failed": 0,
                        "elapsedMinutes": 31.2,
                        "updatedAt": "7/14/2026, 12:01:39 PM"
                    }
                }
            ]
        }
    ],
    "count": 1,
    "inMemoryOnly": true
}
```

This history is not durable. A dashboard that needs charts or long-term history
should store the returned completion data in its own database.

### `GET /accounts`

Returns every configured account slot discovered from `ACCOUNT_<N>_EMAIL`
variables in `.env`, matching the bot's own loader. Missing slot numbers are
allowed and results are returned in ascending slot order.
Email addresses are returned in full for the local dashboard. Passwords,
recovery addresses, TOTP secrets, and separate proxy username/password values
are not returned; the configured proxy URL and port are included in the summary.

**cURL**

```bash
curl --request GET \
  --url http://127.0.0.1:3010/accounts \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/accounts')
console.log(data.accounts)
```

Valid account locale values are normalized in this response: language uses canonical BCP 47 casing and explicit two-letter countries use uppercase. The bot applies the same values to its browser and HTTP profiles.

```jsonc
{
    "accounts": [
        {
            "index": 1,
            "email": "user@example.com",
            "geoLocale": "NL",
            "langCode": "nl",
            "hasRecoveryEmail": true,
            "hasTotp": true,
            "proxy": {
                "url": "http://proxy.example.com",
                "port": "8080",
                "hasCredentials": true
            },
            "runs": 3,
            "totalCollected": 921,
            "successStreak": 3,
            "lastRunAt": "2026-07-14T09:36:12.000Z",
            "lastCollected": 312,
            "lastSuccess": true,
            "lastError": null,
            "streakProtection": {
                "enabled": true,
                "remainingDays": 1,
                "streakCounter": 9,
                "updatedAt": "7/14/2026, 11:30:44 AM"
            },
            "edgeBrowsing": {
                "status": "complete",
                "reportsCompleted": 6,
                "reportsTotal": 6,
                "reportsRemaining": 0,
                "scheduledMinutesCovered": 30,
                "estimatedRemainingMinutes": 0,
                "accepted": 6,
                "duplicates": 0,
                "failed": 0,
                "elapsedMinutes": 31.2,
                "updatedAt": "7/14/2026, 12:01:39 PM"
            }
        }
    ],
    "count": 1
}
```

The `runs`, `totalCollected`, `successStreak`, and `last*` fields are calculated
from this API process's in-memory history and therefore reset after an API
restart.

## Session management

The session endpoints use the `sessions.db` located under the configured
`sessionPath`. They require the normal API token whenever `API_TOKEN` is set.

Session contents are authentication material. The API deliberately returns only
safe metadata such as account, platform, update time, cookie count, and whether
storage/fingerprint data exists. Cookie values, storage state, and fingerprint
contents are never returned.

### `GET /sessions`

Lists every stored mobile and desktop session.

**cURL**

```bash
curl --request GET \
  --url http://127.0.0.1:3010/sessions \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/sessions')
console.log(data.sessions)
```

```json
{
    "databaseExists": true,
    "sessions": [
        {
            "email": "user@example.com",
            "platform": "desktop",
            "updatedAt": "2026-07-17T08:30:00.000Z",
            "hasStorageState": true,
            "hasFingerprint": true,
            "cookieCount": 18
        },
        {
            "email": "user@example.com",
            "platform": "mobile",
            "updatedAt": "2026-07-17T08:31:00.000Z",
            "hasStorageState": true,
            "hasFingerprint": true,
            "cookieCount": 21
        }
    ],
    "count": 2,
    "accounts": 1
}
```

When no session database exists, the endpoint still returns `200 OK` with
`databaseExists: false`, empty `sessions`, and zero counts. A `cookieCount` of
`null` means the stored JSON could not be parsed; no cookie data is disclosed.

### `DELETE /sessions/:email`

Deletes all stored platforms for one case-insensitive, exact account email. The
email must be URL-encoded as one path value. There is intentionally no API
endpoint for deleting all sessions.

The bot must be idle. Deleting while a run is starting, running, or stopping
returns `409 Conflict`, because an active process could otherwise write the
session back after deletion.

**cURL**

```bash
curl --request DELETE \
  --url http://127.0.0.1:3010/sessions/user%40example.com \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const email = 'user@example.com'
const { data } = await api.delete(`/sessions/${encodeURIComponent(email)}`)
console.log(data)
```

```json
{
    "deleted": true,
    "found": true,
    "removed": 2,
    "email": "user@example.com",
    "platforms": ["desktop", "mobile"]
}
```

If the account has no stored sessions, the endpoint returns `404 Not Found`
with code `SESSION_NOT_FOUND`. `DELETE /sessions` without an email and invalid
email paths return `400 Bad Request`. The endpoint accepts no JSON body.

## Reading diagnostics

### `GET /diagnostics`

Lists diagnostic capture directories found under `API_DIAGNOSTICS_DIR`.

**cURL**

```bash
curl --request GET \
  --url http://127.0.0.1:3010/diagnostics \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/diagnostics')
console.log(data.entries)
```

```jsonc
{
    "dir": "/app/diagnostics",
    "count": 1,
    "entries": [
        {
            "name": "error-2026-07-14T09:35:10.000Z",
            "createdAt": "2026-07-14T09:35:11.400Z",
            "hasScreenshot": true,
            "hasHtml": true,
            "hasError": true,
            "error": "Page closed unexpectedly\n..."
        }
    ]
}
```

Each capture can expose only these filenames:

- `screenshot.png`;
- `error.txt`;
- `dump.html`.

Examples:

**cURL - download a screenshot**

```bash
curl --request GET \
  --url 'http://127.0.0.1:3010/diagnostics/error-2026-07-14T09:35:10.000Z/screenshot.png' \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --output screenshot.png
```

**Axios - download a screenshot in Node.js**

```js
import { writeFile } from 'node:fs/promises'

const response = await api.get('/diagnostics/error-2026-07-14T09:35:10.000Z/screenshot.png', {
    responseType: 'arraybuffer'
})

await writeFile('screenshot.png', response.data)
```

Use the same URL pattern with `error.txt` or `dump.html`. In a browser, request
binary files with `responseType: 'blob'` instead of `arraybuffer`.

`dump.html` is returned as a download rather than rendered inline.

## Starting and controlling runs

All control endpoints accept JSON. Always send `Content-Type: application/json`
for consistent behavior across clients and proxies.

### `POST /start`

Starts the bot and returns `202 Accepted` once the child process has been
created. The run may still briefly be in the `starting` state.

Supported body fields:

| Field                    | Type                   | Description                                                                            |
| ------------------------ | ---------------------- | -------------------------------------------------------------------------------------- |
| `accountIndex`           | positive integer       | Run only one configured `ACCOUNT_<N>` slot.                                            |
| `excludedAccountIndexes` | positive integer array | Run every configured account except these slots.                                       |
| `args`                   | string array           | Replace the API's default child-process arguments for this run.                        |
| `env`                    | object                 | Add child-process-only environment overrides. Requires `API_ALLOW_ENV_OVERRIDES=true`. |

`accountIndex` and `excludedAccountIndexes` are mutually exclusive.

#### Start all configured accounts

**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/start \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{}'
```

**Axios**

```js
const { data } = await api.post('/start', {})
console.log(data)
```

```jsonc
{
    "started": true,
    "selectedAccount": null,
    "excludedAccounts": [],
    "pid": 18420,
    "startedAt": "2026-07-14T09:30:00.000Z",
    "command": "node",
    "args": ["/app/dist/index.js"]
}
```

#### Start only one account

The index refers to its original `.env` slot, not its position in the
`/accounts` response.

**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/start \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"accountIndex":2}'
```

**Axios**

```js
const { data } = await api.post('/start', {
    accountIndex: 2
})
console.log(data)
```

```jsonc
{
    "started": true,
    "selectedAccount": {
        "index": 2,
        "email": "user@example.com"
    },
    "excludedAccounts": [],
    "pid": 18420,
    "startedAt": "2026-07-14T09:30:00.000Z",
    "command": "node",
    "args": ["/app/dist/index.js"]
}
```

Internally, the selected account's complete `ACCOUNT_2_*` environment is copied
to `ACCOUNT_1_*` only for the new child process. Credentials remain inside the
API process and are not included in the HTTP response.

#### Start all except selected accounts

**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/start \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"excludedAccountIndexes":[2,4]}'
```

**Axios**

```js
const { data } = await api.post('/start', {
    excludedAccountIndexes: [2, 4]
})
console.log(data)
```

Remaining accounts are densely remapped in the child environment. For example,
if slots 1, 2, and 3 exist and slot 2 is excluded, original slots 1 and 3 become
child slots 1 and 2. The original indexes are still used by the API request and
response.

Unknown slots and attempts to exclude every configured account return
`400 Bad Request`.

#### Override launch arguments

**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/start \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"args":["/app/dist/index.js","--example-flag"]}'
```

**Axios**

```js
const { data } = await api.post('/start', {
    args: ['/app/dist/index.js', '--example-flag']
})
console.log(data)
```

The `args` array replaces the configured/default argument array; it is not
appended to it. Every element must be a string.

#### Add per-run environment variables

First enable the feature:

```dotenv
API_ALLOW_ENV_OVERRIDES=true
```

Then send an `env` object:

**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/start \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"env":{"EXAMPLE_FLAG":"true","EXAMPLE_LIMIT":10}}'
```

**Axios**

```js
const { data } = await api.post('/start', {
    env: {
        EXAMPLE_FLAG: 'true',
        EXAMPLE_LIMIT: 10
    }
})
console.log(data)
```

String, number, and boolean values are converted to strings and exist only in
the child process; `null` values are ignored. Arrays and objects are rejected.
The following launch-hijacking keys are always discarded, case-insensitively:

- `NODE_OPTIONS`;
- `NODE_PATH`;
- `LD_PRELOAD`;
- `DYLD_INSERT_LIBRARIES`;
- `ELECTRON_RUN_AS_NODE`.

Account selection also uses a child-only environment override and works even
when arbitrary `env` overrides are disabled.

#### Start errors

A second start request while a run is `starting`, `running`, or `stopping`
returns:

```http
HTTP/1.1 409 Conflict
```

```json
{
    "error": "Cannot start: a run is already running.",
    "code": "ALREADY_RUNNING"
}
```

### `POST /stop`

Requests termination of the active bot process.

Graceful stop:

**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/stop \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{}'
```

**Axios**

```js
const { data } = await api.post('/stop', {})
console.log(data)
```

Forced stop:

**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/stop \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"force":true}'
```

**Axios**

```js
const { data } = await api.post('/stop', {
    force: true
})
console.log(data)
```

Response:

```json
{
    "stopping": true,
    "force": false
}
```

The endpoint returns `202 Accepted` immediately after requesting termination.
A normal stop sends `SIGTERM`; if the process is still alive after
`API_STOP_TIMEOUT_MS`, the API escalates to `SIGKILL`. On Windows,
`taskkill /T /F` terminates the process tree.

Stopping while idle returns `409 Conflict` with code `NOT_RUNNING`.

### `POST /restart`

Stops the current run if necessary and then starts a new run. It accepts the
same `accountIndex`, `excludedAccountIndexes`, `args`, and `env` fields as
`/start`, plus `force` for the stop phase.

**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/restart \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"force":false,"accountIndex":2}'
```

**Axios**

```js
const { data } = await api.post('/restart', {
    force: false,
    accountIndex: 2
})
console.log(data)
```

```jsonc
{
    "restarted": true,
    "selectedAccount": {
        "index": 2,
        "email": "user@example.com"
    },
    "excludedAccounts": [],
    "pid": 19002,
    "startedAt": "2026-07-14T09:40:00.000Z",
    "command": "node",
    "args": ["/app/dist/index.js"]
}
```

When the API is already idle, `/restart` simply starts a new run.

### `POST /shutdown`

Terminates the API itself after sending a `202 Accepted` response. If the bot is
running, the API stops it first.

**cURL**

```bash
curl --request POST \
  --url http://127.0.0.1:3010/shutdown \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"force":false}'
```

**Axios**

```js
const { data } = await api.post('/shutdown', {
    force: false
})
console.log(data)
```

```json
{
    "shuttingDown": true,
    "stoppingBot": true
}
```

Use this carefully: after the response, the API port becomes unavailable until
the service is started again by the terminal, PM2, systemd, Docker, or another
supervisor.

## Live event stream with SSE

### `GET /events`

The endpoint returns `text/event-stream` and emits three named event types:

- `hello`: one complete `/status` snapshot immediately after connection;
- `log`: one structured log entry, including a numeric SSE `id`;
- `status`: a complete status snapshot after process-state changes and parsed
  run milestones.

A comment-only keep-alive frame is sent every 15 seconds.

Query parameters:

| Parameter | Default | Behavior                                                                                           |
| --------- | ------: | -------------------------------------------------------------------------------------------------- |
| `replay`  |   `100` | Number of recent log entries replayed on a fresh connection. Clamped from `0` to `API_LOG_BUFFER`. |
| `token`   |   unset | Token for clients such as browser `EventSource` that cannot send headers.                          |

### Terminal stream

```bash
curl --request GET \
  --url 'http://127.0.0.1:3010/events?replay=50' \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --no-buffer
```

Example frames:

```text
event: hello
data: {"state":"running",...}

id: 419
event: log
data: {"id":419,"level":"info","message":"pointsGained=3 ..."}

event: status
data: {"reason":"points","state":"running",...}
```

### Node.js stream with Axios

Axios can expose the raw SSE connection as a Node.js readable stream:

```js
const response = await api.get('/events', {
    params: { replay: 50 },
    responseType: 'stream',
    timeout: 0
})

response.data.setEncoding('utf8')
response.data.on('data', chunk => {
    process.stdout.write(chunk)
})

response.data.on('error', error => {
    console.error('SSE stream failed:', error)
})
```

This exposes the raw SSE frames. Use an SSE parser when the client needs named
events, event IDs, or automatic reconnection behavior.

### Browser `EventSource`

```js
const baseUrl = 'http://127.0.0.1:3010'
const token = encodeURIComponent('replace-with-your-token')
const events = new EventSource(`${baseUrl}/events?replay=100&token=${token}`)

events.addEventListener('hello', event => {
    const status = JSON.parse(event.data)
    console.log('Connected:', status.state)
})

events.addEventListener('log', event => {
    const entry = JSON.parse(event.data)
    console.log(`[${entry.level}] ${entry.message}`)
})

events.addEventListener('status', event => {
    const status = JSON.parse(event.data)
    console.log('Status update:', status)
})

events.onerror = error => {
    console.error('SSE connection error:', error)
}
```

Browsers automatically send `Last-Event-ID` when reconnecting after receiving
an event with an `id`. The API then replays only newer buffered log entries. If
the requested entries have already fallen out of the ring buffer, they cannot
be recovered from this stateless API.

## Reading and editing configuration

### `GET /config`

Reads the first available `config.json` from the supported repository paths.
Webhook URLs, tokens, and chat identifiers handled by the redactor are replaced
with `***REDACTED***` by default.

**cURL**

```bash
curl --request GET \
  --url http://127.0.0.1:3010/config \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/config')
console.log(data.config)
```

```jsonc
{
    "path": "/app/config.json",
    "redacted": true,
    "config": {
        "headless": true,
        "workers": {
            "doMobileSearch": true,
            "doDesktopSearch": true
        },
        "webhook": {
            "discord": {
                "url": "***REDACTED***"
            }
        }
    }
}
```

To permit an unredacted response, all of these conditions must be true:

1. `API_ALLOW_CONFIG_REVEAL=true`;
2. `API_TOKEN` is configured;
3. the request is authenticated;
4. the request includes `?reveal=1`.

**cURL**

```bash
curl --request GET \
  --url 'http://127.0.0.1:3010/config?reveal=1' \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/config', {
    params: { reveal: 1 }
})
console.log(data.config)
```

Do not expose this endpoint over an untrusted network merely because token auth
is enabled. Treat an unredacted config response as secret material.

### `PATCH /config`

Enable writes first:

```dotenv
API_ALLOW_CONFIG_WRITE=true
```

A patch is recursively merged into the existing config. Nested objects are
merged; arrays replace the existing array as a whole.

**cURL**

```bash
curl --request PATCH \
  --url http://127.0.0.1:3010/config \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"workers":{"doMobileSearch":false}}'
```

**Axios**

```js
const { data } = await api.patch('/config', {
    workers: {
        doMobileSearch: false
    }
})
console.log(data)
```

Successful response:

```json
{
    "ok": true,
    "path": "/app/config.json",
    "via": "bot-ConfigSchema",
    "appliesOnNextRun": true
}
```

The changed config is used by the next bot run. It does not mutate a child
process that is already running.

### `PUT /config`

`PUT` replaces the complete config, so the body must contain every required
field:

**cURL**

```bash
curl --request PUT \
  --url http://127.0.0.1:3010/config \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data-binary @config.json
```

**Axios - Node.js**

```js
import { readFile } from 'node:fs/promises'

const config = JSON.parse(await readFile('./config.json', 'utf8'))

const { data } = await api.put('/config', config)
console.log(data)
```

The API prefers the bot's strict compiled `ConfigSchema` from
`dist/util/Validator.js`, then falls back to `validateConfig` when a custom
validator module exposes only that function. `API_VALIDATOR_MODULE` can point
to another compiled module. If no bot validator is available, a structural
fallback checks the current core field types.

Validation failures return `422 Unprocessable Entity`:

```jsonc
{
    "error": "Config validation failed",
    "via": "bot-ConfigSchema",
    "errors": ["workers.doMobileSearch: Expected boolean, received string"]
}
```

When writes are disabled, `PUT` and `PATCH` return `403 Forbidden`.

## Reading and editing the schedule

The schedule endpoints expose the cron schedule used by the Docker-integrated
API mode. Reading is always available. Writing must be explicitly enabled and
is intended for the Docker image, where the cron template and `crontab` command
are present.

The effective schedule comes from one of two sources:

1. `config/schedule.json`, after a schedule has been written through the API;
2. `CRON_SCHEDULE`, when no persisted override exists.

A persisted override takes precedence over `CRON_SCHEDULE` across container
restarts because the file is stored in the existing `./config` volume.

### `GET /schedule`

Returns the effective schedule and whether this API instance permits changes.

**cURL**

```bash
curl --request GET \
  --url http://127.0.0.1:3010/schedule \
  --header 'Authorization: Bearer YOUR_API_TOKEN'
```

**Axios**

```js
const { data } = await api.get('/schedule')
console.log(data)
```

Response when the schedule still comes from the container environment:

```json
{
    "enabled": true,
    "cron": "0 7 * * *",
    "skipIfRunning": true,
    "excludedAccountIndexes": [],
    "updatedAt": null,
    "timezone": "Europe/Amsterdam",
    "source": "env",
    "writable": false
}
```

Fields:

- `enabled`: whether a cron job should be installed;
- `cron`: the effective five-field cron expression, or `null` when none exists;
- `skipIfRunning`: stored scheduler preference. The integrated Docker trigger
  already exits cleanly when another run is active;
- `excludedAccountIndexes`: original `ACCOUNT_<N>` slots omitted from scheduled
  runs;
- `updatedAt`: time the persisted override was last written, otherwise `null`;
- `timezone`: the active `TZ` value. Change `TZ` in the container environment,
  not through this endpoint;
- `source`: `env` for `CRON_SCHEDULE` or `override` for
  `config/schedule.json`;
- `writable`: whether `API_ALLOW_SCHEDULE_WRITE=true` is active.

### `PUT /schedule` and `PATCH /schedule`

Enable schedule writes in the API process first:

```dotenv
API_ALLOW_SCHEDULE_WRITE=true
```

For this endpoint, `PUT` and `PATCH` have the same partial-update behavior: only
fields present in the JSON body are changed. The result is written atomically to
`config/schedule.json`, then the live crontab is replaced immediately. A
container restart is not required.

Supported body fields:

| Field                    | Type                   | Description                                                                |
| ------------------------ | ---------------------- | -------------------------------------------------------------------------- |
| `enabled`                | boolean                | Install or remove the cron job. Enabling requires a valid `cron` value.    |
| `cron`                   | string                 | Numeric five-field cron expression, such as `0 7 * * *`.                   |
| `skipIfRunning`          | boolean                | Scheduler preference retained in the persisted schedule.                   |
| `excludedAccountIndexes` | positive integer array | Account slots excluded when cron or `RUN_ON_START` triggers a run via API. |

The cron parser accepts `*`, numeric values, comma-separated values, ranges,
and steps within the normal five-field ranges. Named months/weekdays and macros
such as `@daily` are not accepted.

**cURL - enable a daily 07:00 schedule and exclude `ACCOUNT_2`**

```bash
curl --request PATCH \
  --url http://127.0.0.1:3010/schedule \
  --header 'Authorization: Bearer YOUR_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"enabled":true,"cron":"0 7 * * *","skipIfRunning":true,"excludedAccountIndexes":[2]}'
```

**Axios**

```js
const { data } = await api.patch('/schedule', {
    enabled: true,
    cron: '0 7 * * *',
    skipIfRunning: true,
    excludedAccountIndexes: [2]
})

console.log(data)
```

```json
{
    "enabled": true,
    "cron": "0 7 * * *",
    "skipIfRunning": true,
    "excludedAccountIndexes": [2],
    "updatedAt": "2026-07-16T19:30:00.000Z",
    "timezone": "Europe/Amsterdam",
    "source": "override",
    "writable": true
}
```

Disable the saved schedule without deleting its other settings:

```js
await api.patch('/schedule', { enabled: false })
```

Disabling removes the live crontab, but the override file remains authoritative.
To return to the original `CRON_SCHEDULE` environment default, delete
`config/schedule.json` and restart the container. There is no `DELETE /schedule`
endpoint.

Invalid cron expressions, non-array exclusions, non-positive indexes, or
enabling without a cron expression return `400 Bad Request`. When writes are
disabled, both methods return `403 Forbidden`. Outside the supplied Docker
image, a write can return `500` if the cron template or `crontab` executable is
not available.

## Axios response and error handling

Axios places a successful JSON response in `response.data`:

```js
const response = await api.get('/points')

console.log(response.status) // 200
console.log(response.data) // parsed JSON response
```

For API errors, inspect `error.response.status` and `error.response.data`:

```js
import axios from 'axios'

try {
    const { data } = await api.post('/start', {
        accountIndex: 2
    })

    console.log(data)
} catch (error) {
    if (axios.isAxiosError(error) && error.response) {
        console.error('HTTP status:', error.response.status)
        console.error('API error:', error.response.data)
    } else {
        console.error('Request failed:', error)
    }
}
```

Do not use a normal Axios JSON request for browser SSE. Use `EventSource` for
`/events`. For diagnostic files, set `responseType` to `blob` in browsers or
`arraybuffer` in Node.js.

## PowerShell examples

PowerShell's `Invoke-RestMethod` is convenient on Windows:

```powershell
$BaseUrl = 'http://127.0.0.1:3010'
$Headers = @{ Authorization = "Bearer $env:API_TOKEN" }

# Health
Invoke-RestMethod -Uri "$BaseUrl/health" -Headers $Headers

# Start only ACCOUNT_2
$Body = @{ accountIndex = 2 } | ConvertTo-Json
Invoke-RestMethod `
    -Method Post `
    -Uri "$BaseUrl/start" `
    -Headers $Headers `
    -ContentType 'application/json' `
    -Body $Body

# Exclude ACCOUNT_2 and ACCOUNT_4
$Body = @{ excludedAccountIndexes = @(2, 4) } | ConvertTo-Json
Invoke-RestMethod `
    -Method Post `
    -Uri "$BaseUrl/start" `
    -Headers $Headers `
    -ContentType 'application/json' `
    -Body $Body

# Stop gracefully
Invoke-RestMethod `
    -Method Post `
    -Uri "$BaseUrl/stop" `
    -Headers $Headers `
    -ContentType 'application/json' `
    -Body '{}'
```

For raw SSE output in a Windows terminal, use `curl.exe` rather than PowerShell's
`curl` alias:

```powershell
curl.exe -sN `
  -H "Authorization: Bearer $env:API_TOKEN" `
  "http://127.0.0.1:3010/events?replay=50"
```

## HTTP status codes

|                      Status | Meaning in this API                                                                  |
| --------------------------: | ------------------------------------------------------------------------------------ |
|                    `200 OK` | Successful read, config/schedule update, or account session deletion.                |
|              `202 Accepted` | Start, stop, restart, or shutdown request accepted.                                  |
|            `204 No Content` | Successful CORS preflight.                                                           |
|           `400 Bad Request` | Invalid JSON, account/email selection, arguments, schedule, oversized body, or path. |
|          `401 Unauthorized` | Token required and missing or incorrect.                                             |
|             `403 Forbidden` | Config writes, schedule writes, or arbitrary environment overrides are disabled.     |
|             `404 Not Found` | Unknown endpoint, missing config/session, capture, or artifact.                      |
|              `409 Conflict` | Conflicting run state, including session deletion while a run is active.             |
|  `422 Unprocessable Entity` | Proposed config failed validation.                                                   |
| `500 Internal Server Error` | Unexpected process, file, cron, validator, or request-handling failure.              |

Most errors use this shape:

```json
{
    "error": "Human-readable explanation",
    "code": "OPTIONAL_MACHINE_CODE"
}
```

## Environment variables

All variables are optional.

| Variable                   | Default                       | Purpose                                                                                     |
| -------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------- |
| `API_HOST`                 | `127.0.0.1`                   | Interface to bind. Use `0.0.0.0` only when remote/container access is required.             |
| `API_PORT`                 | `3010`                        | HTTP listen port.                                                                           |
| `API_TOKEN`                | unset                         | Shared token required by every endpoint when configured.                                    |
| `API_CORS_ORIGIN`          | `*`                           | Value returned in `Access-Control-Allow-Origin`.                                            |
| `API_LOG_BUFFER`           | `2000`                        | Maximum structured log entries kept in memory.                                              |
| `API_RUN_HISTORY`          | `20`                          | Maximum completed runs kept in memory.                                                      |
| `API_STOP_TIMEOUT_MS`      | `15000`                       | Graceful-stop window before forced termination.                                             |
| `API_RUN_COMMAND`          | auto                          | Override the executable used to launch the bot.                                             |
| `API_RUN_ARGS`             | none                          | Default arguments for `API_RUN_COMMAND`; accepts whitespace-separated text or a JSON array. |
| `API_DIAGNOSTICS_DIR`      | `<repo>/diagnostics`          | Read-only diagnostics directory.                                                            |
| `API_ALLOW_CONFIG_WRITE`   | `false`                       | Permit `PUT` and `PATCH /config`.                                                           |
| `API_ALLOW_SCHEDULE_WRITE` | `false`                       | Permit `PUT` and `PATCH /schedule`.                                                         |
| `API_ALLOW_ENV_OVERRIDES`  | `false`                       | Permit arbitrary `env` fields in `/start` and `/restart`.                                   |
| `API_ALLOW_CONFIG_REVEAL`  | `false`                       | Permit authenticated `GET /config?reveal=1`.                                                |
| `API_VALIDATOR_MODULE`     | auto                          | Path to a compiled module exporting `validateConfig` or `ConfigSchema`.                     |
| `SCHEDULE_FILE`            | `<repo>/config/schedule.json` | Override the persisted schedule file path.                                                  |
| `CRON_SCHEDULE`            | unset                         | Base schedule reported and used when no persisted schedule override exists.                 |
| `TZ`                       | `UTC`                         | Timezone used by cron and returned by `/schedule`.                                          |

The Docker entrypoint also uses `API_MODE=true` to run this API as the main
container process. In that mode, scheduled and `RUN_ON_START` executions are
routed through `POST /start`, so the API can observe and control them.

The equivalent CLI flags are `--host`, `--port`, and `--token`:

```bash
node scripts/api/server.js \
  --host 0.0.0.0 \
  --port 3010 \
  --token "YOUR_API_TOKEN"
```

Through npm, include npm's argument separator:

```bash
npm run api -- --host 0.0.0.0 --port 3010 --token "YOUR_API_TOKEN"
```

`API_HOST` and `API_TOKEN` take precedence over their CLI equivalents when they
are already defined in the process environment or loaded `.env`. The `--port`
flag takes precedence over `API_PORT`; invalid port values are rejected at
startup.

The API normally launches `dist/index.js` with the current Node executable. If
that file is missing, it falls back to the local `ts-node` CLI and
`src/index.ts`.

An explicit `API_RUN_COMMAND=npm.cmd` is redirected through npm's JavaScript CLI
to avoid Windows `spawn EINVAL` problems. Other `.cmd` and `.bat` overrides are
rejected because the API intentionally does not use an injection-prone shell.

## Security guidance

This service can start and stop processes, read logs and session metadata,
delete an account's sessions, and potentially reveal or update configuration.
Treat it as an administrative API.

- Keep `API_HOST=127.0.0.1` when only local applications need access.
- Always set `API_TOKEN` before binding to `0.0.0.0` or another non-loopback
  address.
- Use a reverse proxy such as Caddy, nginx, or Traefik for TLS when traffic can
  leave the machine.
- Restrict `API_CORS_ORIGIN` to the actual dashboard origin instead of `*` when
  a browser accesses the API directly.
- Leave config writes, schedule writes, config reveal, and arbitrary environment
  overrides disabled unless they are required.
- Avoid putting the API token in URLs except where browser SSE requires it.
- Do not expose the port directly to the public internet.

The token is compared using a constant-time comparison after verifying equal
length.

## Keeping the API running

Run it under a process supervisor for long-lived use.

### Development terminal

```bash
npm run api
```

### PM2

```bash
pm2 start scripts/api/server.js --name mrs-api
pm2 save
```

### systemd

Example service commands:

```ini
WorkingDirectory=/opt/microsoft-rewards-script
EnvironmentFile=/opt/microsoft-rewards-script/.env
ExecStart=/usr/bin/node /opt/microsoft-rewards-script/scripts/api/server.js
Restart=on-failure
```

### Docker

Enable API mode, authenticate it, and publish the port in `compose.yaml`:

```yaml
services:
    microsoft-rewards-script:
        environment:
            API_MODE: 'true'
            API_TOKEN: '${API_TOKEN}'
            API_ALLOW_SCHEDULE_WRITE: 'true' # optional
            API_ALLOW_CONFIG_WRITE: 'true' # optional
        ports:
            - '3010:3010'
```

Put the matching token in `.env`:

```dotenv
API_TOKEN=replace-with-a-long-random-token
```

The supplied Docker entrypoint defaults `API_HOST` to `0.0.0.0` in API mode so
the published port is reachable. `CRON_SCHEDULE` remains the base schedule until
`PUT` or `PATCH /schedule` creates `./config/schedule.json`. Cron-triggered and
`RUN_ON_START` executions call the local API, so they appear in `/status`,
`/logs`, `/points`, `/events`, and `/history` just like manual runs.

## Startup readiness

After the HTTP server begins listening, it writes one machine-readable line to
stdout:

```text
__API_READY__ {"host":"127.0.0.1","port":3010,"pid":1234,"name":"microsoft-rewards-script","version":"4.1.0","auth":true}
```

A launcher can wait for this line rather than relying on a fixed startup delay.
If the port is already occupied, the API exits with an error instead of silently
starting a second unusable instance.

## File layout

| File                | Responsibility                                                                        |
| ------------------- | ------------------------------------------------------------------------------------- |
| `server.js`         | HTTP routing, authentication, CORS, SSE, diagnostics, config, and schedule endpoints. |
| `processManager.js` | Child-process lifecycle, process-tree termination, log buffering, and status events.  |
| `logParser.js`      | Structured log parsing and live run/point accumulation.                               |
| `accounts.js`       | Safe account summaries and child-only account selection/remapping.                    |
| `configEditor.js`   | Config loading, validation, deep merge, backup, and atomic replacement.               |
| `scheduleStore.js`  | Schedule validation, persistence, reads, and live crontab application.                |
| `sessionStore.js`   | Safe session metadata reads and account-specific SQLite session deletion.             |
| `apply-schedule.js` | Restores a persisted schedule override during Docker startup.                         |
| `trigger.js`        | Routes Docker cron and `RUN_ON_START` executions through the local API.               |
| `runCommand.js`     | Cross-platform resolution of the command used to launch the bot.                      |
| `lib.js`            | Environment, project-root, logging, config-redaction, and argument helpers.           |
