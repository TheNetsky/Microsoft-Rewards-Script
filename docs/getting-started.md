# 🚀 Getting Started

**From zero to your first run in 10 minutes**

---

## ✅ Requirements

- **Node.js 20+** → [Download here](https://nodejs.org/)
- **Microsoft accounts** with email + password
- *Optional:* Docker for containers

---

## ⚡ Quick Setup (Recommended)

### Windows
```powershell
setup\setup.bat
```

### Linux / macOS
```bash
bash setup/setup.sh
```

### What Does It Do?

1. ✅ Asks for your Microsoft credentials
2. ✅ Creates `accounts.json` automatically
3. ✅ Installs dependencies
4. ✅ Builds the project
5. ✅ Runs your first automation (optional)

**That's it! 🎉**

---

## 🎯 After Installation

### 1️⃣ Enable Scheduler (Recommended)

Run automatically once per day:

**Edit** `src/config.jsonc`:
```jsonc
{
  "schedule": {
    "enabled": true,
    "time": "09:00",
    "timeZone": "America/New_York"
  }
}
```

**Start scheduler:**
```bash
npm run start:schedule
```

→ **[Full Scheduler Guide](./schedule.md)**

---

### 2️⃣ Add Notifications (Optional)

Get a summary after each run:

```jsonc
{
  "conclusionWebhook": {
    "enabled": true,
    "url": "https://discord.com/api/webhooks/YOUR_WEBHOOK_URL"
  }
}
```

→ **[Discord Setup](./conclusionwebhook.md)** | **[NTFY Setup](./ntfy.md)**

---

### 3️⃣ Enable Humanization (Anti-Ban)

More natural behavior:

```jsonc
{
  "humanization": {
    "enabled": true
  }
}
```

→ **[Humanization Guide](./humanization.md)**

---

## 🛠️ Common Issues

| Problem | Solution |
|---------|----------|
| **"Node.js not found"** | Install Node.js 20+ and restart terminal |
| **"accounts.json missing"** | Run `setup/setup.bat` or create manually |
| **"Login failed"** | Check email/password in `accounts.json` |
| **"2FA prompt"** | Add TOTP secret → [2FA Guide](./accounts.md) |
| **Script crashes** | Check [Diagnostics Guide](./diagnostics.md) |

---

## 🔧 Manual Setup (Advanced)

<details>
<summary><strong>Click to expand</strong></summary>

```bash
# 1. Configure accounts
cp src/accounts.example.json src/accounts.json
# Edit accounts.json with your credentials

# 2. Install & build
npm install
npm run build

# 3. Run
npm start
```

</details>

---

## 📚 Next Steps

**Everything works?**  
→ **[Setup Scheduler](./schedule.md)** for daily automation

**Need 2FA?**  
→ **[Accounts & TOTP Guide](./accounts.md)**

**Want Docker?**  
→ **[Docker Guide](./docker.md)**

**Having issues?**  
→ **[Diagnostics](./diagnostics.md)**

---

**[← Back to Hub](./index.md)** | **[All Docs](./index.md)**
