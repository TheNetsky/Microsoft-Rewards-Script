# ⏰ Scheduler

**Automate daily script execution**

---

## ⚡ Quick Start

### Basic Setup

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

**That's it!** Script runs automatically at 9 AM daily.

---

## 🎯 Common Configurations

### Morning Run
```jsonc
{
  "schedule": {
    "enabled": true,
    "time": "08:00",
    "timeZone": "America/New_York"
  }
}
```

### Evening Run
```jsonc
{
  "schedule": {
    "enabled": true,
    "time": "20:00",
    "timeZone": "Europe/Paris"
  }
}
```

### Multiple Passes Per Day
```jsonc
{
  "schedule": {
    "enabled": true,
    "time": "10:00",
    "timeZone": "America/Los_Angeles"
  },
  "passesPerRun": 2
}
```

---

## 🌍 Common Timezones

| Region | Timezone |
|--------|----------|
| **US East** | `America/New_York` |
| **US West** | `America/Los_Angeles` |
| **UK** | `Europe/London` |
| **France** | `Europe/Paris` |
| **Germany** | `Europe/Berlin` |

[All timezones](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)

---

## 🎲 Advanced: Cron Expressions

Want more control? Use cron:

```jsonc
{
  "schedule": {
    "enabled": true,
    "cron": "0 9 * * *",  // Every day at 9 AM
    "timeZone": "America/New_York"
  }
}
```

### Cron Examples
```bash
"0 7 * * *"      # Every day at 7:00 AM
"30 20 * * *"    # Every day at 8:30 PM
"0 9,21 * * *"   # Twice daily: 9 AM and 9 PM
"0 10 * * 1-5"   # Weekdays only at 10 AM
```

[Cron syntax helper](https://crontab.guru/)

---

## 🏖️ Vacation Mode (Optional)

Skip random days each month to look more natural:

```jsonc
{
  "vacation": {
    "enabled": true,
    "minDays": 3,
    "maxDays": 5
  }
}
```

**Example:** Script will randomly skip 3-5 consecutive days per month.

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| **Scheduler not running** | Check `enabled: true` in config |
| **Wrong execution time** | Verify timezone spelling |
| **Runs multiple times** | Only use ONE scheduler instance |
| **Missed run** | Check if computer was off/sleeping |

### Debug Commands

**Check timezone:**
```powershell
node -e "console.log(new Date().toLocaleString('en-US', {timeZone: 'America/New_York'}))"
```

**Validate config:**
```powershell
npm run typecheck
```

---

## 🐳 Docker Integration

### Built-in Scheduler (Recommended)
```yaml
services:
  rewards:
    build: .
    command: ["npm", "run", "start:schedule"]
    environment:
      TZ: Europe/Paris
```

Uses config from `src/config.jsonc`.

---

## 📚 Next Steps

**Want natural behavior?**  
→ **[Humanization Guide](./humanization.md)**

**Need notifications?**  
→ **[Discord Webhooks](./conclusionwebhook.md)**

**Docker setup?**  
→ **[Docker Guide](./docker.md)**

---

**[← Back to Hub](./index.md)** | **[Getting Started](./getting-started.md)**
