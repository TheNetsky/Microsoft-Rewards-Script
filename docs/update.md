# 🔄 Auto-Update

**Keep script up to date automatically**

---

## 💡 What Is It?

After each run, script checks for updates and installs them automatically.

**Already enabled by default!**

---

## ⚡ How It Works

### After Each Run

1. **Fetch latest** from GitHub
2. **Pull changes** (safe fast-forward only)
3. **Install dependencies** (`npm ci`)
4. **Rebuild** (`npm run build`)

**No action needed from you!**

---

## ⚙️ Configuration

```jsonc
{
  "update": {
    "git": true,     // Auto-update from Git
    "docker": false  // Docker container updates (if using Docker)
  }
}
```

---

## 🐳 Docker Updates

If using Docker:

```jsonc
{
  "update": {
    "git": false,
    "docker": true
  }
}
```

Pulls latest Docker image and restarts container.

---

## 🛠️ Manual Update

### Git
```bash
git pull
npm ci
npm run build
```

### Docker
```bash
docker compose pull
docker compose up -d
```

---

## ⚠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| **"Not a git repository"** | Clone repo (don't download ZIP) |
| **"Local changes"** | Commit or stash your changes |
| **"Update failed"** | Check internet connection |

### Reset to Remote

```bash
git fetch origin
git reset --hard origin/v2
npm ci
npm run build
```

---

## 📚 Next Steps

**Need security tips?**  
→ **[Security Guide](./security.md)**

**Setup scheduler?**  
→ **[Scheduler Guide](./schedule.md)**

---

**[← Back to Hub](./index.md)** | **[Config Guide](./config.md)**
