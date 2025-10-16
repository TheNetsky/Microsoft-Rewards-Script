# 🐳 Docker Guide

**Run the script in a container**

---

## ⚡ Quick Start

### 1. Create Required Files

Ensure you have:
- `src/accounts.json` with your credentials
- `src/config.jsonc` (uses defaults if missing)

### 2. Start Container

```bash
docker compose up -d
```

### 3. View Logs

```bash
docker logs -f microsoft-rewards-script
```

**That's it!** Script runs automatically.

---

## 🎯 What's Included

The Docker setup:
- ✅ **Chromium Headless Shell** — Lightweight browser
- ✅ **Scheduler enabled** — Daily automation
- ✅ **Volume mounts** — Persistent sessions
- ✅ **Force headless** — Required for containers

---

## 📁 Mounted Volumes

| Host Path | Container Path | Purpose |
|-----------|----------------|---------|
| `./src/accounts.json` | `/usr/src/.../accounts.json` | Account credentials (read-only) |
| `./src/config.jsonc` | `/usr/src/.../config.json` | Configuration (read-only) |
| `./sessions` | `/usr/src/.../sessions` | Cookies & fingerprints |

---

## 🌍 Environment Variables

### Set Timezone

```yaml
services:
  rewards:
    environment:
      TZ: Europe/Paris
```

### Use Inline JSON

```bash
docker run -e ACCOUNTS_JSON='{"accounts":[...]}' ...
```

### Custom Config Path

```bash
docker run -e ACCOUNTS_FILE=/custom/path/accounts.json ...
```

---

## 🔧 Common Commands

```bash
# Start container
docker compose up -d

# View logs
docker logs -f microsoft-rewards-script

# Stop container
docker compose down

# Rebuild image
docker compose build --no-cache

# Restart container
docker compose restart
```

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| **"accounts.json not found"** | Mount file in `docker-compose.yml` |
| **"Browser launch failed"** | Ensure `FORCE_HEADLESS=1` is set |
| **"Permission denied"** | Check file permissions (`chmod 644`) |
| **Scheduler not running** | Verify `schedule.enabled: true` in config |

### Debug Container

```bash
# Enter container shell
docker exec -it microsoft-rewards-script /bin/bash

# Check Node.js version
docker exec -it microsoft-rewards-script node --version

# View config
docker exec -it microsoft-rewards-script cat config.json
```

---

## 🎛️ Custom Configuration

### Use Built-in Scheduler

**Default** `docker-compose.yml`:
```yaml
services:
  rewards:
    build: .
    command: ["npm", "run", "start:schedule"]
```

### Single Run (Manual)

```yaml
services:
  rewards:
    build: .
    command: ["node", "./dist/index.js"]
```

### External Cron (Alternative)

```yaml
services:
  rewards:
    environment:
      CRON_SCHEDULE: "0 7,16,20 * * *"
      RUN_ON_START: "true"
```

---

## 📚 Next Steps

**Need 2FA?**  
→ **[Accounts & TOTP Setup](./accounts.md)**

**Want notifications?**  
→ **[Discord Webhooks](./conclusionwebhook.md)**

**Scheduler config?**  
→ **[Scheduler Guide](./schedule.md)**

---

**[← Back to Hub](./index.md)** | **[Getting Started](./getting-started.md)**
