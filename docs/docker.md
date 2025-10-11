# 🐳 Docker Guide

<div align="center">

**⚡ Lightweight containerized deployment**  
*Automated Microsoft Rewards with minimal Docker footprint*

</div>

---

## 🚀 Quick Start Checklist

1. `src/accounts.json` populated with your Microsoft credentials
2. `src/config.jsonc` present (defaults are fine; comments stay intact)
3. Docker + Docker Compose installed locally (Desktop app or CLI)

```bash
# Build and start the container (scheduler runs automatically)
docker compose up -d

# Stream logs from the running container
docker logs -f microsoft-rewards-script

# Stop the stack when you are done
docker compose down
```

The compose file uses the same Playwright build as local runs but forces headless mode inside the container via `FORCE_HEADLESS=1`, matching the bundled image.

---

## 📦 What the Compose File Mounts

| Host path | Container path | Purpose |
|-----------|----------------|---------|
| `./src/accounts.json` | `/usr/src/microsoft-rewards-script/accounts.json` | Read-only account credentials |
| `./src/config.jsonc` | `/usr/src/microsoft-rewards-script/config.json` | Read-only runtime configuration |
| `./sessions` | `/usr/src/microsoft-rewards-script/sessions` | Persisted cookies & fingerprints |

Prefer environment variables? The loader accepts the same overrides as local runs:

```bash
ACCOUNTS_FILE=/custom/accounts.json
ACCOUNTS_JSON='[{"email":"name@example.com","password":"hunter2"}]'
```

---

## 🌍 Useful Environment Variables

- `TZ` — set container timezone (`Europe/Paris`, `America/New_York`, etc.)
- `NODE_ENV=production` — default; keeps builds lean
- `FORCE_HEADLESS=1` — required in Docker (Chromium Headless Shell only)
- Scheduler tuning (optional):
  - `SCHEDULER_DAILY_JITTER_MINUTES_MIN` / `SCHEDULER_DAILY_JITTER_MINUTES_MAX`
  - `SCHEDULER_PASS_TIMEOUT_MINUTES`
  - `SCHEDULER_FORK_PER_PASS`

---

## 🧠 Browser Footprint

The Docker image installs Chromium Headless Shell via `npx playwright install --with-deps --only-shell`. This keeps the image compact while retaining Chromium’s Edge-compatible user agent. Installing full Edge or all browsers roughly doubles the footprint and adds instability, so we ship only the shell.

---

## 🔁 Alternate Commands

- **Default:** `npm run start:schedule` (inside container) — keeps the scheduler alive
- **Single pass:** `docker compose run --rm app node ./dist/index.js`
- **Custom script:** Override `command:` in `compose.yaml` to suit your workflow

---

## 💡 Tips

- Add TOTP secrets to `accounts.json` so the bot can respond to MFA prompts automatically
- Keep the `sessions` volume; deleting it forces fresh logins and can trigger security reviews
- Mixing proxies? Configure per-account proxies in `accounts.json` (see [Proxy Setup](./proxy.md))
- Want notifications? Layer [NTFY](./ntfy.md) or [Discord Webhooks](./conclusionwebhook.md) on top once the container is stable

---

## 🔗 Related Guides

- **[Getting Started](./getting-started.md)** — Prep work before switching to containers
- **[Accounts & 2FA](./accounts.md)** — Ensure every account can pass MFA headlessly
- **[Scheduler](./schedule.md)** — If you prefer a host-side cron instead of Docker
- **[Diagnostics](./diagnostics.md)** — Capture logs and debug a failing container