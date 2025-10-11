# ⏰ Scheduler & Automation

<div align="center">

**🚀 Built-in scheduler for automated daily execution**  
*Set it and forget it*

</div>

---

## 🎯 What is the Scheduler?

The built-in scheduler provides **automated script execution** at specified times without requiring external cron jobs or task schedulers.

### **Key Features**
- 📅 **Daily automation** — Run at the same time every day
- 🌍 **Timezone aware** — Handles DST automatically
- 🔄 **Multiple passes** — Execute script multiple times per run
- 🏖️ **Vacation mode** — Skip random days monthly
- 🎲 **Jitter support** — Randomize execution times
- 📅 **Humanization off-days** — Weekly random skips (disable via `humanization.randomOffDaysPerWeek`)
- ⚡ **Immediate start** — Option to run on startup

---

## ⚙️ Configuration

### **Basic Setup**
```json
{
  "schedule": {
    "enabled": true,
    "time": "09:00",
    "timeZone": "America/New_York",
    "runImmediatelyOnStart": true
  },
  "passesPerRun": 2
}
```

### **Advanced Setup with Vacation Mode**
```json
{
  "schedule": {
    "enabled": true,
    "time": "10:00",
    "timeZone": "Europe/Paris",
    "runImmediatelyOnStart": false
  },
  "passesPerRun": 3,
  "vacation": {
    "enabled": true,
    "minDays": 3,
    "maxDays": 5
  }
}
```

### **Configuration Options**

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `false` | Enable built-in scheduler |
| `time` | `"09:00"` | Daily execution time (24-hour format) |
| `timeZone` | `"UTC"` | IANA timezone identifier |
| `runImmediatelyOnStart` | `true` | Execute once on process startup |
| `passesPerRun` | `1` | Number of complete runs per execution |
| `vacation.enabled` | `false` | Skip random monthly off-block |
| `vacation.minDays` | `3` | Minimum vacation days |
| `vacation.maxDays` | `5` | Maximum vacation days |
| `cron` | `undefined` | Optional cron expression (string or array) for advanced scheduling |

### **Cron Expressions (Advanced)**

You can now drive the scheduler with classic cron syntax instead of a single daily time. Provide either a string or an array in `schedule.cron`.

```json
{
  "schedule": {
    "enabled": true,
    "cron": [
      "0 7 * * *",      // every day at 07:00
      "30 19 * * 1-5"    // weekdays at 19:30
    ],
    "timeZone": "Europe/Paris"
  }
}
```

- Supports 5-field and 6-field cron expressions (`second minute hour day month weekday`).
- When `cron` is set, the legacy `time`, `time12`, `time24`, and daily jitter env vars are ignored.
- The scheduler still honors vacation mode, weekly random off-days, run-on-start, and watchdog features.

---

## 🚀 How It Works

### **Daily Scheduling**
1. **Calculate next run** — Timezone-aware scheduling
2. **Wait until time** — Minimal resource usage
3. **Execute passes** — Run script specified number of times
4. **Schedule next day** — Automatic DST adjustment

### **Startup Behavior**

#### **Immediate Start Enabled (`true`)**
- **Before scheduled time** → Run immediately + wait for next scheduled time
- **After scheduled time** → Run immediately + wait for tomorrow's time

#### **Immediate Start Disabled (`false`)**
- **Any time** → Always wait for next scheduled time

### **Multiple Passes**
- Each pass processes **all accounts** through **all tasks**
- Useful for **maximum point collection**
- Higher passes = **more points** but **increased detection risk**

---

## 🏖️ Vacation Mode

### **Monthly Off-Blocks**
Vacation mode randomly selects a **contiguous block of days** each month to skip execution.

### **Configuration**
```json
{
  "vacation": {
    "enabled": true,
    "minDays": 3,
    "maxDays": 5
  }
}
```

### **How It Works**
- **Random selection** — Different days each month
- **Contiguous block** — Skip consecutive days, not scattered
- **Independent** — Works with weekly random off-days
- **Logged** — Shows selected vacation period

### **Example Output**
```
[SCHEDULE] Selected vacation block this month: 2025-01-15 → 2025-01-18
[SCHEDULE] Skipping run - vacation mode (3 days remaining)
```

---

## 🌍 Supported Timezones

### **North America**
- `America/New_York` — Eastern Time
- `America/Chicago` — Central Time  
- `America/Denver` — Mountain Time
- `America/Los_Angeles` — Pacific Time
- `America/Phoenix` — Arizona (no DST)

### **Europe**
- `Europe/London` — GMT/BST
- `Europe/Paris` — CET/CEST
- `Europe/Berlin` — CET/CEST
- `Europe/Rome` — CET/CEST
- `Europe/Moscow` — MSK

### **Asia Pacific**
- `Asia/Tokyo` — JST
- `Asia/Shanghai` — CST
- `Asia/Kolkata` — IST
- `Australia/Sydney` — AEST/AEDT
- `Pacific/Auckland` — NZST/NZDT

---

## 🎲 Randomization & Watchdog

### **Environment Variables**
```powershell
# Add random delay before first run (5-20 minutes)
$env:SCHEDULER_INITIAL_JITTER_MINUTES_MIN=5
$env:SCHEDULER_INITIAL_JITTER_MINUTES_MAX=20

# Add daily jitter to scheduled time (2-10 minutes)
$env:SCHEDULER_DAILY_JITTER_MINUTES_MIN=2
$env:SCHEDULER_DAILY_JITTER_MINUTES_MAX=10

# Kill stuck passes after N minutes
$env:SCHEDULER_PASS_TIMEOUT_MINUTES=180

# Run each pass in separate process (recommended)
$env:SCHEDULER_FORK_PER_PASS=true
```

### **Benefits**
- **Avoid patterns** — Prevents exact-time repetition
- **Protection** — Kills stuck processes
- **Isolation** — Process separation for stability

---

## 🖥️ Running the Scheduler

### **Development Mode**
```powershell
npm run ts-schedule
```

### **Production Mode**
```powershell
npm run build
npm run start:schedule
```

### **Background Execution**
```powershell
# Windows Background (PowerShell)
Start-Process -NoNewWindow -FilePath "npm" -ArgumentList "run", "start:schedule"

# Alternative: Windows Task Scheduler (recommended)
# Create scheduled task via GUI or schtasks command
```

---

## 📊 Usage Examples

### **Basic Daily Automation**
```json
{
  "schedule": {
    "enabled": true,
    "time": "08:00",
    "timeZone": "America/New_York"
  }
}
```
⏰ **Perfect for morning routine** — Catch daily resets

### **Multiple Daily Passes**
```json
{
  "schedule": {
    "enabled": true,
    "time": "10:00",
    "timeZone": "Europe/London",
    "runImmediatelyOnStart": false
  },
  "passesPerRun": 3
}
```
🔄 **Maximum points** with higher detection risk

### **Conservative with Vacation**
```json
{
  "schedule": {
    "enabled": true,
    "time": "20:00",
    "timeZone": "America/Los_Angeles"
  },
  "passesPerRun": 1,
  "vacation": {
    "enabled": true,
    "minDays": 4,
    "maxDays": 6
  }
}
```
🏖️ **Natural patterns** with monthly breaks

---

## 🐳 Docker Integration

### **Built-in Scheduler (Recommended)**
```yaml
services:
  microsoft-rewards-script:
    build: .
    environment:
      TZ: Europe/Paris
    command: ["npm", "run", "start:schedule"]
```
- Uses `passesPerRun` from config
- Single long-running process
- No external cron needed

### **External Cron (Project Default)**
```yaml
services:
  microsoft-rewards-script:
    build: .
    environment:
      CRON_SCHEDULE: "0 7,16,20 * * *"
      RUN_ON_START: "true"
```
- Uses `run_daily.sh` with random delays
- Multiple cron executions
- Lockfile prevents overlaps

---

## 📋 Logging Output

### **Scheduler Initialization**
```
[SCHEDULE] Scheduler initialized for daily 09:00 America/New_York
[SCHEDULE] Next run scheduled for 2025-01-21 09:00:00 EST
```

### **Daily Execution**
```
[SCHEDULE] Starting scheduled run (pass 1 of 2)
[SCHEDULE] Completed scheduled run in 12m 34s
[SCHEDULE] Next run scheduled for 2025-01-22 09:00:00 EST
```

### **Time Calculations**
```
[SCHEDULE] Current time: 2025-01-20 15:30:00 EDT
[SCHEDULE] Target time: 2025-01-21 09:00:00 EDT  
[SCHEDULE] Waiting 17h 30m until next run
```

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| **Scheduler not running** | Check `enabled: true`; verify timezone format |
| **Wrong execution time** | Verify system clock; check DST effects |
| **Memory growth** | Restart process weekly; monitor logs |
| **Missed executions** | Check system sleep/hibernation; verify process |

### **Debug Commands**
```powershell
# Test timezone calculation
node -e "console.log(new Date().toLocaleString('en-US', {timeZone: 'America/New_York'}))"

# Verify config syntax
node -e "const fs=require('fs');const strip=input=>{let out='',inString=false,stringChar='',inLine=false,inBlock=false;for(let i=0;i<input.length;i++){const ch=input[i],next=input[i+1];if(inLine){if(ch==='\n'||ch==='\r'){inLine=false;out+=ch;}continue;}if(inBlock){if(ch==='*'&&next==='/' ){inBlock=false;i++;}continue;}if(inString){out+=ch;if(ch==='\\'){i++;if(i<input.length)out+=input[i];continue;}if(ch===stringChar)inString=false;continue;}if(ch==='"'||ch==='\''){inString=true;stringChar=ch;out+=ch;continue;}if(ch==='/'&&next==='/' ){inLine=true;i++;continue;}if(ch==='/'&&next==='*' ){inBlock=true;i++;continue;}out+=ch;}return out;};console.log(JSON.parse(strip(fs.readFileSync('src/config.jsonc','utf8'))));"

# Check running processes
Get-Process | Where-Object {$_.ProcessName -eq "node"}
```

---

## ⚡ Performance & Best Practices

### **Optimal Timing**
- **🌅 Morning (7-10 AM)** — Catch daily resets
- **🌆 Evening (7-10 PM)** — Complete remaining tasks  
- **❌ Avoid peak hours** — Reduce detection during high traffic

### **Pass Recommendations**
- **1 pass** — Safest, good for most users
- **2-3 passes** — Balance of points vs. risk
- **4+ passes** — Higher risk, development only

### **Monitoring**
- ✅ Check logs regularly for errors
- ✅ Monitor point collection trends  
- ✅ Verify scheduler status weekly

---

## 🔗 Alternative Solutions

### **Windows Task Scheduler**
```powershell
# Create scheduled task
schtasks /create /tn "MS-Rewards" /tr "npm start" /sc daily /st 09:00 /sd 01/01/2025
```

### **PowerShell Scheduled Job**
```powershell
# Register scheduled job
Register-ScheduledJob -Name "MSRewards" -ScriptBlock {cd "C:\path\to\project"; npm start} -Trigger (New-JobTrigger -Daily -At 9am)
```

---

## 🔗 Related Guides

- **[Getting Started](./getting-started.md)** — Initial setup and configuration
- **[Humanization](./humanization.md)** — Natural behavior patterns
- **[Docker](./docker.md)** — Container deployment
- **[Job State](./jobstate.md)** — Execution state management

## Usage Examples

### Basic Daily Run
```json
{
  "schedule": {
    "enabled": true,
    "time": "08:00",
    "timeZone": "America/New_York"
  }
}
```

### Multiple Daily Passes
```json
{
  "schedule": {
    "enabled": true,
    "time": "10:00",
    "timeZone": "Europe/London",
    "runImmediatelyOnStart": false
  },
  "passesPerRun": 3
}
```

### Development Testing
```json
{
  "schedule": {
    "enabled": true,
    "time": "00:01",
    "timeZone": "UTC",
    "runImmediatelyOnStart": true
  }
}
```

## Supported Timezones

Common IANA timezone identifiers:

### North America
- `America/New_York` (Eastern Time)
- `America/Chicago` (Central Time)
- `America/Denver` (Mountain Time)
- `America/Los_Angeles` (Pacific Time)
- `America/Phoenix` (Arizona - no DST)

### Europe
- `Europe/London` (GMT/BST)
- `Europe/Paris` (CET/CEST)
- `Europe/Berlin` (CET/CEST)
- `Europe/Rome` (CET/CEST)
- `Europe/Moscow` (MSK)

### Asia Pacific
- `Asia/Tokyo` (JST)
- `Asia/Shanghai` (CST)
- `Asia/Kolkata` (IST)
- `Australia/Sydney` (AEST/AEDT)
- `Pacific/Auckland` (NZST/NZDT)

### UTC Variants
- `UTC` (Coordinated Universal Time)
- `GMT` (Greenwich Mean Time)

## Running the Scheduler

### Development Mode
```bash
npm run ts-schedule
```

### Production Mode
```bash
npm run build
npm run start:schedule
```

### Optional Randomization and Watchdog

You can introduce slight randomness to the start times and protect against stuck runs:

- `SCHEDULER_INITIAL_JITTER_MINUTES_MIN` / `SCHEDULER_INITIAL_JITTER_MINUTES_MAX`
  - Adds a one‑time random delay before the very first run after the scheduler starts.
  - Example: `SCHEDULER_INITIAL_JITTER_MINUTES_MIN=5` and `SCHEDULER_INITIAL_JITTER_MINUTES_MAX=20` delays the first run by 5–20 minutes.

- `SCHEDULER_DAILY_JITTER_MINUTES_MIN` / `SCHEDULER_DAILY_JITTER_MINUTES_MAX`
  - Adds an extra random delay to each daily scheduled execution.
  - Example: 2–10 minutes of daily jitter to avoid exact same second each day.

- `SCHEDULER_PASS_TIMEOUT_MINUTES`
  - Kills a stuck pass after N minutes (default 180). Useful if the underlying browser gets stuck.

- `SCHEDULER_FORK_PER_PASS`
  - Defaults to `true`. When `true`, each pass runs in a child Node process so a stuck pass can be terminated without killing the scheduler. Set to `false` to run passes in‑process (not recommended).

### Background Execution
```bash
# Linux/macOS (background process)
nohup npm run start:schedule > schedule.log 2>&1 &

# Windows (background service - requires additional setup)
# Recommend using Task Scheduler or Windows Service wrapper
```

## Process Management

### Long-Running Process
- Scheduler runs continuously
- Automatically handles timezone changes
- Graceful handling of system clock adjustments

### Memory Management
- Minimal memory footprint between runs
- Garbage collection after each execution
- No memory leaks in long-running processes

### Error Recovery
- Failed runs don't affect future scheduling
- Automatic retry on next scheduled time
- Error logging for troubleshooting

## Logging Output

### Scheduler Events
```
[SCHEDULE] Scheduler initialized for daily 09:00 America/New_York
[SCHEDULE] Next run scheduled for 2025-09-21 09:00:00 EST
[SCHEDULE] Starting scheduled run (pass 1 of 2)
[SCHEDULE] Completed scheduled run in 12m 34s
[SCHEDULE] Next run scheduled for 2025-09-22 09:00:00 EST
```

### Time Calculations
```
[SCHEDULE] Current time: 2025-09-20 15:30:00 EDT
[SCHEDULE] Target time: 2025-09-21 09:00:00 EDT
[SCHEDULE] Waiting 17h 30m until next run
```

## Integration with Other Features

### Docker Compatibility
- Scheduler works in Docker containers
- Alternative to external cron jobs
- Timezone handling in containerized environments

### Buy Mode Exclusion
- Scheduler only runs automation mode
- Buy mode (`-buy`) ignores scheduler settings
- Manual executions bypass scheduler

### Clustering
- Scheduler runs only in single-process mode
- Clustering disabled when scheduler is active
- Use scheduler OR clustering, not both

## Best Practices

### Optimal Timing
- **Morning runs**: Catch daily resets and new activities
- **Evening runs**: Complete remaining tasks before midnight
- **Avoid peak hours**: Reduce detection risk during high traffic

### Timezone Selection
- Use your local timezone for easier monitoring
- Consider Microsoft Rewards server timezone
- Account for daylight saving time changes

### Multiple Passes
- **2-3 passes**: Good balance of points vs. detection risk
- **More passes**: Higher detection risk
- **Single pass**: Safest but may miss some points

### Monitoring
- Check logs regularly for errors
- Monitor point collection trends
- Verify scheduler is running as expected

## Troubleshooting

### Common Issues

**Scheduler not running:**
- Check `enabled: true` in config
- Verify timezone format is correct
- Ensure no syntax errors in config.jsonc (remember it allows comments)

**Wrong execution time:**
- Verify system clock is accurate
- Check timezone identifier spelling
- Consider daylight saving time effects

**Memory growth over time:**
- Restart scheduler process weekly
- Monitor system resource usage
- Check for memory leaks in logs

**Missed executions:**
- System was sleeping/hibernating
- Process was killed or crashed
- Clock was adjusted significantly

### Debug Commands
```bash
# Test timezone calculation
node -e "console.log(new Date().toLocaleString('en-US', {timeZone: 'America/New_York'}))"

# Verify config syntax
node -e "const fs=require('fs');const strip=input=>{let out='',inString=false,stringChar='',inLine=false,inBlock=false;for(let i=0;i<input.length;i++){const ch=input[i],next=input[i+1];if(inLine){if(ch==='\n'||ch==='\r'){inLine=false;out+=ch;}continue;}if(inBlock){if(ch==='*'&&next==='/' ){inBlock=false;i++;}continue;}if(inString){out+=ch;if(ch==='\\'){i++;if(i<input.length)out+=input[i];continue;}if(ch===stringChar)inString=false;continue;}if(ch==='"'||ch==='\''){inString=true;stringChar=ch;out+=ch;continue;}if(ch==='/'&&next==='/' ){inLine=true;i++;continue;}if(ch==='/'&&next==='*' ){inBlock=true;i++;continue;}out+=ch;}return out;};console.log(JSON.parse(strip(fs.readFileSync('src/config.jsonc','utf8'))));"

# Check process status
ps aux | grep "start:schedule"
```

## Alternative Solutions

### External Cron (Linux/macOS)
```bash
# Crontab entry for 9 AM daily
0 9 * * * cd /path/to/MSN-V2 && npm start

# Multiple times per day
0 9,15,21 * * * cd /path/to/MSN-V2 && npm start
```

### Windows Task Scheduler
- Create scheduled task via Task Scheduler
- Set trigger for daily execution
- Configure action to run `npm start` in project directory

### Docker Cron
```dockerfile
# Add to Dockerfile
RUN apt-get update && apt-get install -y cron
COPY crontab /etc/cron.d/rewards-cron
RUN crontab /etc/cron.d/rewards-cron
```

### Docker + Built-in Scheduler
Au lieu d'utiliser cron, vous pouvez lancer le scheduler intégré dans le conteneur (un seul process long‑vivant) :

```yaml
services:
  microsoft-rewards-script:
    build: .
    environment:
      TZ: Europe/Paris
    command: ["npm", "run", "start:schedule"]
```

Dans ce mode :
- `passesPerRun` fonctionne (exécutera plusieurs passes à chaque horaire interne défini par `src/config.jsonc`).
- Vous n'avez plus besoin de `CRON_SCHEDULE` ni de `run_daily.sh`.

### Docker + External Cron (par défaut du projet)
Si vous préférez la planification par cron système dans le conteneur (valeur par défaut du projet) :
- Utilisez `CRON_SCHEDULE` (ex.: `0 7,16,20 * * *`).
- `run_daily.sh` introduit un délai aléatoire (par défaut 5–50 min) et un lockfile pour éviter les chevauchements.
- `RUN_ON_START=true` déclenche une exécution immédiate au démarrage du conteneur (sans délai aléatoire).

## Performance Considerations

### System Resources
- Minimal CPU usage between runs
- Low memory footprint when idle
- No network activity during waiting periods

### Startup Time
- Fast initialization (< 1 second)
- Quick timezone calculations
- Immediate scheduling of next run

### Reliability
- Robust error handling
- Automatic recovery from failures
- Consistent execution timing