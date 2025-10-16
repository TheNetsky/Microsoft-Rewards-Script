# 🔍 Diagnostics

**Auto-capture errors with screenshots and HTML**

---

## 💡 What Is It?

When errors occur, the script automatically saves:
- 📸 **Screenshots** — Visual error capture
- 📄 **HTML snapshots** — Page source

Helps you debug issues without re-running the script.

---

## ⚡ Quick Start

**Already enabled by default!**

```jsonc
{
  "diagnostics": {
    "enabled": true,
    "saveScreenshot": true,
    "saveHtml": true,
    "maxPerRun": 2,
    "retentionDays": 7
  }
}
```

---

## 📁 Where Are Files Saved?

```
reports/
├── 2025-10-16/
│   ├── error_abc123_001.png
│   ├── error_abc123_001.html
│   └── error_def456_002.png
└── 2025-10-17/
    └── ...
```

**Auto-cleanup:** Files older than 7 days are deleted automatically.

---

## 🎯 When It Captures

- ⏱️ **Timeouts** — Page navigation failures
- 🎯 **Element not found** — Selector errors
- 🔐 **Login failures** — Authentication issues
- 🌐 **Network errors** — Request failures

---

## 🔧 Configuration Options

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Enable diagnostics |
| `saveScreenshot` | `true` | Capture PNG screenshots |
| `saveHtml` | `true` | Save page HTML |
| `maxPerRun` | `2` | Max captures per run |
| `retentionDays` | `7` | Auto-delete after N days |

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| **No captures despite errors** | Check `enabled: true` |
| **Too many files** | Reduce `retentionDays` |
| **Permission denied** | Check `reports/` write access |

### Manual Cleanup

```powershell
# Delete all diagnostic reports
Remove-Item -Recurse -Force reports/

# Keep last 3 days only
Get-ChildItem reports/ | Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-3)} | Remove-Item -Recurse
```

---

## 📚 Next Steps

**Need live notifications?**  
→ **[Discord Webhooks](./conclusionwebhook.md)**  
→ **[NTFY Push](./ntfy.md)**

**Security issues?**  
→ **[Security Guide](./security.md)**

---

**[← Back to Hub](./index.md)** | **[Config Guide](./config.md)**
