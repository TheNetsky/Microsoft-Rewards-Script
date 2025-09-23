# Docker Guide

This project ships with a Docker setup tailored for headless runs. It uses Playwright’s Chromium Headless Shell to keep the image small.

## Quick Start
- Ensure you have `src/accounts.json` and `src/config.json` in the repo
- Build and start:
  - `docker compose up -d`
- Follow logs:
  - `docker logs -f microsoft-rewards-script`

## Volumes & Files
The compose file mounts:
- `./src/accounts.json` → `/usr/src/microsoft-rewards-script/accounts.json` (read‑only)
- `./src/config.json` → `/usr/src/microsoft-rewards-script/config.json` (read‑only)
- `./sessions` → `/usr/src/microsoft-rewards-script/sessions` (persist login sessions)

You can also use env overrides supported by the app loader:
- `ACCOUNTS_FILE=/path/to/accounts.json`
- `ACCOUNTS_JSON='[ {"email":"...","password":"..."} ]'`

## Environment
Useful variables:
- `TZ` — container time zone (e.g., `Europe/Paris`)
- `NODE_ENV=production`
- `FORCE_HEADLESS=1` — ensures headless mode inside the container
- Scheduler knobs (optional):
  - `SCHEDULER_DAILY_JITTER_MINUTES_MIN` / `SCHEDULER_DAILY_JITTER_MINUTES_MAX`
  - `SCHEDULER_PASS_TIMEOUT_MINUTES`
  - `SCHEDULER_FORK_PER_PASS`

## Headless Browsers
The Docker image installs only Chromium Headless Shell via:
- `npx playwright install --with-deps --only-shell`

This dramatically reduces image size vs. installing all Playwright browsers.

## One‑shot vs. Scheduler
- Default command runs the built‑in scheduler: `npm run start:schedule`
- For one‑shot run, override the command:
  - `docker run --rm ... node ./dist/index.js`

## Tips
- If you see 2FA prompts, add your TOTP Base32 secret to `accounts.json` so the bot can auto‑fill codes.
- Use a persistent `sessions` volume to avoid re‑logging every run.
- For proxies per account, fill the `proxy` block in your `accounts.json` (see [Proxy](./proxy.md)).