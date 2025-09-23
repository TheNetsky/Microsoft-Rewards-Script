# 🔍 Diagnostics & Error Capture

<div align="center">

**🛠️ Automatic error screenshots and HTML snapshots**  
*Debug smarter with visual evidence*

</div>

---

## 🎯 What is Diagnostics?

The diagnostics system **automatically captures** error screenshots and HTML snapshots when issues occur during script execution, providing visual evidence for troubleshooting.

### **Key Features**
- 📸 **Auto-screenshot** — Visual error capture
- 📄 **HTML snapshots** — Complete page source
- 🚦 **Rate limiting** — Prevents storage bloat
- 🗂️ **Auto-cleanup** — Configurable retention
- 🔒 **Privacy-safe** — Local storage only

---

## ⚙️ Configuration

### **Basic Setup**
Add to `src/config.json`:
```json
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

### **Configuration Options**

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Master toggle for diagnostics capture |
| `saveScreenshot` | `true` | Capture PNG screenshots on errors |
| `saveHtml` | `true` | Save page HTML content on errors |
| `maxPerRun` | `2` | Maximum captures per script run |
| `retentionDays` | `7` | Auto-delete reports older than N days |

---

## 🚀 How It Works

### **Automatic Triggers**
The system captures when these errors occur:
- ⏱️ **Page navigation timeouts**
- 🎯 **Element selector failures**
- 🔐 **Authentication errors**
- 🌐 **Network request failures**
- ⚡ **JavaScript execution errors**

### **Capture Process**
1. **Error Detection** — Script encounters unhandled error
2. **Visual Capture** — Screenshot + HTML snapshot
3. **Safe Storage** — Local `reports/` folder
4. **Continue Execution** — No blocking or interruption

---

## 📁 File Structure

### **Storage Organization**
```
reports/
├── 2025-01-20/
│   ├── error_abc123_001.png
│   ├── error_abc123_001.html
│   ├── error_def456_002.png
│   └── error_def456_002.html
└── 2025-01-21/
    └── ...
```

### **File Naming Convention**
```
error_[runId]_[sequence].[ext]
```
- **RunId** — Unique identifier for each script execution
- **Sequence** — Incremental counter (001, 002, etc.)
- **Extension** — `.png` for screenshots, `.html` for source

---

## 🧹 Retention Management

### **Automatic Cleanup**
- Runs after each script completion
- Deletes entire date folders older than `retentionDays`
- Prevents unlimited disk usage growth

### **Manual Cleanup**
```powershell
# Remove all diagnostic reports
Remove-Item -Recurse -Force reports/

# Remove reports older than 3 days  
Get-ChildItem reports/ | Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-3)} | Remove-Item -Recurse -Force
```

---

## 📊 Use Cases

| Scenario | Benefit |
|----------|---------|
| **🐛 Development & Debugging** | Visual confirmation of page state during errors |
| **🔍 Element Detection Issues** | HTML source analysis for selector problems |
| **📈 Production Monitoring** | Evidence collection for account issues |
| **⚡ Performance Analysis** | Timeline reconstruction of automation failures |

---

## ⚡ Performance Impact

### **Resource Usage**
- **Screenshots** — ~100-500KB each
- **HTML files** — ~50-200KB each  
- **CPU overhead** — Minimal (only during errors)
- **Memory impact** — Asynchronous, non-blocking

### **Storage Optimization**
- Daily cleanup prevents accumulation
- Rate limiting via `maxPerRun` 
- Configurable retention period

---

## 🎛️ Environment Settings

### **Development Mode**
```json
{
  "diagnostics": {
    "enabled": true,
    "maxPerRun": 5,
    "retentionDays": 14
  }
}
```

### **Production Mode**
```json
{
  "diagnostics": {
    "enabled": true,
    "maxPerRun": 2,
    "retentionDays": 3
  }
}
```

### **Debug Verbose Logging**
```powershell
$env:DEBUG_REWARDS_VERBOSE=1; npm start
```

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| **No captures despite errors** | Check `enabled: true`; verify `reports/` write permissions |
| **Excessive storage usage** | Reduce `maxPerRun`; decrease `retentionDays` |
| **Missing screenshots** | Verify browser screenshot API; check memory availability |
| **Cleanup not working** | Ensure script completes successfully for auto-cleanup |

### **Common Capture Locations**
- **Login issues** — Authentication page screenshots
- **Activity failures** — Element detection errors  
- **Network problems** — Timeout and connection errors
- **Navigation issues** — Page load failures

---

## 🔗 Integration

### **With Notifications**
Diagnostics complement [Discord Webhooks](./conclusionwebhook.md) and [NTFY](./ntfy.md):
- **Webhooks** — Immediate error alerts
- **Diagnostics** — Visual evidence for investigation
- **Combined** — Complete error visibility

### **With Development Workflow**
```bash
# 1. Run script with diagnostics
npm start

# 2. Check for captures after errors
ls reports/$(date +%Y-%m-%d)/

# 3. Analyze screenshots and HTML
# Open .png files for visual state
# Review .html files for DOM structure
```

---

## 🔒 Privacy & Security

- **Local Only** — All captures stored locally
- **No Uploads** — Zero external data transmission
- **Account Info** — May contain sensitive data
- **Secure Storage** — Use appropriate folder permissions
- **Regular Cleanup** — Recommended for sensitive environments

---

## 🔗 Related Guides

- **[Getting Started](./getting-started.md)** — Initial setup and configuration
- **[Discord Webhooks](./conclusionwebhook.md)** — Error notification alerts
- **[NTFY Notifications](./ntfy.md)** — Mobile push notifications
- **[Security](./security.md)** — Privacy and data protection