# Diagnostics Configuration

The diagnostics system automatically captures error screenshots and HTML snapshots when issues occur during script execution.

## Configuration

Add to your `src/config.json`:

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

## Options

| Setting | Description | Default |
|---------|-------------|---------|
| `enabled` | Master toggle for diagnostics capture | `true` |
| `saveScreenshot` | Capture PNG screenshots on errors | `true` |
| `saveHtml` | Save page HTML content on errors | `true` |
| `maxPerRun` | Maximum captures per script run | `2` |
| `retentionDays` | Auto-delete reports older than N days | `7` |

## How It Works

### Automatic Capture
- Triggers on unhandled errors during browser automation
- Captures both visual (PNG) and structural (HTML) data
- Rate-limited to prevent storage bloat

### Storage Structure
```
reports/
├── 2025-09-20/
│   ├── error_abc123_001.png
│   ├── error_abc123_001.html
│   ├── error_def456_002.png
│   └── error_def456_002.html
└── 2025-09-21/
    └── ...
```

### File Naming
- `error_[runId]_[sequence].[ext]`
- RunId: Unique identifier for each script execution
- Sequence: Incremental counter (001, 002, etc.)

## Retention Management

### Automatic Cleanup
- Runs after each script completion
- Deletes entire date folders older than `retentionDays`
- Prevents unlimited disk usage growth

### Manual Cleanup
```bash
# Remove all diagnostic reports
rm -rf reports/

# Remove reports older than 3 days (Linux/macOS)
find reports/ -type d -mtime +3 -exec rm -rf {} \;
```

## Use Cases

### Development & Debugging
- Visual confirmation of page state during errors
- HTML source analysis for element detection issues
- Timeline reconstruction of automation failures

### Production Monitoring
- Evidence collection for account suspension investigations
- Performance bottleneck identification
- Automated error reporting with visual context

## Performance Impact

### Minimal Overhead
- Only activates during error conditions
- Asynchronous capture doesn't block script execution
- Configurable limits prevent resource exhaustion

### Storage Considerations
- Screenshots: ~100-500KB each
- HTML files: ~50-200KB each
- Daily cleanup prevents accumulation

## Best Practices

### Development
- Keep `enabled: true` for troubleshooting
- Increase `maxPerRun` for intensive debugging sessions
- Review captures after script modifications

### Production
- Enable for critical error visibility
- Set conservative `maxPerRun` (1-3)
- Configure shorter `retentionDays` for space management

### Privacy & Security
- Captures may contain account information
- Secure storage location recommended
- Regular cleanup for sensitive environments

## Troubleshooting

### Common Issues

**No captures despite errors:**
- Check `enabled: true` in config
- Verify write permissions to `reports/` directory
- Ensure error occurs during browser automation (not startup)

**Excessive storage usage:**
- Reduce `maxPerRun` value
- Decrease `retentionDays`
- Check for runaway error loops

**Missing screenshots:**
- Verify browser supports screenshot API
- Check headless mode compatibility
- Ensure sufficient system memory

### Debug Mode
Enable verbose logging to see diagnostic activity:
```bash
DEBUG_REWARDS_VERBOSE=1 npm start
```

## Integration with Notifications

Diagnostic captures complement webhook notifications:
- Webhooks provide immediate error alerts
- Diagnostics provide visual evidence for investigation
- Combined approach offers complete error visibility

## Technical Details

### Capture Triggers
- Page navigation timeouts
- Element selector failures
- Authentication errors
- Network request failures
- JavaScript execution errors

### File Formats
- **PNG**: Standard screenshot format, widely supported
- **HTML**: Raw page source with inline styles preserved
- **UTF-8**: Text encoding for HTML files

### Concurrency Safety
- Thread-safe file naming with unique identifiers
- Atomic write operations prevent corruption
- Rate limiting prevents resource contention

## Community Error Reporting (opt-out)

To help improve the project, anonymized error summaries are sent by default to the public Discord channel when an error occurs. This enables the community to spot issues and propose fixes faster.

What is sent:
- Platform info (Windows/Linux/macOS), Node version, container/CI flags
- Short sanitized error message/stack (emails and secrets are redacted)
- Minimal runtime context (process id, origin label)

What is NOT sent:
- Account emails, passwords, cookies, or tokens
- Session files, IPs, or proxy addresses
- Any other personal or sensitive data

Configure in `src/config.json`:

```json
{
  "communityHelp": {
    "enabled": true,
    "minIntervalMs": 10000
  }
}
```

Set `enabled` to `false` to disable this feature entirely if your environment requires stricter isolation.