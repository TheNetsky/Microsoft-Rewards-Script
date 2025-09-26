# 📱 NTFY Push Notifications

<div align="center">

**🔔 Real-time push notifications to your devices**  
*Stay informed wherever you are*

</div>

---

## 🎯 What is NTFY?

NTFY is a **simple HTTP-based pub-sub notification service** that sends push notifications to your phone, desktop, or web browser. Perfect for real-time alerts about script events and errors.

### **Key Features**
- 📱 **Mobile & Desktop** — Push to any device
- 🆓 **Free & Open Source** — No vendor lock-in
- 🏠 **Self-hostable** — Complete privacy control
- ⚡ **Real-time delivery** — Instant notifications
- 🔒 **Authentication support** — Secure topics

### **Official Links**
- **Website** — [ntfy.sh](https://ntfy.sh)
- **Documentation** — [docs.ntfy.sh](https://docs.ntfy.sh)
- **GitHub** — [binwiederhier/ntfy](https://github.com/binwiederhier/ntfy)

---

## ⚙️ Configuration

### **Basic Setup**
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

### **Configuration Options**

| Setting | Description | Example |
|---------|-------------|---------|
| `enabled` | Enable NTFY notifications | `true` |
| `url` | NTFY server URL | `"https://ntfy.sh"` |
| `topic` | Notification topic name | `"rewards-script"` |
| `authToken` | Authentication token (optional) | `"tk_abc123..."` |

---

## 🚀 Setup Options

### **Option 1: Public Service (Easiest)**
```json
{
  "notifications": {
    "ntfy": {
      "enabled": true,
      "url": "https://ntfy.sh",
      "topic": "your-unique-topic-name"
    }
  }
}
```

**Pros:**
- ✅ No server setup required
- ✅ Always available  
- ✅ Free to use

**Cons:**
- ❌ Public server (less privacy)
- ❌ Rate limits apply
- ❌ Dependent on external service

### **Option 2: Self-Hosted (Recommended)**
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

**Self-Hosted Setup:**
```yaml
# docker-compose.yml
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

---

## 🔒 Authentication

### **When You Need Auth**
Authentication tokens are **optional** but required for:
- 🔐 **Private topics** with username/password
- 🏠 **Private NTFY servers** with authentication
- 🛡️ **Preventing spam** on your topic

### **Getting an Auth Token**

#### **Method 1: Command Line**
```bash
ntfy token
```

#### **Method 2: Web Interface**
1. Visit your NTFY server (e.g., `https://ntfy.sh`)
2. Go to **Account** section
3. Generate **new access token**

#### **Method 3: API**
```bash
curl -X POST -d '{"label":"rewards-script"}' \
  -H "Authorization: Bearer YOUR_LOGIN_TOKEN" \
  https://ntfy.sh/v1/account/tokens
```

### **Token Format**
- Tokens start with `tk_` (e.g., `tk_abc123def456...`)
- Use Bearer authentication format
- Tokens are permanent until revoked

---

## 📲 Receiving Notifications

### **Mobile Apps**
- **Android** — [NTFY on Google Play](https://play.google.com/store/apps/details?id=io.heckel.ntfy)
- **iOS** — [NTFY on App Store](https://apps.apple.com/app/ntfy/id1625396347)
- **F-Droid** — Available for Android

### **Desktop Options**
- **Web Interface** — Visit your NTFY server URL
- **Desktop Apps** — Available for Linux, macOS, Windows
- **Browser Extension** — Chrome/Firefox extensions

### **Setup Steps**
1. **Install** NTFY app on your device
2. **Add subscription** to your topic name
3. **Enter server URL** (if self-hosted)
4. **Test** with a manual message

---

## 🔔 Notification Types

### **Error Notifications**
**Priority:** Max 🚨 | **Trigger:** Script errors and failures
```
[ERROR] DESKTOP [LOGIN] Failed to login: Invalid credentials
```

### **Warning Notifications**
**Priority:** High ⚠️ | **Trigger:** Important warnings  
```
[WARN] MOBILE [SEARCH] Didn't gain expected points from search
```

### **Info Notifications**
**Priority:** Default 🏆 | **Trigger:** Important milestones
```
[INFO] MAIN [TASK] Started tasks for account user@email.com
```

### **Buy Mode Notifications**
**Priority:** High 💳 | **Trigger:** Point spending detected
```
💳 Spend detected (Buy Mode)
Account: user@email.com
Spent: -500 points
Current: 12,500 points
Session spent: 1,200 points
```

### **Conclusion Summary**
**End-of-run summary with rich formatting:**
```
🎯 Microsoft Rewards Summary
Accounts: 3 • 0 with issues
Total: 15,230 -> 16,890 (+1,660)
Average Duration: 8m 32s
Cumulative Runtime: 25m 36s
```

---

## 🤝 Integration with Discord

### **Complementary Setup**
Use **both** NTFY and Discord for comprehensive monitoring:

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

### **Coverage Comparison**

| Feature | NTFY | Discord |
|---------|------|---------|
| **Mobile push** | ✅ Instant | ❌ App required |
| **Rich formatting** | ❌ Text only | ✅ Embeds + colors |
| **Desktop alerts** | ✅ Native | ✅ App notifications |
| **Offline delivery** | ✅ Queued | ❌ Real-time only |
| **Self-hosted** | ✅ Easy | ❌ Complex |

---

## 🎛️ Advanced Configuration

### **Custom Topic Names**
Use descriptive, unique topic names:
```json
{
  "topic": "rewards-production-server1"
}
{
  "topic": "msn-rewards-home-pc"  
}
{
  "topic": "rewards-dev-testing"
}
```

### **Environment-Specific**
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

---

## 🧪 Testing & Debugging

### **Manual Test Message**
```bash
# Public server (no auth)
curl -d "Test message from rewards script" https://ntfy.sh/your-topic

# With authentication
curl -H "Authorization: Bearer tk_your_token" \
     -d "Authenticated test message" \
     https://ntfy.sh/your-topic
```

### **Script Debug Mode**
```powershell
$env:DEBUG_REWARDS_VERBOSE=1; npm start
```

### **Server Health Check**
```bash
# Check NTFY server status
curl -s https://ntfy.sh/v1/health

# List your topics (with auth)
curl -H "Authorization: Bearer tk_your_token" \
     https://ntfy.sh/v1/account/topics
```

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| **No notifications** | Check topic spelling; verify app subscription |
| **Auth failures** | Verify token format (`tk_`); check token validity |
| **Wrong server** | Test server URL in browser; check HTTPS/HTTP |
| **Rate limits** | Switch to self-hosted; reduce notification frequency |

### **Common Fixes**
- ✅ **Topic name** — Must match exactly between config and app
- ✅ **Server URL** — Include `https://` and check accessibility
- ✅ **Token format** — Must start with `tk_` for authentication
- ✅ **Network** — Verify firewall/proxy settings

---

## 🏠 Homelab Integration

### **Official Support**
NTFY is included in:
- **Debian Trixie** (testing)
- **Ubuntu** (latest versions)

### **Popular Integrations**
- **Sonarr/Radarr** — Download completion notifications
- **Prometheus** — Alert manager integration  
- **Home Assistant** — Automation notifications
- **Portainer** — Container status alerts

### **Docker Stack Example**
```yaml
version: '3.8'
services:
  ntfy:
    image: binwiederhier/ntfy
    container_name: ntfy
    ports:
      - "80:80"
    volumes:
      - ./ntfy-data:/var/lib/ntfy
    environment:
      - NTFY_BASE_URL=https://ntfy.yourdomain.com
    command: serve
    
  rewards:
    build: .
    depends_on:
      - ntfy
    environment:
      - NTFY_URL=http://ntfy:80
```

---

## 🔒 Privacy & Security

### **Public Server (ntfy.sh)**
- ⚠️ Messages pass through public infrastructure
- ⚠️ Topic names visible in logs
- ✅ Suitable for non-sensitive notifications

### **Self-Hosted Server**
- ✅ Complete control over data
- ✅ Private network deployment possible
- ✅ Recommended for sensitive information

### **Best Practices**
- 🔐 Use **unique, non-guessable** topic names
- 🔑 Enable **authentication** for sensitive notifications
- 🏠 Use **self-hosted server** for maximum privacy
- 🔄 **Regularly rotate** authentication tokens

### **Data Retention**
- 📨 Messages are **not permanently stored**
- ⏱️ Delivery attempts **retried** for short periods
- 🗑️ **No long-term** message history

---

## ⚡ Performance Impact

### **Script Performance**
- ✅ **Minimal overhead** — Fire-and-forget notifications
- ✅ **Non-blocking** — Failed notifications don't affect script
- ✅ **Asynchronous** — No execution delays

### **Network Usage**
- 📊 **Low bandwidth** — Text-only messages
- ⚡ **HTTP POST** — Simple, efficient protocol
- 🔄 **Retry logic** — Automatic failure recovery

---

## 🔗 Related Guides

- **[Discord Webhooks](./conclusionwebhook.md)** — Rich notification embeds
- **[Getting Started](./getting-started.md)** — Initial setup and configuration
- **[Buy Mode](./buy-mode.md)** — Manual purchasing notifications
- **[Security](./security.md)** — Privacy and data protection