# 💾 Job State Persistence

<div align="center">

**🔄 Resume interrupted tasks and track progress across runs**  
*Never lose your progress again*

</div>

---

## 🎯 What is Job State Persistence?

Job state persistence allows the script to **resume interrupted tasks** and **track progress** across multiple runs, ensuring no work is lost when the script is stopped or crashes.

### **Key Features**
- 🔄 **Resumable tasks** — Pick up exactly where you left off
- 📅 **Daily tracking** — Date-specific progress monitoring
- 👤 **Per-account isolation** — Independent progress for each account
- 🛡️ **Corruption protection** — Atomic writes prevent data loss
- 🚀 **Performance optimized** — Minimal overhead

---

## ⚙️ Configuration

### **Basic Setup**
```json
{
  "jobState": {
    "enabled": true,
    "dir": ""
  }
}
```

### **Configuration Options**

| Setting | Description | Default |
|---------|-------------|---------|
| `enabled` | Enable job state persistence | `true` |
| `dir` | Custom directory for state files | `""` (uses `sessions/job-state`) |

---

## 🏗️ How It Works

### **State Tracking**
- 📋 **Monitors completion** status of individual activities
- 🔍 **Tracks progress** for daily sets, searches, and promotional tasks
- ❌ **Prevents duplicates** when script restarts

### **Storage Structure**
```
sessions/job-state/
├── account1@email.com/
│   ├── daily-set-2025-01-20.json
│   ├── desktop-search-2025-01-20.json
│   └── mobile-search-2025-01-20.json
└── account2@email.com/
    ├── daily-set-2025-01-20.json
    └── promotional-tasks-2025-01-20.json
```

### **State File Format**
```json
{
  "date": "2025-01-20",
  "account": "user@email.com",
  "type": "daily-set",
  "completed": [
    "daily-check-in",
    "quiz-1",
    "poll-1"
  ],
  "remaining": [
    "quiz-2", 
    "search-desktop"
  ],
  "lastUpdate": "2025-01-20T10:30:00.000Z"
}
```

---

## 🚀 Key Benefits

### **Resumable Tasks**
- ✅ **Script restarts** pick up where they left off
- ✅ **Individual completion** is remembered
- ✅ **Avoid re-doing** completed activities

### **Daily Reset**
- 📅 **Date-specific** state files
- 🌅 **New day** automatically starts fresh tracking
- 📚 **History preserved** for analysis

### **Account Isolation**
- 👤 **Separate state** per account
- ⚡ **Parallel processing** doesn't interfere
- 📊 **Independent progress** tracking

---

## 📋 Use Cases

### **Interrupted Executions**
| Scenario | Benefit |
|----------|---------|
| **Network issues** | Resume when connection restored |
| **System reboots** | Continue after restart |
| **Manual termination** | Pick up from last checkpoint |
| **Resource exhaustion** | Recover without losing progress |

### **Selective Reruns**
| Feature | Description |
|---------|-------------|
| **Skip completed sets** | Avoid redoing finished daily activities |
| **Resume searches** | Continue partial search sessions |
| **Retry failed tasks** | Target only problematic activities |
| **Account targeting** | Process specific accounts only |

### **Progress Monitoring**
- 📊 **Track completion rates** across accounts
- 🔍 **Identify problematic** activities
- ⏱️ **Monitor task duration** trends
- 🐛 **Debug stuck** or slow tasks

---

## 🛠️ Technical Implementation

### **Checkpoint Strategy**
- 💾 **State saved** after each completed activity
- ⚛️ **Atomic writes** prevent corruption
- 🔒 **Lock-free design** for concurrent access

### **Performance Optimization**
- ⚡ **Minimal I/O overhead** — Fast state updates
- 🧠 **In-memory caching** — Reduce disk access
- 📥 **Lazy loading** — Load state files on demand

### **Error Handling**
- 🔧 **Corrupted files** are rebuilt automatically
- 📁 **Missing directories** created as needed
- 🎯 **Graceful degradation** when disabled

---

## 🗂️ File Management

### **Automatic Behavior**
- 📅 **Date-specific files** — New files for each day
- 💾 **Preserved history** — Old files remain for reference
- 🚀 **No auto-deletion** — Manual cleanup recommended

### **Manual Maintenance**
```powershell
# Clean state files older than 7 days
Get-ChildItem sessions/job-state -Recurse -Filter "*.json" | Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-7)} | Remove-Item

# Reset all job state (start fresh)
Remove-Item -Recurse -Force sessions/job-state/

# Reset specific account state
Remove-Item -Recurse -Force sessions/job-state/user@email.com/
```

---

## 📊 Example Workflows

### **Interrupted Daily Run**
```
Day 1 - 10:30 AM:
✅ Account A: Daily set completed
🔄 Account B: 3/5 daily tasks done
❌ Script crashes

Day 1 - 2:00 PM:
🚀 Script restarts
✅ Account A: Skipped (already complete)
🔄 Account B: Resumes with 2 remaining tasks
```

### **Multi-Day Tracking**
```
Monday:
📅 daily-set-2025-01-20.json created
✅ All tasks completed

Tuesday:
📅 daily-set-2025-01-21.json created  
🔄 Fresh start for new day
📚 Monday's progress preserved
```

---

## 🔍 Debugging Job State

### **State Inspection**
```powershell
# View current state for account
Get-Content sessions/job-state/user@email.com/daily-set-2025-01-20.json | ConvertFrom-Json

# List all state files
Get-ChildItem sessions/job-state -Recurse -Filter "*.json"
```

### **Debug Output**
Enable verbose logging to see state operations:
```powershell
$env:DEBUG_REWARDS_VERBOSE=1; npm start
```

Sample output:
```
[INFO] Loading job state for user@email.com (daily-set)
[INFO] Found 3 completed tasks, 2 remaining
[INFO] Skipping completed task: daily-check-in
[INFO] Starting task: quiz-2
```

---

## 🛠️ Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| **Tasks not resuming** | Missing/corrupt state files | Check file permissions; verify directory exists |
| **Duplicate execution** | Clock sync issues | Ensure system time is accurate |
| **Excessive files** | No cleanup schedule | Implement regular state file cleanup |
| **Permission errors** | Write access denied | Verify sessions/ directory is writable |

### **Common Issues**

#### **Tasks Not Resuming**
```
[ERROR] Failed to load job state: Permission denied
```
**Solutions:**
- ✅ Check file/directory permissions
- ✅ Verify state directory exists
- ✅ Ensure write access to sessions/

#### **Duplicate Task Execution**
```
[WARN] Task appears to be running twice
```
**Solutions:**
- ✅ Check for corrupt state files
- ✅ Verify system clock synchronization
- ✅ Clear state for affected account

#### **Storage Growth**
```
[INFO] Job state directory: 2.3GB (1,247 files)
```
**Solutions:**
- ✅ Implement regular cleanup schedule
- ✅ Remove old state files (7+ days)
- ✅ Monitor disk space usage

---

## 🤝 Integration Features

### **Session Persistence**
- 🍪 **Works alongside** browser session storage
- 🔐 **Complements** cookie and fingerprint persistence
- 🌐 **Independent of** proxy and authentication state

### **Clustering**
- ⚡ **Isolated state** per cluster worker
- 🚫 **No shared state** between parallel processes
- 📁 **Worker-specific** directories

### **Scheduling**
- ⏰ **Persists across** scheduled runs
- 🌅 **Daily reset** at midnight automatically
- 🔄 **Long-running continuity** maintained

---

## ⚙️ Advanced Configuration

### **Custom State Directory**
```json
{
  "jobState": {
    "enabled": true,
    "dir": "/custom/path/to/state"
  }
}
```

### **Disabling Job State**
```json
{
  "jobState": {
    "enabled": false
  }
}
```

**Effects when disabled:**
- ❌ **Tasks restart** from beginning each run
- ❌ **No progress tracking** between sessions
- ❌ **Potential duplicate work** on interruptions
- ✅ **Slightly faster startup** (no state loading)

---

## 📊 Best Practices

### **Development**
- ✅ **Enable for testing** — Consistent behavior
- 🧹 **Clear between changes** — Fresh state for major updates
- 🔍 **Monitor for debugging** — State files reveal execution flow

### **Production**
- ✅ **Always enabled** — Reliability is critical
- 💾 **Regular backups** — State directory backups
- 📊 **Monitor disk usage** — Prevent storage growth

### **Maintenance**
- 🗓️ **Weekly cleanup** — Remove old state files
- 🔍 **Health checks** — Verify state integrity
- 📝 **Usage monitoring** — Track storage trends

---

## 🔗 Related Guides

- **[Getting Started](./getting-started.md)** — Initial setup and configuration
- **[Scheduler](./schedule.md)** — Automated timing and execution
- **[Diagnostics](./diagnostics.md)** — Error capture and debugging
- **[Security](./security.md)** — Privacy and data protection