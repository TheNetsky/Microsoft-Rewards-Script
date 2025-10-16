# 💾 Job State

**Resume interrupted tasks automatically**

---

## 💡 What Is It?

Saves progress after each completed task. If script crashes or stops, it resumes exactly where it left off.

**Already enabled by default!**

---

## ⚡ How It Works

### Progress Tracking

```
sessions/job-state/
├── account1@email.com/
│   ├── daily-set-2025-10-16.json
│   ├── desktop-search-2025-10-16.json
│   └── mobile-search-2025-10-16.json
└── account2@email.com/
    └── ...
```

- ✅ **Per-account** — Independent progress
- ✅ **Date-specific** — Fresh start each day
- ✅ **Auto-cleanup** — Old files remain for history

---

## 🎯 Benefits

### Interrupted Runs

| Scenario | Without Job State | With Job State |
|----------|-------------------|----------------|
| **Power outage** | Start from beginning | Resume from last task |
| **Manual stop** | Lose all progress | Pick up where left off |
| **Network failure** | Redo everything | Continue remaining tasks |

---

## ⚙️ Configuration

**Already enabled:**
```jsonc
{
  "jobState": {
    "enabled": true,
    "dir": ""  // Empty = use default location
  }
}
```

**Custom location:**
```jsonc
{
  "jobState": {
    "enabled": true,
    "dir": "/custom/path/job-state"
  }
}
```

---

## 🧹 Maintenance

### Reset Progress (Fresh Start)

```powershell
# Reset all accounts
Remove-Item -Recurse -Force sessions/job-state/

# Reset one account
Remove-Item -Recurse -Force sessions/job-state/user@email.com/
```

### Cleanup Old Files

```powershell
# Keep last 7 days only
Get-ChildItem sessions/job-state -Recurse -Filter "*.json" | Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-7)} | Remove-Item
```

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| **Tasks not resuming** | Check file permissions |
| **Duplicate execution** | Ensure system time is accurate |
| **Excessive files** | Implement cleanup schedule |

---

## 📚 Next Steps

**Need scheduler?**  
→ **[Scheduler Guide](./schedule.md)**

**Want diagnostics?**  
→ **[Diagnostics Guide](./diagnostics.md)**

---

**[← Back to Hub](./index.md)** | **[Config Guide](./config.md)**
