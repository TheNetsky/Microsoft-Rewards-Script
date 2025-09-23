# Conclusion Webhook

The conclusion webhook sends a comprehensive summary notification at the end of each script execution, providing a complete overview of the session's results across all accounts.

## What is the Conclusion Webhook?

The conclusion webhook is a Discord webhook integration that sends a detailed summary message after all accounts have completed their Microsoft Rewards tasks. It provides:

- **Session Overview**: Total accounts processed, success/failure counts
- **Points Summary**: Starting points, earned points, final totals
- **Performance Metrics**: Execution times, efficiency statistics
- **Error Reporting**: Issues encountered during execution
- **Buy Mode Detection**: Point spending alerts and tracking

## Configuration

Add to your `src/config.json`:

```json
{
  "notifications": {
    "conclusionWebhook": {
      "enabled": true,
      "url": "https://discord.com/api/webhooks/123456789/abcdef-webhook-token-here"
    }
  }
}
```

## Options

| Setting | Description | Example |
|---------|-------------|---------|
| `enabled` | Enable conclusion webhook | `true` |
| `url` | Discord webhook URL | Full webhook URL from Discord |

## Discord Webhook Setup

### Step 1: Create Webhook in Discord

1. **Open Discord** and go to your server
2. **Right-click** on the channel where you want notifications
3. **Select "Edit Channel"**
4. **Go to "Integrations" tab**
5. **Click "Create Webhook"**
6. **Configure webhook**:
   - Name: "MSN Rewards Summary"
   - Avatar: Upload rewards icon (optional)
   - Channel: Select appropriate channel
7. **Copy webhook URL**

### Step 2: Configure in Script

```json
{
  "notifications": {
    "conclusionWebhook": {
      "enabled": true,
      "url": "YOUR_COPIED_WEBHOOK_URL_HERE"
    }
  }
}
```

### Step 3: Test Configuration

Run the script with conclusion webhook enabled to verify the setup works correctly.

## Message Format

### Rich Embed Summary

The conclusion webhook sends a rich Discord embed with:

**Header Section:**
- 🎯 Microsoft Rewards Summary title
- Timestamp of completion
- Total execution time

**Account Statistics:**
```
📊 Accounts: 3 • 0 with issues
```

**Points Overview:**
```
💎 Points: 15,230 → 16,890 (+1,660)
```

**Performance Metrics:**
```
⏱️ Average Duration: 8m 32s
📈 Cumulative Runtime: 25m 36s
```

**Buy Mode Detection (if applicable):**
```
💳 Buy Mode Activity Detected
Total Spent: 1,200 points across 2 accounts
```

### Detailed Account Breakdown

For each account processed:

```
👤 user@example.com
Points: 5,420 → 6,140 (+720)
Duration: 7m 23s
Status: ✅ Completed successfully
```

With errors:
```
👤 problem@example.com  
Points: 3,210 → 3,210 (+0)
Duration: 2m 15s
Status: ❌ Failed - Login timeout
```

### Buy Mode Alerts

When point spending is detected:

```
💳 Buy Mode Activity
Account: spender@example.com
Session Spent: 500 points
Total Available: 12,500 points
Activities: Search completed, Quiz skipped
```

## Error Handling

### Network Failures
- Webhook failures don't stop script execution
- Failed webhooks are logged to console
- Retries are not performed (fire-and-forget)

### Invalid Webhook URLs
- Malformed URLs are caught and logged
- Script continues normal execution
- Error is reported in logs

### Discord Rate Limits
- Single webhook per session prevents rate limiting
- Large payloads are automatically truncated
- Delivery is typically instantaneous

## Advanced Configuration

### Multiple Webhooks

Different webhooks for different purposes:

```json
{
  "notifications": {
    "webhook": {
      "enabled": true,
      "url": "https://discord.com/api/webhooks/.../errors-channel"
    },
    "conclusionWebhook": {
      "enabled": true,
      "url": "https://discord.com/api/webhooks/.../summary-channel"
    }
  }
}
```

### Channel Organization

**Recommended Discord channel structure:**
- `#rewards-errors`: Real-time error notifications (webhook)
- `#rewards-summary`: End-of-run summaries (conclusionWebhook)
- `#rewards-logs`: Detailed text logs (manual uploads)

### Webhook Security

**Best Practices:**
- Use dedicated Discord server for notifications
- Limit webhook permissions to specific channels
- Regenerate webhook URLs if compromised
- Don't share webhook URLs publicly

## Integration with Other Notifications

### Webhook vs Conclusion Webhook

| Feature | Webhook | Conclusion Webhook |
|---------|---------|-------------------|
| **Timing** | Real-time during execution | End of session only |
| **Content** | Errors, warnings, progress | Comprehensive summary |
| **Frequency** | Multiple per session | One per session |
| **Purpose** | Immediate alerts | Session overview |

### Combined Setup

**Recommended configuration for comprehensive monitoring:**

```json
{
  "notifications": {
    "webhook": {
      "enabled": true,
      "url": "https://discord.com/api/webhooks/.../real-time"
    },
    "conclusionWebhook": {
      "enabled": true,
      "url": "https://discord.com/api/webhooks/.../summary"
    },
    "ntfy": {
      "enabled": true,
      "url": "https://ntfy.sh",
      "topic": "rewards-mobile"
    }
  }
}
```

**Benefits:**
- **Real-time webhook**: Immediate error alerts
- **Conclusion webhook**: Comprehensive session summary
- **NTFY**: Mobile notifications for critical issues

## Message Examples

### Successful Session

```discord
🎯 Microsoft Rewards Summary

📊 Accounts: 3 • 0 with issues
💎 Points: 15,230 → 16,890 (+1,660)
⏱️ Average Duration: 8m 32s
📈 Cumulative Runtime: 25m 36s

👤 user1@example.com
Points: 5,420 → 6,140 (+720)
Duration: 7m 23s
Status: ✅ Completed successfully

👤 user2@example.com
Points: 4,810 → 5,750 (+940)
Duration: 9m 41s
Status: ✅ Completed successfully

👤 user3@example.com
Points: 5,000 → 5,000 (+0)
Duration: 8m 32s
Status: ✅ Completed successfully
```

### Session with Issues

```discord
🎯 Microsoft Rewards Summary

📊 Accounts: 3 • 1 with issues
💎 Points: 15,230 → 15,950 (+720)
⏱️ Average Duration: 6m 15s
📈 Cumulative Runtime: 18m 45s

👤 user1@example.com
Points: 5,420 → 6,140 (+720)
Duration: 7m 23s
Status: ✅ Completed successfully

👤 user2@example.com
Points: 4,810 → 4,810 (+0)
Duration: 2m 15s
Status: ❌ Failed - Login timeout

👤 user3@example.com
Points: 5,000 → 5,000 (+0)
Duration: 9m 07s
Status: ⚠️ Partially completed - Quiz failed
```

### Buy Mode Detection

```discord
🎯 Microsoft Rewards Summary

📊 Accounts: 2 • 0 with issues
💎 Points: 25,500 → 24,220 (-1,280)
💳 Buy Mode Activity Detected
Total Spent: 1,500 points across 1 account

👤 buyer@example.com
Points: 15,000 → 13,500 (-1,500)
Duration: 12m 34s
Status: 💳 Buy mode detected
Activities: Purchase completed, searches skipped

👤 normal@example.com
Points: 10,500 → 10,720 (+220)
Duration: 8m 45s
Status: ✅ Completed successfully
```

## Troubleshooting

### Common Issues

**No summary received:**
- Check webhook URL is correct
- Verify Discord channel permissions
- Check script completed successfully
- Review console logs for errors

**Malformed messages:**
- Webhook URL might be invalid
- Discord server might be unavailable
- Check webhook hasn't been deleted

**Missing information:**
- Ensure all accounts completed processing
- Check for script errors during execution
- Verify conclusion webhook is enabled

### Testing

**Manual webhook test:**
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"content":"Test message from rewards script"}' \
  "YOUR_WEBHOOK_URL_HERE"
```

**Script debug mode:**
```bash
DEBUG_REWARDS_VERBOSE=1 npm start
```

### Debug Information

Check console output for:
```
[INFO] Sending conclusion webhook...
[INFO] Conclusion webhook sent successfully
```

Or error messages:
```
[ERROR] Failed to send conclusion webhook: Invalid webhook URL
```

## Performance Impact

### Minimal Overhead
- Single HTTP request at script end
- Non-blocking operation
- Payload size typically < 2KB
- Delivery time < 1 second

### Resource Usage
- No impact on account processing
- Minimal memory footprint
- No disk storage required
- Network bandwidth negligible

## Customization Options

### Message Content

The conclusion webhook automatically includes:
- Account processing results
- Points gained/lost per account
- Error summaries and warnings
- Buy mode activity detection
- Performance timing metrics

### Embed Formatting

Messages use Discord's rich embed format with:
- Color-coded status indicators
- Emoji icons for visual clarity
- Structured field layout
- Timestamp and duration info

### Channel Integration

Works with Discord features:
- Thread notifications
- Role mentions (configure in webhook)
- Message reactions and responses
- Search and archive functionality

## Privacy and Security

### Data Transmission
- Only summary statistics sent
- No sensitive account information
- No passwords or tokens transmitted
- Points and email addresses only

### Webhook Security
- Discord webhook URLs contain authentication
- No additional authentication required
- URLs should be kept private
- Can be regenerated if compromised

### Data Retention
- Discord stores messages per server settings
- No data stored by the script
- Messages can be deleted manually
- Webhook logs may be retained by Discord