# NTFY Push Notifications

NTFY integration provides real-time push notifications to your devices for script events and errors.

## What is NTFY?

NTFY is a simple HTTP-based pub-sub notification service that sends push notifications to your phone, desktop, or web browser. It's open source, self-hostable, and has excellent integration with homelab services.

**Official Links:**
- **Website**: https://ntfy.sh
- **Documentation**: https://docs.ntfy.sh
- **GitHub**: https://github.com/binwiederhier/ntfy

## Configuration

Add to your `src/config.json`:

```json
{
  "notifications": {
    "ntfy": {
      "enabled": true,
      "url": "https://ntfy.sh",
      "topic": "rewards-script",
      "authToken": ""
    }
  }
}
```

## Options

| Setting | Description | Example |
|---------|-------------|---------|
| `enabled` | Enable NTFY notifications | `true` |
| `url` | NTFY server URL | `"https://ntfy.sh"` |
| `topic` | Notification topic name | `"rewards-script"` |
| `authToken` | Authentication token (optional) | `"tk_abc123..."` |

## Authentication Token

### When You Need It
Authentication tokens are **optional** and only required if:
- You've set a username/password on your topic
- You're using a private NTFY server with authentication
- You want to prevent others from sending to your topic

### How to Get a Token

**Method 1: Command Line**
```bash
ntfy token
```

**Method 2: Web Interface**
1. Visit your NTFY server (e.g., https://ntfy.sh)
2. Go to Account section
3. Generate new access token

**Method 3: API**
```bash
curl -X POST -d '{"label":"rewards-script"}' \
  -H "Authorization: Bearer YOUR_LOGIN_TOKEN" \
  https://ntfy.sh/v1/account/tokens
```

### Token Format
- Tokens start with `tk_` (e.g., `tk_abc123def456...`)
- Use Bearer authentication format
- Tokens are permanent until revoked

### Configuration with Token
```json
{
  "notifications": {
    "ntfy": {
      "enabled": true,
      "url": "https://ntfy.sh",
      "topic": "my-private-topic",
      "authToken": "tk_abc123def456ghi789jkl012"
    }
  }
}
```

## Setup Options

### Option 1: Public NTFY Service
**Easiest setup - no installation required**

```json
{
  "notifications": {
    "ntfy": {
      "enabled": true,
      "url": "https://ntfy.sh",
      "topic": "your-unique-topic-name",
      "authToken": ""
    }
  }
}
```

**Pros:**
- No server setup required
- Always available
- Free to use

**Cons:**
- Public server (less privacy)
- Rate limits apply
- Dependent on external service

### Option 2: Self-Hosted NTFY
**More control and privacy**

```json
{
  "notifications": {
    "ntfy": {
      "enabled": true,
      "url": "https://ntfy.yourdomain.com",
      "topic": "rewards",
      "authToken": "tk_your_token_here"
    }
  }
}
```

**Setup:**
```bash
# Docker Compose
version: '3.8'
services:
  ntfy:
    image: binwiederhier/ntfy
    container_name: ntfy
    ports:
      - "80:80"
    volumes:
      - ./data:/var/lib/ntfy
    command: serve
```

## Receiving Notifications

### Mobile Apps
- **Android**: [NTFY app on Google Play](https://play.google.com/store/apps/details?id=io.heckel.ntfy)
- **iOS**: [NTFY app on App Store](https://apps.apple.com/app/ntfy/id1625396347)
- **F-Droid**: Available for Android

### Desktop
- **Web Interface**: Visit your NTFY server URL
- **Desktop Apps**: Available for Linux, macOS, Windows
- **Browser Extension**: Chrome/Firefox extensions available

### Setup Steps
1. Install NTFY app on your device
2. Add subscription to your topic
3. Enter server URL (if self-hosted)
4. Test with a manual message

## Notification Types

### Error Notifications
**Priority**: Max (🚨)
**Trigger**: Script errors and failures
```
[ERROR] DESKTOP [LOGIN] Failed to login: Invalid credentials
```

### Warning Notifications  
**Priority**: High (⚠️)
**Trigger**: Important warnings
```
[WARN] MOBILE [SEARCH] Didn't gain expected points from search
```

### Info Notifications
**Priority**: Default (🏆)
**Trigger**: Important milestones
```
[INFO] MAIN [TASK] Started tasks for account user@email.com
```

### Buy Mode Notifications
**Priority**: High (💳)
**Trigger**: Point spending detected
```
💳 Spend detected (Buy Mode)
Account: user@email.com
Spent: -500 points
Current: 12,500 points
Session spent: 1,200 points
```

## Message Formatting

### Standard Messages
- Timestamp and process ID included
- Platform indicator (DESKTOP/MOBILE/MAIN)
- Activity type and details
- Clean formatting without color codes

### Conclusion Summary
**End-of-run summary with rich formatting:**
```
🎯 Microsoft Rewards Summary
Accounts: 3 • 0 with issues
Total: 15,230 -> 16,890 (+1,660)
Average Duration: 8m 32s
Cumulative Runtime: 25m 36s
```

## Integration with Other Notifications

### NTFY + Discord Webhooks
**Complementary setup for comprehensive monitoring:**
- **Discord**: Rich embeds with detailed information
- **NTFY**: Immediate mobile/desktop alerts
- **Both**: Comprehensive coverage

```json
{
  "notifications": {
    "webhook": {
      "enabled": true,
      "url": "https://discord.com/api/webhooks/..."
    },
    "conclusionWebhook": {
      "enabled": true,
      "url": "https://discord.com/api/webhooks/..."
    },
    "ntfy": {
      "enabled": true,
      "url": "https://ntfy.sh",
      "topic": "rewards-script"
    }
  }
}
```

## Advanced Configuration

### Custom Topic Names
Use descriptive, unique topic names:
```
rewards-production-server1
msn-rewards-home-pc
rewards-dev-testing
```

### Multiple Topics
Different notifications to different topics:
```json
{
  "notifications": {
    "ntfy": {
      "enabled": true,
      "url": "https://ntfy.sh",
      "topic": "rewards-errors",
      "authToken": "tk_errors_token"
    }
  }
}
```

### Server-Specific Configuration
```json
{
  "notifications": {
    "ntfy": {
      "enabled": true,
      "url": "https://ntfy.internal.lan",
      "topic": "homelab-rewards",
      "authToken": "tk_homelab_token"
    }
  }
}
```

## Troubleshooting

### Common Issues

**No notifications received:**
- Check topic name spelling
- Verify NTFY app subscription
- Test with manual curl command
- Check network connectivity

**Authentication failures:**
- Verify authToken format (starts with `tk_`)
- Check token hasn't been revoked
- Ensure topic requires authentication

**Wrong server URL:**
- Verify server is accessible
- Check HTTPS vs HTTP
- Test server in browser

### Testing NTFY

**Manual test message:**
```bash
# Public server (no auth)
curl -d "Test message from rewards script" https://ntfy.sh/your-topic

# With authentication
curl -H "Authorization: Bearer tk_your_token" \
     -d "Authenticated test message" \
     https://ntfy.sh/your-topic
```

**Test from script:**
```bash
# Enable debug logging
DEBUG_REWARDS_VERBOSE=1 npm start
```

### Debug Commands
```bash
# Check NTFY server status
curl -s https://ntfy.sh/v1/health

# List your topics (with auth)
curl -H "Authorization: Bearer tk_your_token" \
     https://ntfy.sh/v1/account/topics

# Test server connectivity
ping ntfy.sh
```

## Best Practices

### Security
- Use unique, non-guessable topic names
- Enable authentication for sensitive notifications
- Use self-hosted server for maximum privacy
- Regularly rotate authentication tokens

### Performance
- NTFY adds minimal overhead to script execution
- Notifications are fire-and-forget (non-blocking)
- Failed notifications don't affect script operation

### Organization
- Use consistent topic naming schemes
- Separate topics for different environments
- Document topic purposes for team use

## Homelab Integration

NTFY is officially included in:
- **Debian Trixie** (testing)
- **Ubuntu** (latest versions)

Popular homelab integrations:
- **Sonarr/Radarr**: Download completion notifications
- **Prometheus**: Alert manager integration
- **Home Assistant**: Automation notifications
- **Portainer**: Container status alerts

## Privacy Considerations

### Public Server (ntfy.sh)
- Messages pass through public infrastructure
- Topic names are visible in logs
- Consider for non-sensitive notifications only

### Self-Hosted Server
- Complete control over data
- Private network deployment possible
- Recommended for sensitive information

### Data Retention
- Messages are not permanently stored
- Delivery attempts are retried for short periods
- No long-term message history