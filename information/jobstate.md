# Job State Persistence

Job state persistence allows the script to resume interrupted tasks and track progress across multiple runs.

## Configuration

Add to your `src/config.json`:

```json
{
  "jobState": {
    "enabled": true,
    "dir": ""
  }
}
```

## Options

| Setting | Description | Default |
|---------|-------------|---------|
| `enabled` | Enable job state persistence | `true` |
| `dir` | Custom directory for state files | `""` (uses `<sessionPath>/job-state`) |

## How It Works

### State Tracking
- Monitors completion status of individual activities
- Tracks daily set, search, and promotional task progress
- Prevents duplicate work when script restarts

### Storage Structure
```
sessions/job-state/
├── account1@email.com/
│   ├── daily-set-2025-09-20.json
│   ├── desktop-search-2025-09-20.json
│   └── mobile-search-2025-09-20.json
└── account2@email.com/
    └── ...
```

### State File Format
```json
{
  "date": "2025-09-20",
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
  "lastUpdate": "2025-09-20T10:30:00.000Z"
}
```

## Features

### Resumable Tasks
- Script restarts pick up where they left off
- Individual task completion is remembered
- Avoids re-doing completed activities

### Daily Reset
- State files are date-specific
- New day automatically starts fresh tracking
- Old state files are preserved for history

### Per-Account Isolation
- Each account maintains separate state
- Parallel processing doesn't interfere with state
- Account-specific progress tracking

## Use Cases

### Interrupted Executions
- Network connectivity issues
- System reboots or crashes
- Manual script termination
- Resource exhaustion recovery

### Selective Reruns
- Skip completed daily sets
- Resume partial search sessions
- Retry only failed promotional tasks
- Targeted account processing

### Progress Monitoring
- Track completion rates across accounts
- Identify problematic activities
- Monitor task duration trends
- Debug stuck or slow tasks

## Technical Implementation

### Checkpoint Strategy
- State saved after each completed activity
- Atomic file writes prevent corruption
- Lock-free design for concurrent access

### Performance Optimization
- Minimal file I/O overhead
- In-memory state caching
- Lazy loading of state files

### Error Handling
- Corrupted state files are rebuilt
- Missing directories created automatically
- Graceful degradation when disabled

## File Management

### Automatic Cleanup
- Old state files remain for reference
- Manual cleanup recommended for storage management
- No automatic deletion to preserve history

### Manual Maintenance
```bash
# Clean state files older than 7 days
find sessions/job-state -name "*.json" -mtime +7 -delete

# Reset all job state (start fresh)
rm -rf sessions/job-state/

# Reset specific account state
rm -rf sessions/job-state/user@email.com/
```

## Best Practices

### Development
- Enable for consistent testing behavior
- Clear state between major script changes
- Monitor state files for debugging

### Production
- Always keep enabled for reliability
- Regular state directory backups
- Monitor disk usage growth

### Troubleshooting
- Check state files when tasks seem to skip
- Clear corrupt state files if behavior is unexpected
- Verify write permissions to state directory

## Integration with Other Features

### Session Persistence
- Works alongside browser session storage
- Complements cookie and fingerprint persistence
- Independent of proxy and authentication state

### Clustering
- Each cluster worker maintains isolated state
- No shared state between parallel processes
- Worker-specific state directories

### Scheduling
- State persists across scheduled runs
- Daily tasks reset automatically at midnight
- Long-running schedules maintain continuity

## Debugging Job State

### State Inspection
```bash
# View current state for account
cat sessions/job-state/user@email.com/daily-set-2025-09-20.json

# List all state files
find sessions/job-state -name "*.json" -ls
```

### Common Issues

**Tasks not resuming:**
- Check state file permissions
- Verify date formatting in state files
- Ensure state directory exists and is writable

**Duplicate task execution:**
- State files may be corrupted or missing
- Clock synchronization issues
- Concurrent access conflicts

**Excessive state files:**
- Old files accumulating over time
- Implement regular cleanup schedule
- Monitor disk space usage

## Disabling Job State

To disable job state persistence:

```json
{
  "jobState": {
    "enabled": false
  }
}
```

**Effects:**
- Tasks will restart from beginning each run
- No progress tracking between sessions
- Potential duplicate work on interruptions
- Slightly faster startup (no state loading)