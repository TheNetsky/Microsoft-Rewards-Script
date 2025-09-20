# Scheduling Configuration

Built-in scheduler for automated script execution at specified times without external cron jobs.

## Configuration

Add to your `src/config.json`:

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

## Options

| Setting | Description | Default | Example |
|---------|-------------|---------|---------|
| `enabled` | Enable built-in scheduler | `false` | `true` |
| `time` | Daily execution time (24-hour format) | `"09:00"` | `"14:30"` |
| `timeZone` | IANA timezone identifier | `"UTC"` | `"Europe/Paris"` |
| `runImmediatelyOnStart` | Execute once on process startup | `true` | `false` |
| `passesPerRun` | Number of complete runs per execution | `1` | `3` |

## How It Works

### Daily Scheduling
- Executes at the same time every day
- Timezone-aware scheduling
- Automatic adjustment for daylight saving time

### Startup Behavior
When `runImmediatelyOnStart` is `true`:
- **Started before scheduled time**: Runs immediately, then waits for next scheduled time
- **Started after scheduled time**: Runs immediately, then waits for next day's scheduled time

When `runImmediatelyOnStart` is `false`:
- Always waits for the next scheduled time
- No immediate execution regardless of start time

### Multiple Passes
- `passesPerRun` controls how many complete cycles to execute
- Each pass processes all accounts through all configured tasks
- Useful for maximum point collection

Note:
- `passesPerRun` s'applique au scheduler intégré (via `npm run start:schedule` ou `ts-schedule`).
- Si vous utilisez l'intégration Docker + cron externe, le nombre d'exécutions est contrôlé par `CRON_SCHEDULE`. Vous pouvez toujours utiliser le scheduler intégré à l'intérieur d'un conteneur en lançant `start:schedule` plutôt que `npm start` si vous préférez `passesPerRun`.

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
- Ensure no syntax errors in config.json

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
node -e "console.log(JSON.parse(require('fs').readFileSync('src/config.json')))"

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
- `passesPerRun` fonctionne (exécutera plusieurs passes à chaque horaire interne défini par `src/config.json`).
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